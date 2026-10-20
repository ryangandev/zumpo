import type { AddressInfo } from 'node:net';
import { createZumpoServer } from './app.js';

const port = process.env.PORT || 3000;

/** The most a shutdown may take before the process exits regardless. */
const SHUTDOWN_DEADLINE_MS = 5000;

const zumpo = createZumpoServer();

// The port it got, which differs from PORT when that is 0 (any free port).
zumpo.httpServer.listen(port, () => {
  const { port: bound } = zumpo.httpServer.address() as AddressInfo;
  console.log(`✅ Listening on port ${bound}`);
});

/**
 * The host stops the process with SIGTERM on every deploy and restart (and
 * `tsc-watch` does on every rebuild). Closing properly tells every room page
 * why its room ended, which an exit without a word leaves it to discover.
 */
const shutDown = (signal: NodeJS.Signals) => {
  console.log(`${signal}: closing every room and connection.`);
  setTimeout(() => process.exit(1), SHUTDOWN_DEADLINE_MS).unref();
  void zumpo.close().then(() => process.exit(0));
};

/*
 * A bug that escapes every guard is logged, and the process goes on. Ending it
 * would end every room for certain, to avoid state that is only perhaps wrong
 * in one; socket events and timers, where everything starts, are guarded
 * already, so what reaches here is rare.
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

process.once('SIGTERM', shutDown);
process.once('SIGINT', shutDown);
