import { z } from 'zod';
import { roomId } from '../../libs/validation.js';

/**
 * Draw & Guess's own inbound shapes, built from the same primitives the room
 * layer validates with. These used to sit in `libs/validation.ts` alongside
 * the generic ones, which is fine with one game and misleading with two - a
 * word is not something the room layer has an opinion about. The drawing's
 * are in `libs/drawing/`, since Doodle Chain draws too.
 */

const WORD_MAX = 64; // longest plausible word-bank entry, with room to spare

const roundsSetting = z.object({
  rounds: z.number().int().min(1).max(4),
});

const selectWordRequest = z.tuple([roomId, z.string().min(1).max(WORD_MAX)]);

export { roundsSetting, selectWordRequest };
