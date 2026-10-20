import express, { type Request, type Response } from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import * as url from 'node:url';
import path from 'node:path';
import type {
  LiarsDiceDurationsInSeconds,
  DailyWordDurationsInSeconds,
  HushDurationsInSeconds,
  Make24DurationsInSeconds,
  MinesweeperDurationsInSeconds,
  PairsDurationsInSeconds,
  PhaseDurationsInSeconds,
  TriosDurationsInSeconds,
} from './libs/game-clock.js';
import { createRoomRegistry } from './libs/rooms/registry.js';
import { createRoomMembership } from './libs/rooms/membership.js';
import { lobbyEventsHandler } from './libs/rooms/lobby-events.js';
import { roomEventsHandler } from './libs/rooms/room-events.js';
import { chatEventsHandler } from './libs/rooms/chat-events.js';
import type { Room } from './libs/rooms/types.js';
import { createDrawAndGuessModule } from './socket/draw-and-guess/index.js';
import { createMinesweeperModule } from './socket/minesweeper/index.js';
import { createMake24Module } from './socket/make-24/index.js';
import { createPairsModule } from './socket/pairs/index.js';
import { createTriosModule } from './socket/trios/index.js';
import { createLiarsDiceModule } from './socket/liars-dice/index.js';
import { createHushModule } from './socket/hush/index.js';
import { createDailyWordModule } from './socket/daily-word/index.js';
import { clientDepartureOnDisconnectHandler } from './socket/client-disconnect-handler.js';
import { playerSessionHandler } from './socket/player-session-handler.js';
import {
  createPlayerSessionRegistry,
  type PlayerSessionRegistry,
} from './libs/player-session.js';
import { createRateLimiter } from './libs/rate-limit.js';
import {
  addressOf,
  createConnectionGate,
  DEFAULT_CONNECTION_LIMITS,
  type ConnectionLimits,
} from './libs/connection-gate.js';
import { handshakeAuth } from './libs/validation.js';
import { guard } from './libs/guard.js';
import { splitAck, type IoServer } from './libs/rooms/emit.js';
import { invalidRequest } from './models/error.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../shared/wire-types.js';

/** At most one "you are being throttled" line per socket per this long. */
const THROTTLE_LOG_INTERVAL_MS = 5000;

/**
 * The most rooms the server holds at once. Each is small, but they live in
 * memory, and a client can open connections faster than people play.
 */
const DEFAULT_MAX_ROOMS = 500;

/**
 * The largest packet a client may send. The biggest real one, a room's
 * settings or a hand's solution, is well under a kilobyte; socket.io's default
 * of a megabyte would be parsed in full before anything checked it.
 */
const MAX_PACKET_BYTES = 16 * 1024;

/**
 * What a page from here may load and who may frame it. Everything comes from
 * this origin: the bundle, its fonts, the socket. Styles allow inline ones,
 * because React writes `style` attributes for a few computed sizes and
 * positions.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // For browsers that predate `frame-ancestors`.
  'X-Frame-Options': 'DENY',
};

/**
 * A built file's name carries a hash of its contents, so it never changes and
 * may be kept for a year; anything else, the page above all, is asked about
 * each time, so a deploy reaches the next visit.
 */
const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

/** How long closing waits for connections to take their last packet. */
const CLOSE_FLUSH_MS = 1000;

interface CreateZumpoServerOptions {
  /** Defaults to `process.env.CORS_ORIGIN`, then the Vite dev server. */
  corsOrigin?: string;
  /** Serve the built SPA and route unknown paths to it. */
  serveClient?: boolean;
  /** Where the built SPA is; `build/public` beside the built server. */
  clientFolder?: string;
  /** Shortened by the test suite so a full game runs in milliseconds. */
  phaseDurations?: PhaseDurationsInSeconds;
  /** Minesweeper's round window and reveal pause. Shortened by tests. */
  minesweeperDurations?: MinesweeperDurationsInSeconds;
  /** Make 24's hand and its results. Shortened by tests. */
  make24Durations?: Make24DurationsInSeconds;
  /** A Pairs turn and a miss on show. Shortened by tests. */
  pairsDurations?: PairsDurationsInSeconds;
  /** A taken trio's pause, a lockout and the hint clock. Shortened by tests. */
  triosDurations?: TriosDurationsInSeconds;
  /** A Liar's Dice turn and a call's reveal. Shortened by tests. */
  liarsDiceDurations?: LiarsDiceDurationsInSeconds;
  /** Hush's countdown, mistake pause and cleared level. Shortened by tests. */
  hushDurations?: HushDurationsInSeconds;
  /** A Daily Word round and its results. Shortened by tests. */
  dailyWordDurations?: DailyWordDurationsInSeconds;
  /**
   * Deals every Daily Word game's words from this seed instead of at random,
   * so a test run plays the same words each time. Defaults to
   * `process.env.DAILY_WORD_SEED`; never set in production.
   */
  dailyWordSeed?: string;
  /** How long a dropped player keeps their seat. Shortened by tests. */
  graceInSeconds?: number;
  /** The most rooms open at once. Lowered by tests. */
  maxRooms?: number;
  /** What one address, and everybody, may hold. Lowered by tests. */
  connectionLimits?: Partial<ConnectionLimits>;
  /**
   * The header a proxy in front puts the client's address in. Defaults to
   * `process.env.CLIENT_IP_HEADER`; unset, it is the socket's own address.
   */
  clientIpHeader?: string;
  /**
   * Whether each address is held to its own limits, beside the totals.
   * Defaults to on unless `process.env.PER_ADDRESS_LIMITS` is `off`, as for a
   * test run, whose players all come from one machine.
   */
  perAddressLimits?: boolean;
}

