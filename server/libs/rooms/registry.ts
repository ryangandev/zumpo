import type { ChatMessage, GameType } from '../../../shared/wire-types.js';
import { memberOf } from './seats.js';
import { createRoomTimers, type RoomTimerSet } from './timers.js';
import type { GameContext, GameModule, Room, RoomLookup } from './types.js';
import {
  emitToLobby,
  emitToPlayer,
  emitToRoom,
  type IoServer,
} from './emit.js';

/** How many messages a room remembers for a page that arrives late. */
const CHAT_HISTORY_LIMIT = 100;

/**
 * Every room on the server, and which module speaks for each.
 *
 * One flat record keyed by room id rather than one per game: room ids are
 * unique across the process, and a departure or a disconnect has to find a
 * player's rooms without being told which game they were playing. `ofType`
 * is what puts the game back on before a module reads its own state.
 *
 * Modules are registered after the registry exists because each one needs the
 * registry to look rooms up and to announce things. The cycle is broken by the
 * order rather than by a lazy reference: nothing is called on a module until
 * a connection arrives, which is long after every module is in place.
 */
const createRoomRegistry = (io: IoServer) => {
  const rooms = new Map<string, Room>();
  const modules = new Map<GameType, GameModule>();

  /**
   * Every set of room timers handed out, so that a room's go with it. The
   * first is the rooms' phase clocks.
   */
  const timerSets: RoomTimerSet[] = [];
  const createTimers = (): RoomTimerSet => {
    const timers = createRoomTimers((roomId) => rooms.has(roomId));
    timerSets.push(timers);
    return timers;
  };
  const phaseClocks = createTimers();

  /** Rooms with a snapshot owed to their players at the end of this run. */
  const staleRooms = new Set<string>();

  /**
   * Sends everybody connected in each stale room, players and spectators,
   * their own view of it.
   *
   * Per player rather than to the room's channel, because a snapshot is not
   * the same for everybody: the drawer is sent the word nobody else may see,
   * and a Minesweeper player their own pick and nobody else's.
   */
  const flushStates = (): void => {
    const roomIds = [...staleRooms];
    staleRooms.clear();

    for (const roomId of roomIds) {
      const room = rooms.get(roomId);
      // Emptied and deleted while the snapshot was pending: nobody to tell.
      if (!room) continue;
      const module = modules.get(room.gameType);
      if (!module) continue;

      const members = [
        ...Object.entries(room.playerList),
        ...Object.entries(room.spectators),
      ];
      for (const [playerId, member] of members) {
        if (!member.isConnected) continue;
        emitToPlayer(
          io,
          playerId,
          'room:state',
          module.toRoomState(room, playerId),
        );
      }
    }
  };

  /** Appends to a room's chat, keeps it bounded, and sends it to the room. */
  type NewMessage = ChatMessage extends infer M
    ? M extends ChatMessage
      ? Omit<M, 'id'>
      : never
    : never;
  const post = (room: Room, message: NewMessage): void => {
    const posted: ChatMessage = { id: room.chat.nextId, ...message };
    room.chat.nextId += 1;
    room.chat.messages.push(posted);
    if (room.chat.messages.length > CHAT_HISTORY_LIMIT) {
      room.chat.messages.splice(
        0,
        room.chat.messages.length - CHAT_HISTORY_LIMIT,
      );
    }
    emitToRoom(io, room.roomId, 'chat:message', room.roomId, posted);
  };

  /** Every room playing this game, as its lobby lists them. */
  const ofGame = (gameType: GameType): Room[] =>
    [...rooms.values()].filter((room) => room.gameType === gameType);

  const lookup: RoomLookup = {
    get: (roomId) => rooms.get(roomId),
    ofType: <TGameState>(roomId: string, gameType: GameType) => {
      const room = rooms.get(roomId);
      if (!room) return undefined;
      if (room.gameType !== gameType) return undefined;
      return room as Room<TGameState>;
    },
    emitLobby: (gameType) => {
      const module = modules.get(gameType);
      if (!module) return;

      const listed = ofGame(gameType).map((room) => module.toLobbyInfo(room));
      emitToLobby(io, gameType, 'lobby:rooms', gameType, listed);
    },
    emitState: (room) => {
      if (staleRooms.size === 0) queueMicrotask(flushStates);
      staleRooms.add(room.roomId);
    },
    announce: (roomId, kind, notice) => {
      const room = rooms.get(roomId);
      if (room) post(room, { kind, notice });
    },
    startPhase: (room, seconds, onEnd) => {
      room.phaseEndsAt = Date.now() + seconds * 1000;
      phaseClocks.set(room.roomId, seconds * 1000, onEnd);
    },
    stopPhase: (room) => {
      room.phaseEndsAt = 0;
      phaseClocks.clear(room.roomId);
    },
    timers: createTimers,
  };

  /**
   * A message from somebody in the room, at the table or watching, posted as
   * theirs. The name comes from their place, never from the payload, so
   * nobody can speak as somebody else.
   */
  const say = (room: Room, playerId: string, text: string): void => {
    const member = memberOf(room, playerId);
    if (!member) return;
    post(room, { kind: 'player', playerId, username: member.username, text });
  };

  const context: GameContext = { io, rooms: lookup };

  /** A new room, its creator already seated. */
  const add = (room: Room): void => {
    rooms.set(room.roomId, room);
  };

  /**
   * A room the last player has left. Its clock and timers go with it, and its
   * lobby stops listing it. The one way a room ends, so none is ever deleted
   * with a clock still running for it.
   */
  const remove = (room: Room): void => {
    for (const timers of timerSets) timers.clear(room.roomId);
    rooms.delete(room.roomId);
    lookup.emitLobby(room.gameType);
  };

  const count = (): number => rooms.size;

  const register = (module: GameModule): void => {
    modules.set(module.gameType, module);
  };

  const moduleFor = (gameType: GameType): GameModule | undefined =>
    modules.get(gameType);

  /** The module that speaks for this room, found from the room itself. */
  const moduleOf = (room: Room): GameModule | undefined =>
    modules.get(room.gameType);

  const registeredTypes = (): GameType[] => [...modules.keys()];

  /**
   * Rooms this player is in, at the table or watching, connected or not,
   * across every game. One at most: taking a place gives up any other.
   */
  const roomsHeldBy = (playerId: string): Room[] =>
    [...rooms.values()].filter((room) => memberOf(room, playerId));

  const dispose = (): void => {
    staleRooms.clear();
    for (const timers of timerSets) timers.clearAll();
  };

  return {
    rooms: rooms as ReadonlyMap<string, Room>,
    add,
    remove,
    count,
    ofGame,
    lookup,
    context,
    say,
    register,
    moduleFor,
    moduleOf,
    registeredTypes,
    roomsHeldBy,
    dispose,
  };
};

type RoomRegistry = ReturnType<typeof createRoomRegistry>;

export { createRoomRegistry, CHAT_HISTORY_LIMIT };
export type { RoomRegistry };
