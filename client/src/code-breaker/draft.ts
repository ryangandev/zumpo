import { CODE_LENGTH, type GuessProblem } from '../../../shared/code-breaker';
import type { DigitNote } from '../ui';

/**
 * The row being typed, on your own or in a room: its digits, why the last
 * Enter was turned back, and which tile last refused a digit typed again.
 * Every function returns a new draft and leaves the one it was given alone.
 */
export interface Draft {
  typed: string;
  /** Why the last Enter was turned back, until the row changes. */
  problem: GuessProblem | 'network' | null;
  /** The tile holding a digit typed again, and a count that nudges it anew. */
  nudge: { index: number; count: number } | null;
}

export const EMPTY_DRAFT: Draft = { typed: '', problem: null, nudge: null };

/** A digit row takes the digits on the top row and the number pad. */
export const DIGIT = /^[0-9]$/;

/**
 * A digit typed into the next empty tile. One already in the row is not
 * typed again: the tile that has it nudges instead, so a repeated digit
 * never reaches Enter.
 */
export function typeDigit(draft: Draft, digit: string): Draft {
  if (!DIGIT.test(digit) || draft.typed.length >= CODE_LENGTH) return draft;
  const index = draft.typed.indexOf(digit);
  if (index >= 0) {
    return {
      ...draft,
      nudge: { index, count: (draft.nudge?.count ?? 0) + 1 },
    };
  }
  return { typed: draft.typed + digit, problem: null, nudge: null };
}

export function deleteDigit(draft: Draft): Draft {
  if (draft.typed === '') return draft;
  return { typed: draft.typed.slice(0, -1), problem: null, nudge: null };
}

/** The player's own notes on the pad, by digit. */
export type Notes = Readonly<Partial<Record<string, DigitNote>>>;

/** A digit key with Notes on: plain, then out, then in, then plain again. */
export function cycleNote(notes: Notes, digit: string): Notes {
  const next = { ...notes };
  const note = notes[digit];
  if (note === undefined) next[digit] = 'out';
  else if (note === 'out') next[digit] = 'in';
  else delete next[digit];
  return next;
}
