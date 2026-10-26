/**
 * Draw & Guess rules that both sides need: the word categories a room may pick
 * from. The words themselves stay on the server (`server/libs/word-bank.ts`).
 * The rules are in docs/games/draw-and-guess.md.
 */

import type { WordCategory } from './wire-types.js';

/** Keyed by every category, so a category added to the union must be added here. */
const ORDER: Readonly<Record<WordCategory, true>> = {
  Animals: true,
  Clothing: true,
  Electronics: true,
  Fantasy: true,
  Food: true,
  Fruits: true,
  Household: true,
  Jobs: true,
  'League of Legends': true,
  Music: true,
  Nature: true,
  Places: true,
  'Sea Life': true,
  Sports: true,
  Vehicles: true,
};

/** Every category, in the order a picker shows them and settings keep them. */
export const WORD_CATEGORIES = Object.keys(ORDER) as readonly WordCategory[];

export const isWordCategory = (value: unknown): value is WordCategory =>
  typeof value === 'string' && Object.hasOwn(ORDER, value);

/** `picked` in `WORD_CATEGORIES` order, each once. */
export const inCategoryOrder = (
  picked: readonly WordCategory[],
): WordCategory[] =>
  WORD_CATEGORIES.filter((category) => picked.includes(category));
