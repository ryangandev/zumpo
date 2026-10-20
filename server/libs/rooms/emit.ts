import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import type {
  Ack,
  ClientToServerEvent,
  ClientToServerEvents,
  GameType,
  ServerToClientEvent,
  ServerToClientEvents,
} from '../../../shared/wire-types.js';

/**
 * Every emit and every listener goes through here, so that an event name and
 * its payload are checked against `shared/wire-types.d.ts` rather than spelled
 * out twice and hoped about.
 *
 * The outbound helpers are generic over the event map: a payload of the wrong
 * shape for its event fails to compile. The inbound ones deliberately are not.
 * A type says what a well-behaved client sends, not what arrives, so a handler
 * is handed its arguments as `unknown` and validates them with zod.
 */

/** What the server keeps on each connection. */
interface SocketData {
  /**
   * The player this connection speaks for, settled from its handshake before
   * any of its events are read. Identity comes from here, never a payload.
   */
  playerId: string;
  /** Where it connects from, for the per-address limits; unknown if absent. */
  address?: string;
}

/** The socket.io server, typed on the shared contract. */
type IoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;
/** One connection, typed on the shared contract. */
type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;

type ServerArgs<E extends ServerToClientEvent> = Parameters<
  ServerToClientEvents[E]
>;

/** The socket.io room a lobby's subscribers sit in, one per game. */
const lobbyChannel = (gameType: GameType): string => `lobby:${gameType}`;

/** The socket.io room a player's own connection sits in. */
const playerChannel = (playerId: string): string => `player:${playerId}`;

/** Everyone whose socket is in the room's channel: its seated players. */
const emitToRoom = <E extends ServerToClientEvent>(
  io: IoServer,
  roomId: string,
  event: E,
  ...args: ServerArgs<E>
): void => {
  io.to(roomId).emit(event, ...args);
};

const emitToLobby = <E extends ServerToClientEvent>(
  io: IoServer,
  gameType: GameType,
  event: E,
  ...args: ServerArgs<E>
): void => {
  io.to(lobbyChannel(gameType)).emit(event, ...args);
};

const emitToSocket = <E extends ServerToClientEvent>(
  socket: IoSocket,
  event: E,
  ...args: ServerArgs<E>
): void => {
  socket.emit(event, ...args);
};

/** Everyone in the room except the sender. */
const broadcastToRoom = <E extends ServerToClientEvent>(
  socket: IoSocket,
  roomId: string,
  event: E,
  ...args: ServerArgs<E>
): void => {
  socket.broadcast.to(roomId).emit(event, ...args);
};

/**
 * Sends to whichever socket a player is currently using, through the player's
 * own channel. Room state is keyed by player id, not by socket.
 */
const emitToPlayer = <E extends ServerToClientEvent>(
  io: IoServer,
  playerId: string,
  event: E,
  ...args: ServerArgs<E>
): void => {
  io.to(playerChannel(playerId)).emit(event, ...args);
};

/** A fire-and-forget event: its arguments, unchecked, for zod to read. */
const onClientEvent = (
  socket: IoSocket,
  event: ClientToServerEvent,
  handler: (...args: unknown[]) => void,
): void => {
  socket.on(event, handler);
};

type Last<T extends unknown[]> = T extends [...unknown[], infer L] ? L : never;

/** What an event's acknowledgement answers with, or never if it has none. */
type AnswerOf<E extends ClientToServerEvent> =
  Last<Parameters<ClientToServerEvents[E]>> extends Ack<infer A> ? A : never;

/** The events a client sends expecting an answer. */
type RequestEvent = {
  [E in ClientToServerEvent]: [AnswerOf<E>] extends [never] ? never : E;
}[ClientToServerEvent];

/**
 * Splits an acknowledged request into its arguments and its acknowledgement.
 *
 * The acknowledgement is the last argument, if and only if that argument is a
 * function: socket.io builds it, a client cannot forge one, but a client can
 * leave it out or put something else in its place. Nothing else about it is
 * trusted, and a request without one is still handled; it just cannot be told
 * how it went.
 */
const splitAck = (
  rawArgs: unknown[],
): { args: unknown[]; ack: ((answer: unknown) => void) | undefined } => {
  const last = rawArgs.at(-1);
  if (typeof last !== 'function') return { args: rawArgs, ack: undefined };
  return {
    args: rawArgs.slice(0, -1),
    ack: last as (answer: unknown) => void,
  };
};

/**
 * A request: its arguments, unchecked, and a `reply` typed on what the
 * contract says this event is answered with. `reply` answers once at most, and
 * does nothing when the client sent no acknowledgement.
 */
const onClientRequest = <E extends RequestEvent>(
  socket: IoSocket,
  event: E,
  handler: (args: unknown[], reply: (answer: AnswerOf<E>) => void) => void,
): void => {
  onClientEvent(socket, event, (...rawArgs: unknown[]) => {
    const { args, ack } = splitAck(rawArgs);
    let answered = false;

    handler(args, (answer) => {
      if (answered || !ack) return;
      answered = true;
      ack(answer);
    });
  });
};

export {
  lobbyChannel,
  playerChannel,
  emitToRoom,
  emitToLobby,
  emitToSocket,
  emitToPlayer,
  broadcastToRoom,
  onClientEvent,
  onClientRequest,
  splitAck,
};
export type { IoServer, IoSocket, SocketData, AnswerOf, RequestEvent };
