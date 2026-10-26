#!/usr/bin/env node
// The bridge server: a queue of scripts between run.mjs and the Zumpo bridge
// plugin open in Figma desktop.
//
//   run.mjs ──POST /jobs──► server ◄──GET /next, POST /result, /pause── plugin
//
// It listens on 127.0.0.1 only. Queuing a script needs the token written to
// TOKEN_FILE at start-up, so a web page in a browser cannot queue code; the
// plugin's endpoints carry no secret because they only hand out work.
//
// GET /next is a long poll: the server holds it until a job is queued, so the
// plugin never waits on a timer. Figma throttles timers in a window macOS
// reports as hidden (the app hidden, the display asleep, the screen locked),
// but not the network, so a held request still wakes the plugin at once.
//
// Usage: npm run figma:bridge

import { randomBytes } from 'node:crypto';
import { writeFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PORT = 7799;
export const TOKEN_FILE = join(tmpdir(), 'zumpo-figma-bridge.token');

const LONG_POLL_MS = 25_000;
const PLUGIN_SEEN_MS = 3_000;
const NEXT_WAIT_MS = 20_000;
const MAX_BODY = 256 * 1024 * 1024;

const token = randomBytes(24).toString('hex');
const jobs = new Map();
const queue = [];
let nextId = 1;
let lastPoll = 0;
let pluginPaused = false;
// The plugin's held GET /next requests, oldest first: { paused, take, release }.
const holds = [];

function send(res, status, body, cors) {
  const headers = { 'Cache-Control': 'no-store' };
  if (cors) headers['Access-Control-Allow-Origin'] = '*';
  if (body === undefined) {
    res.writeHead(status, headers).end();
    return;
  }
  headers['Content-Type'] = 'application/json';
  res.writeHead(status, headers).end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function pluginStatus() {
  return {
    pluginConnected: holds.length > 0 || Date.now() - lastPoll < PLUGIN_SEEN_MS,
    pluginPaused,
    queued: queue.length,
    running: [...jobs.values()]
      .filter((j) => j.state === 'running')
      .map((j) => j.id),
  };
}

function view(job) {
  return { id: job.id, label: job.label, state: job.state, result: job.result };
}

function hand(res, job) {
  job.state = 'running';
  send(res, 200, { id: job.id, label: job.label, code: job.code }, true);
}

// Gives each queued job to a held, unpaused GET /next, while one is waiting.
// A request the plugin has just dropped takes nothing, and its job stays first
// in line.
function dispatch() {
  for (;;) {
    const hold = holds.find((h) => !h.paused);
    if (!hold || queue.length === 0) return;
    if (hold.take(queue[0])) queue.shift();
  }
}

function finish(job, result) {
  job.state = 'done';
  job.result = result;
  for (const wake of job.waiters.splice(0)) wake();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    // The plugin's side.
    if (req.method === 'GET' && url.pathname === '/next') {
      lastPoll = Date.now();
      pluginPaused = url.searchParams.has('paused');
      if (!pluginPaused && queue.length > 0) return hand(res, queue.shift());
      // Hold the request until a job arrives. A paused plugin is held too, so
      // it does not spin. Every way out answers it once: a job, 204 when the
      // hold runs out, or 205 when Pause or Resume asks it to ask again.
      const hold = { paused: pluginPaused };
      const leave = () => {
        const at = holds.indexOf(hold);
        if (at === -1) return false;
        holds.splice(at, 1);
        lastPoll = Date.now();
        clearTimeout(timer);
        return true;
      };
      // A client that has hung up can leave its socket unwritable before the
      // response's 'close' event, and a job written there would be lost.
      hold.take = (job) => {
        if (!leave()) return false;
        if (res.destroyed || !res.socket?.writable) return false;
        hand(res, job);
        return true;
      };
      hold.release = (status) => {
        if (leave()) send(res, status, undefined, true);
      };
      const timer = setTimeout(() => hold.release(204), NEXT_WAIT_MS);
      res.on('close', leave);
      holds.push(hold);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/pause') {
      pluginPaused = JSON.parse(await readBody(req)).paused === true;
      // Each release takes its hold out of the list, so walk a copy.
      for (const hold of holds.slice()) hold.release(205);
      return send(res, 204, undefined, true);
    }
    if (req.method === 'POST' && url.pathname === '/result') {
      const result = JSON.parse(await readBody(req));
      const job = jobs.get(result.id);
      if (job) finish(job, result);
      return send(res, 204, undefined, true);
    }
    if (req.method === 'GET' && url.pathname === '/status') {
      return send(res, 200, pluginStatus(), true);
    }

    // run.mjs's side.
    if (req.headers['x-bridge-token'] !== token)
      return send(res, 403, { error: 'Bad token' });
    if (req.method === 'POST' && url.pathname === '/jobs') {
      const { code, label } = JSON.parse(await readBody(req));
      if (typeof code !== 'string')
        return send(res, 400, { error: 'code must be a string' });
      const job = {
        id: String(nextId++),
        label,
        code,
        state: 'queued',
        waiters: [],
      };
      jobs.set(job.id, job);
      queue.push(job);
      dispatch();
      console.log(`queued #${job.id} ${label || ''}`);
      return send(res, 200, { ...view(job), ...pluginStatus() });
    }
    const match = url.pathname.match(/^\/jobs\/(\d+)$/);
    if (req.method === 'GET' && match) {
      const job = jobs.get(match[1]);
      if (!job) return send(res, 404, { error: 'No such job' });
      if (job.state !== 'done') {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, LONG_POLL_MS);
          job.waiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      if (job.state === 'done') {
        console.log(
          `done   #${job.id} ${job.result.ok ? 'ok' : 'error'} ${job.result.ms} ms`,
        );
      }
      return send(res, 200, { ...view(job), ...pluginStatus() });
    }
    if (req.method === 'DELETE' && match) {
      const job = jobs.get(match[1]);
      const at = queue.indexOf(job);
      if (at !== -1) queue.splice(at, 1);
      if (job && job.state !== 'done')
        finish(job, { ok: false, error: 'Cancelled' });
      return send(res, 204);
    }
    return send(res, 404, { error: 'Not found' });
  } catch (error) {
    return send(res, 500, { error: error.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  console.log(`Zumpo bridge server on http://localhost:${PORT}`);
  console.log(
    'Open Plugins → Development → Zumpo bridge in Figma desktop to connect.',
  );
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    rmSync(TOKEN_FILE, { force: true });
    process.exit(0);
  });
}
