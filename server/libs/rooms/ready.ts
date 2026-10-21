import { waitingOn } from '../../../shared/room.js';
import { seatCount } from './seats.js';
import type { GameModule, Room } from './types.js';

/*
 * Between games anybody at the table may say Ready, and once everybody here
 * has, the next game starts without waiting for the host to press Play again
 * (decided by Ryan on 2026-10-21). The host, or whoever stands in for one who
 * is away, may still start at once.
 */

/**
 * Starts the next game, for the starter or for a table that is all ready.
 * The caller has checked it may start; whoever said Ready has had their say.
 */
const beginGame = (room: Room, module: GameModule): void => {
  room.ready.clear();
  module.startGame(room);
};

/**
 * Whether the next game should start by itself: no game is on, enough are
 * seated, somebody here said Ready, and nobody else here is still to.
 */
const everyoneReady = (room: Room, module: GameModule): boolean =>
  !room.isGameStarted &&
  seatCount(room) >= module.minPlayers &&
  [...room.ready].some((id) => room.playerList[id]?.isConnected) &&
  waitingOn(room, room.ready).length === 0;

/**
 * After anything that can leave the table all ready: somebody saying so, or
 * somebody who had not leaving it. Starts the game if it is.
 */
const startIfReady = (room: Room, module: GameModule): void => {
  if (everyoneReady(room, module)) beginGame(room, module);
};

export { beginGame, startIfReady };
