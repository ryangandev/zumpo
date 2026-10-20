import { MAX_PLAYERS, MIN_PLAYERS } from './hush.js';
import type { GameType } from './wire-types.js';

/**
 * How many players each game seats: the fewest it starts with, and the most a
 * room of it may hold. The server holds rooms to these and the client offers
 * them, so they are written down once, here.
 */
export const SEATS: Readonly<Record<GameType, { min: number; max: number }>> = {
  'draw-and-guess': { min: 2, max: 8 },
  minesweeper: { min: 2, max: 8 },
  'make-24': { min: 2, max: 8 },
  pairs: { min: 2, max: 6 },
  trios: { min: 2, max: 8 },
  'liars-dice': { min: 2, max: 6 },
  hush: { min: MIN_PLAYERS, max: MAX_PLAYERS },
  'daily-word': { min: 2, max: 8 },
};
