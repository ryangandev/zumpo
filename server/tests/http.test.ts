import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createRoom,
  settle,
  startTestServer,
  type TestServer,
} from './helpers/test-server.js';

describe('the HTTP side', () => {
  let harness: TestServer;

  afterEach(async () => {
    await harness.teardown();
  });

  it('answers a health check with what it is holding', async () => {
    harness = await startTestServer();
    const alice = await harness.connect();
    await harness.connect();
    await createRoom(alice);
    await settle();

    const response = await fetch(`${harness.url}/healthz`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      rooms: 1,
      connections: 2,
    });
  });

  it('answers a built file that is not there with a 404, not the page', async () => {
    const clientFolder = await mkdtemp(path.join(tmpdir(), 'zumpo-client-'));
    await mkdir(path.join(clientFolder, 'assets'));
    await writeFile(path.join(clientFolder, 'index.html'), '<!doctype html>');
    await writeFile(path.join(clientFolder, 'assets', 'app-new.js'), '');
    harness = await startTestServer(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { serveClient: true, clientFolder },
    );

    const stale = await fetch(`${harness.url}/assets/app-old.js`);
    const current = await fetch(`${harness.url}/assets/app-new.js`);
    const page = await fetch(`${harness.url}/games/pairs`);

    expect(stale.status).toBe(404);
    expect(current.status).toBe(200);
    expect(await page.text()).toBe('<!doctype html>');
  });

  it('sends no CORS headers with what it serves', async () => {
    harness = await startTestServer();

    const response = await fetch(`${harness.url}/healthz`, {
      headers: { Origin: 'https://elsewhere.example' },
    });

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