interface ZumpoServer {
  httpServer: HttpServer;
  io: IoServer;
  /** Every room by id, exposed so tests can assert on server state. */
  rooms: ReadonlyMap<string, Room>;
  /** Exposed so tests can assert on identities outliving their sockets. */
  sessions: PlayerSessionRegistry;
  close: () => Promise<void>;
}

/**
 * Builds a fully wired server without starting it.
 *
 * This used to all happen at module scope in `server.ts`, which meant importing
 * the server was the same thing as binding a port - so the only way to exercise
 * any of it was to spawn a process and talk to a fixed port.
 *
 * The connection block below is now three generic handlers plus a loop over
 * whatever games are registered. It used to be five, every one of them named
 * after Draw & Guess and handed the single `drawAndGuessDetailRoomInfoList`
 * that was the server's entire idea of state.
 */
const createZumpoServer = (
  options: CreateZumpoServerOptions = {},
): ZumpoServer => {
  const {
    corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3001',
    serveClient = process.env.NODE_ENV === 'production',
    phaseDurations,
    minesweeperDurations,
    make24Durations,
    pairsDurations,
    triosDurations,
    liarsDiceDurations,
    hushDurations,
    dailyWordDurations,
    dailyWordSeed = process.env.DAILY_WORD_SEED || undefined,
    graceInSeconds,
    maxRooms = DEFAULT_MAX_ROOMS,
    connectionLimits,
    clientIpHeader = process.env.CLIENT_IP_HEADER || undefined,
    perAddressLimits = process.env.PER_ADDRESS_LIMITS !== 'off',
  } = options;

  const app = express();
  // build/server/app.js serves the SPA that Vite builds into build/public.
  const publicStaticFolder =
    options.clientFolder ??
    path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', 'public');

  app.disable('x-powered-by');
  app.use((_req: Request, res: Response, next: () => void) => {
    res.set(SECURITY_HEADERS);
    next();
  });

  app.use(
    express.static(publicStaticFolder, {
      setHeaders: (res, filePath) => {
        const built = path
          .relative(publicStaticFolder, filePath)
          .startsWith(`assets${path.sep}`);
        res.set('Cache-Control', built ? IMMUTABLE : REVALIDATE);
      },
    }),
  );

  const httpServer = createServer(app);
  const io: IoServer = new Server<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: {
        origin: corsOrigin,
      },
      maxHttpBufferSize: MAX_PACKET_BYTES,
    },
  );

  // All of these are created once for the server rather than per connection:
  // they own timers and identities that outlive any single socket.
  const sessions = createPlayerSessionRegistry();
  const registry = createRoomRegistry(io);

  // Every game the server knows how to run. A module is registered once and
  // then reached only through the registry - the room layer below never names
  // one, and adding the second took this line and nothing else here.
  registry.register(createDrawAndGuessModule(registry.context, phaseDurations));
  registry.register(
    createMinesweeperModule(registry.context, minesweeperDurations),
  );
  registry.register(createMake24Module(registry.context, make24Durations));
  registry.register(createPairsModule(registry.context, pairsDurations));
  registry.register(createTriosModule(registry.context, triosDurations));
  // A Hush level waits for a dropped player as long as their seat is held,
  // and shows that wait as its clock.
  registry.register(
    createHushModule(registry.context, hushDurations, graceInSeconds),
  );
  registry.register(
    createLiarsDiceModule(registry.context, liarsDiceDurations),
  );
  registry.register(
    createDailyWordModule(registry.context, dailyWordDurations, dailyWordSeed),
  );

  const membership = createRoomMembership(
    io,
    registry,
    sessions,
    graceInSeconds,
  );

  const gate = createConnectionGate({
    ...DEFAULT_CONNECTION_LIMITS,
    ...connectionLimits,
  });
  let warnedNoAddress = false;

  // Before a connection is let in at all: how much does its address hold
  // already? A refused one never mints an identity.
  io.use((socket, next) => {
    const address = perAddressLimits
      ? addressOf(socket.handshake, clientIpHeader)
      : undefined;
    if (perAddressLimits && address === undefined && !warnedNoAddress) {
      warnedNoAddress = true;
      console.warn(
        `No client address in "${clientIpHeader}": only the totals apply.`,
      );
    }

    // A returning player already holds their identity; a new one needs room.
    const auth = handshakeAuth.safeParse(socket.handshake.auth);
    const claim = auth.success ? auth.data.identity : null;
    const returning =
      claim !== null && sessions.resume(claim.playerId, claim.token) !== null;
    if (!returning && sessions.size() >= gate.limits.sessions) {
      next(new Error('Zumpo is full right now.'));
      return;
    }

    if (!gate.admit(address)) {
      next(new Error('Too many connections. Try again in a moment.'));
      return;
    }
    socket.data.address = address;
    socket.once('disconnect', () => gate.release(address));
    next();
  });

  io.on('connection', (socket) => {
    console.log('a user is connected: ' + socket.id);

    // Before anything else looks at a packet: how often may this socket speak?
    // Every handler below checks the *shape* of what it is sent; this is what
    // bounds how much of it arrives. A dropped packet is never handed on. A
    // request is told so, so that a client waiting on its answer is not left
    // waiting forever; anything else is dropped silently.
    const rateLimiter = createRateLimiter();
    let lastThrottleWarningMs = 0;

    socket.use(([eventName, ...rawArgs], next) => {
      if (rateLimiter.allow(String(eventName))) {
        next();
        return;
      }

      const { ack } = splitAck(rawArgs);
      if (ack) {
        ack(invalidRequest('Too many requests. Try again in a moment.'));
      }

      // Logging every dropped packet would be its own flood.
      const nowMs = Date.now();
      if (nowMs - lastThrottleWarningMs > THROTTLE_LOG_INTERVAL_MS) {
        lastThrottleWarningMs = nowMs;
        console.warn(
          `Throttling ${socket.id}: too many "${String(eventName)}" events.`,
        );
      }
    });

    // Identity first, from the handshake: every handler below reads the player
    // id off the connection, and this runs before any event from it is read.
    // A returning player's seats go back to them on the way, which runs each
    // game's own code: a bug in it must not take the connection with it.
    const identified = guard(`Connecting ${socket.id}`, () =>
      playerSessionHandler(
        io,
        socket,
        sessions,
        membership.graceMs,
        membership.handleResume,
      ),
    );
    if (!identified && !socket.data.playerId) {
      socket.disconnect(true);
      return;
    }
    clientDepartureOnDisconnectHandler(socket, membership);

    // The room layer: lobbies, seats, ownership, chat. None of it knows which
    // game it is running.
    lobbyEventsHandler(
      socket,
      registry,
      membership,
      maxRooms,
      gate.limits.roomsPerAddress,
    );
    roomEventsHandler(socket, registry, membership);
    chatEventsHandler(socket, registry);

    // And then each game's own events.
    for (const gameType of registry.registeredTypes()) {
      registry.moduleFor(gameType)?.registerHandlers(socket);
    }
  });

  // What the host polls to know the process is up and answering, before the
  // SPA catch-all below would answer it with a page. The counts are what a
  // glance at a running server wants, and nothing a lobby does not show.
  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      rooms: registry.count(),
      connections: io.engine.clientsCount,
    });
  });

  if (serveClient) {
    console.log('Serving the built client.');
    // Express 5 / path-to-regexp v8: a bare '*' is no longer a valid path.
    // Wildcards must be named - '/{*splat}' matches the root as well as any subpath.
    // A built file that is not there is missing, not a page: answering with
    // the SPA would hand a script tag HTML, which fails with a MIME error and
    // a blank screen instead of a 404 the page can recover from.
    app.get('/assets/{*splat}', (_req: Request, res: Response) => {
      res.sendStatus(404);
    });
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.set('Cache-Control', REVALIDATE);
      res.sendFile('index.html', { root: publicStaticFolder });
    });
  } else {
    console.log('Running in development mode.');
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.send(
        `Hello, welcome to the Zumpo development server! 🚀\n` +
          `In development mode, the frontend server also needs to be started.\n` +
          `Please ensure it's running and accessible at http://localhost:3001.\n` +
          `Happy coding! 🎉`,
      );
    });
  }

  /**
   * Shuts the server down: tells every connection first, then closes them
   * before the HTTP server, because socket.io keep-alives would otherwise hold
   * the process open long past the test that created them.
   *
   * Rooms live in this process, so they end here. Each page is told so before
   * its connection goes, and can say why its room closed instead of finding it
   * missing after the reconnect. `io.close()` alone would cut the transports
   * with that last packet still unsent, so the sockets are disconnected first,
   * which flushes it, and given a moment to finish.
   */
  const close = async (): Promise<void> => {
    registry.dispose();
    membership.dispose();

    const closed = [...io.sockets.sockets.values()].map(
      (socket) =>
        new Promise<void>((resolve) => socket.conn.once('close', resolve)),
    );
    io.emit('server:closing');
    io.disconnectSockets(true);
    await Promise.race([
      Promise.all(closed),
      new Promise((resolve) => setTimeout(resolve, CLOSE_FLUSH_MS).unref()),
    ]);

    await io.close();
    await new Promise<void>((resolve) => {
      if (!httpServer.listening) {
        resolve();
        return;
      }
      httpServer.close(() => resolve());
    });
  };

  return { httpServer, io, rooms: registry.rooms, sessions, close };
};

export { createZumpoServer };
export type { CreateZumpoServerOptions, ZumpoServer };
