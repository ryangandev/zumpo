import type { GameModule, Room } from './types.js';

/*
 * Between games anybody at the table may say Ready. It is a signal for the
 * starter, never a trigger: the next game starts only when the starter (the
 * host, or while they are away the player next in line) presses start, so it
 * never begins while they are still choosing a setting or during a host's
 * brief refresh (decided by Ryan on 2026-10-21).
 */

/**
 * Starts the next game for the starter. The caller has checked they may;
 * whoever said Ready has had their say, so the next game starts with none.
 */
const beginGame = (room: Room, module: GameModule): void => {
  room.ready.clear();
  module.startGame(room);
};

export { beginGame };
