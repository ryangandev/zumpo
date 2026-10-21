/**
 * Doodle Chain rules that both sides need: how many steps a game has, which
 * chain each player works on, what a step asks for, and who sits a step out.
 * The rules are in docs/games/doodle-chain.md.
 *
 * Places, chains and steps are counted as the server keeps them: a place is a
 * player's index in the order of play, from 0; chain c is the one the player
 * in place c started; steps count from 1.
 */

import type { DoodleChainKind } from './wire-types.js';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;

/** One step per player, but never more than six: the reveal grows with both. */
export const MAX_STEPS = 6;

/** The longest prompt or description, after trimming. */
export const TEXT_MAX = 80;

/** The drawing times a room may choose, and the one it starts with. */
export const DRAWING_SECONDS = [45, 60, 90] as const;
export type DrawingSeconds = (typeof DRAWING_SECONDS)[number];
export const DEFAULT_DRAWING_SECONDS: DrawingSeconds = 60;

/** The steps that are not drawing, and the pause after every step. */
export const WRITE_SECONDS = 30;
export const DESCRIBE_SECONDS = 30;
export const PASSING_SECONDS = 3;

/** About how long the room spends on one entry of the reveal. */
const REVEAL_SECONDS_PER_ENTRY = 5;

/**
 * How many lines Suggest picks from. The lines themselves are in each
 * language's catalog, the same list in the same order, so a suggestion
 * travels as its number and every viewer reads it in their own language.
 */
export const SUGGESTION_COUNT = 60;

/** How many steps a game of `players` has: one each, up to `MAX_STEPS`. */
export function stepsFor(players: number): number {
  return Math.min(Math.max(players, 0), MAX_STEPS);
}

/** What step `step` asks for: a prompt first, then drawings and descriptions in turn. */
export function kindOf(step: number): DoodleChainKind {
  if (step <= 1) return 'prompt';
  return step % 2 === 0 ? 'drawing' : 'description';
}

/**
 * The chain the player in place `place` works on at step `step`, in a game of
 * `players`: their own at step 1, then the one from the player before them,
 * and so on round the order.
 */
export function chainAt(place: number, step: number, players: number): number {
  return (((place - (step - 1)) % players) + players) % players;
}

/** The place of whoever works on chain `chain` at step `step`. */
export function placeAt(chain: number, step: number, players: number): number {
  return (chain + step - 1) % players;
}

/**
 * Whether a step that asks for `kind` can be played from an entry of kind
 * `from`, the chain's last entry that is not empty: a drawing needs words,
 * and a description needs a drawing. When it cannot, its player sits the
 * chain out for that step.
 */
export function canFollow(from: DoodleChainKind, kind: DoodleChainKind) {
  if (kind === 'drawing') return from === 'prompt' || from === 'description';
  if (kind === 'description') return from === 'drawing';
  return false;
}

/** A prompt or a description as it is kept: trimmed, and at most `TEXT_MAX`. */
export function cleanText(text: string): string {
  return Array.from(text.trim()).slice(0, TEXT_MAX).join('').trimEnd();
}

/**
 * About how many minutes a game of `players` takes with nobody finishing
 * early, the reveal included: what the host is told before starting.
 */
export function minutesFor(players: number, drawingSeconds: number): number {
  const steps = stepsFor(players);
  let seconds =
    steps * PASSING_SECONDS + players * steps * REVEAL_SECONDS_PER_ENTRY;
  for (let step = 1; step <= steps; step += 1) {
    const kind = kindOf(step);
    seconds +=
      kind === 'prompt'
        ? WRITE_SECONDS
        : kind === 'drawing'
          ? drawingSeconds
          : DESCRIBE_SECONDS;
  }
  return Math.max(1, Math.round(seconds / 60));
}
