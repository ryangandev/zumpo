import type { IncomingHttpHeaders } from 'node:http';

/**
 * How much of the server one address may hold.
 *
 * The rate limiter bounds how often a socket speaks, and a player holds one
 * seat at a time, but nothing bounded how many sockets one machine opened. A
 * loop that connects, makes a room and connects again could fill every room
 * the server holds, and every identity minted on the way stays in memory until
 * its grace runs out. These limits are per address, so one machine cannot
 * crowd out everybody else, and generous, because a party on one wifi network
 * shares an address too.
 */
interface ConnectionLimits {
  /** Connections open at once from one address. */
  perAddress: number;
  /** New connections from one address in a minute. */
  connectsPerMinute: number;
  /** Rooms made from one address open at once. */
  roomsPerAddress: number;
  /** Connections open at once, every address together. */
  total: number;
  /** Identities held at once, connected or inside their grace. */
  sessions: number;
}

const DEFAULT_CONNECTION_LIMITS: ConnectionLimits = {
  perAddress: 30,
  connectsPerMinute: 60,
  roomsPerAddress: 10,
  total: 2000,
  sessions: 10000,
};

const WINDOW_MS = 60_000;

/**
 * Where a connection comes from.
 *
 * Behind a proxy every connection arrives from the proxy, so the client's own
 * address has to come from a header the proxy sets, named by `header`
 * (`CLIENT_IP_HEADER`). Without one configured it is the socket's address,
 * which is right when nothing sits in front. A configured header that is
 * missing gives no address rather than the proxy's: one shared bucket for
 * everybody would turn the limit on the whole site.
 */
const addressOf = (
  handshake: { address: string; headers: IncomingHttpHeaders },
  header: string | undefined,
): string | undefined => {
  if (!header) return handshake.address || undefined;
  const value = handshake.headers[header.toLowerCase()];
  const first = (Array.isArray(value) ? value[0] : value)?.split(',')[0];
  return first?.trim() || undefined;
};

/**
 * Counts what each address holds. An unknown address is held to the totals
 * only. `now` is injectable so a test can roll the minute over.
 */
const createConnectionGate = (
  limits: ConnectionLimits = DEFAULT_CONNECTION_LIMITS,
  now: () => number = Date.now,
) => {
  const open = new Map<string, number>();
  let total = 0;
  // A fixed window, emptied each minute, so it never holds more addresses
  // than connected in the last one.
  let windowStartMs = now();
  const connectsThisWindow = new Map<string, number>();

  /** Whether a new connection from `address` may open; counts it if so. */
  const admit = (address: string | undefined): boolean => {
    if (total >= limits.total) return false;
    if (address !== undefined) {
      const currentMs = now();
      if (currentMs - windowStartMs >= WINDOW_MS) {
        windowStartMs = currentMs;
        connectsThisWindow.clear();
      }
      const connects = connectsThisWindow.get(address) ?? 0;
      if (connects >= limits.connectsPerMinute) return false;
      if ((open.get(address) ?? 0) >= limits.perAddress) return false;
      connectsThisWindow.set(address, connects + 1);
      open.set(address, (open.get(address) ?? 0) + 1);
    }
    total += 1;
    return true;
  };

  /** A connection `admit` let in has closed. */
  const release = (address: string | undefined): void => {
    total = Math.max(0, total - 1);
    if (address === undefined) return;
    const left = (open.get(address) ?? 1) - 1;
    if (left > 0) open.set(address, left);
    else open.delete(address);
  };

  return { admit, release, limits };
};

type ConnectionGate = ReturnType<typeof createConnectionGate>;

export { addressOf, createConnectionGate, DEFAULT_CONNECTION_LIMITS };
export type { ConnectionGate, ConnectionLimits };
