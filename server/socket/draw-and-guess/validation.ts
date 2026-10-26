import { z } from 'zod';
import {
  inCategoryOrder,
  isWordCategory,
  WORD_CATEGORIES,
} from '../../../shared/draw-and-guess.js';
import { roomId } from '../../libs/validation.js';

/**
 * Draw & Guess's own inbound shapes, built from the same primitives the room
 * layer validates with. These used to sit in `libs/validation.ts` alongside
 * the generic ones, which is fine with one game and misleading with two - a
 * word is not something the room layer has an opinion about. The drawing's
 * are in `libs/drawing/`, since Doodle Chain draws too.
 */

const WORD_MAX = 64; // longest plausible word-bank entry, with room to spare

/**
 * A room's settings, on creating it and between games: 1 to 4 rounds, and the
 * categories its games draw from, at least one and each once. They are kept
 * in `WORD_CATEGORIES` order, however they arrived.
 *
 * Categories left out mean all of them: a page loaded before categories were
 * a setting, still open after a deploy, sends rounds alone, and every game
 * then drew from every category. Anything else that is not a set of known
 * categories is refused.
 */
const drawAndGuessSettings = z.object({
  rounds: z.number().int().min(1).max(4),
  categories: z
    .array(z.string().refine(isWordCategory, 'not a word category'))
    .min(1)
    .max(WORD_CATEGORIES.length)
    .refine((list) => new Set(list).size === list.length, 'a repeat')
    .optional()
    .transform((list) =>
      list === undefined
        ? [...WORD_CATEGORIES]
        : inCategoryOrder(list.filter(isWordCategory)),
    ),
});

const selectWordRequest = z.tuple([roomId, z.string().min(1).max(WORD_MAX)]);

export { drawAndGuessSettings, selectWordRequest };
