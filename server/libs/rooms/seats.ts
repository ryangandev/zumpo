import type {
  LobbyRoomInfo,
  PlayerInfo,
  RoomState,
  RoomStatus,
  SpectatorInfo,
} from '../../../shared/wire-types.js';
import { heirOf, MAX_SPECTATORS, starterOf } from '../../../shared/room.js';
import { getRemainingPhaseMs } from '../utils.js';
import type { Room } from './types.js';

/*
 * What a room's seats add up to. Worked out whenever it is asked for rather
 * than kept on the room, so that nothing has to remember to update it after a
 * seat is taken or given up, or a game starts or ends, and it cannot go stale.
 */

/** Seats taken, by players here or away. */
const seatCount = (room: Room): number => Object.keys(room.playerList).length;

/** Spectator seats taken, by spectators here or away. */
const spectatorCount = (room: Room): number =>
  Object.keys(room.spectators).length;

/** Everybody in the room, at the table or watching. */
const memberCount = (room: Room): number =>
  seatCount(room) + spectatorCount(room);

/** What the lobby says of a room: playing, full, or open to join. */
const roomStatus = (room: Room): RoomStatus => {
  if (room.isGameStarted) return 'In Progress';
  return seatCount(room) >= room.maxPlayers ? 'Full' : 'Open';
};

/** Whether there is a spectator seat free. */
const canWatch = (room: Room): boolean => spectatorCount(room) < MAX_SPECTATORS;

/** This player's place in the room, at the table or watching, if any. */
const memberOf = (
  room: Room,
  playerId: string,
): PlayerInfo | SpectatorInfo | undefined =>
  room.playerList[playerId] ?? room.spectators[playerId];

/**
 * The seat of a player the caller knows is at the table: one it took from
 * the table's own list, or the game's order of it. Missing, it is a bug, and
 * throws for the guard around every event and timer to log.
 */
const seatOf = (room: Room, playerId: string): PlayerInfo => {
  const seat = room.playerList[playerId];
  if (!seat) throw new Error(`No seat for ${playerId} in room ${room.roomId}.`);
  return seat;
};

const isSpectator = (room: Room, playerId: string): boolean =>
  Boolean(room.spectators[playerId]);

/**
 * What every game's lobby row says of a room, the game aside: each module
 * spreads this into its `toLobbyInfo` and adds its type and settings.
 */
const lobbyBasics = (room: Room): Omit<LobbyRoomInfo, 'gameType'> => ({
  roomId: room.roomId,
  roomName: room.roomName,
  owner: room.owner,
  status: roomStatus(room),
  currentPlayerCount: seatCount(room),
  maxPlayers: room.maxPlayers,
  hasPassword: room.password !== '',
  spectatorCount: spectatorCount(room),
});

/**
 * What every game's snapshot says of a room, the game aside: who is at the
 * table and who is watching, who is ready for the next game, the clock, and
 * the key for its invite link.
 */
const roomBasics = (
  room: Room,
): Pick<
  RoomState,
  | 'playerList'
  | 'spectators'
  | 'isGameStarted'
  | 'ready'
  | 'phaseEndsInMs'
  | 'inviteKey'
> => ({
  inviteKey: room.inviteKey,
  playerList: room.playerList,
  spectators: room.spectators,
  isGameStarted: room.isGameStarted,
  ready: [...room.ready],
  phaseEndsInMs: getRemainingPhaseMs(room),
});

export {
  seatCount,
  spectatorCount,
  memberCount,
  roomStatus,
  canWatch,
  memberOf,
  seatOf,
  isSpectator,
  heirOf,
  starterOf,
  lobbyBasics,
  roomBasics,
};
