import type {
  LobbyRoomInfo,
  PlayerInfo,
  RoomState,
  RoomStatus,
  SpectatorInfo,
} from '../../../shared/wire-types.js';
import { MAX_SPECTATORS } from '../../../shared/room.js';
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

const isSpectator = (room: Room, playerId: string): boolean =>
  Boolean(room.spectators[playerId]);

/** The first of `members` who is here, else the first away; none if empty. */
const firstHere = (
  members: Record<string, { isConnected: boolean }>,
): string | undefined => {
  const entries = Object.entries(members);
  return (entries.find(([, member]) => member.isConnected) ?? entries[0])?.[0];
};

/**
 * Who the crown passes to: somebody at the table before a spectator, and in
 * either somebody here before somebody away, who could not start a game.
 * `undefined` when nobody is left to take it.
 */
const heirOf = (
  room: Room,
  { playersOnly = false }: { playersOnly?: boolean } = {},
): string | undefined =>
  firstHere(room.playerList) ??
  (playersOnly ? undefined : firstHere(room.spectators));

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
 * table and who is watching, and the clock.
 */
const roomBasics = (
  room: Room,
): Pick<
  RoomState,
  'playerList' | 'spectators' | 'isGameStarted' | 'phaseEndsInMs'
> => ({
  playerList: room.playerList,
  spectators: room.spectators,
  isGameStarted: room.isGameStarted,
  phaseEndsInMs: getRemainingPhaseMs(room),
});

export {
  seatCount,
  spectatorCount,
  memberCount,
  roomStatus,
  canWatch,
  memberOf,
  isSpectator,
  heirOf,
  lobbyBasics,
  roomBasics,
};
