import { z } from 'zod';
import { roomId } from '../../libs/validation.js';
import { DECK_SIZE } from '../../../shared/snap.js';

/** Snap's own inbound shapes. */

// Nothing to choose but the seats, which the room layer checks.
const noSettings = z.object({}).strict();

// A middle card by its number in the game, and a symbol. Whether that card is
// still in play, and where the symbol is, is the engine's to judge.
const claimRequest = z.tuple([
  roomId,
  z
    .number()
    .int()
    .min(0)
    .max(DECK_SIZE - 1),
  z
    .number()
    .int()
    .min(0)
    .max(DECK_SIZE - 1),
]);

export { noSettings, claimRequest };
