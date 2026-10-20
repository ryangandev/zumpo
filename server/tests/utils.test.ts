import { describe, expect, it } from 'vitest';
import {
  gameOverNotice,
  getRandomElementFromSet,
  getRemainingPhaseMs,
  resetPoints,
} from '../libs/utils.js';

/**
 * What is left in `libs/utils.ts` once the extraction took the game-specific
 * half out. The word-bank and hint helpers moved to
 * `socket/draw-and-guess/words.ts`, and the two snapshot builders became that
 * module's `toLobbyInfo`/`toRoomState` - all of which are covered in
 * `draw-and-guess-state.test.ts`.
 */

describe('getRemainingPhaseMs', () => {
  it('is zero for an idle room rather than a large negative number', () => {
    expect(getRemainingPhaseMs({ phaseEndsAt: 0 })).toBe(0);
  });

  it('never goes negative once the deadline has passed', () => {
    expect(getRemainingPhaseMs({ phaseEndsAt: Date.now() - 5000 })).toBe(0);
  });

  it('is a duration, not the deadline itself', () => {
    const remaining = getRemainingPhaseMs({ phaseEndsAt: Date.now() + 10_000 });

    expect(remaining).toBeGreaterThan(9000);
    expect(remaining).toBeLessThanOrEqual(10_000);
  });
});

describe('getRandomElementFromSet', () => {
  it('returns undefined for an empty set rather than claiming a string', () => {
    expect(getRandomElementFromSet(new Set())).toBeUndefined();
  });

  it('always returns a member of the set', () => {
    const members = new Set(['x', 'y', 'z']);
    for (let i = 0; i < 50; i++) {
      expect(members.has(getRandomElementFromSet(members)!)).toBe(true);
    }
  });
});

describe('resetPoints', () => {
  it('zeroes the scores without touching the names', () => {
    const reset = resetPoints({
      a: { username: 'A', points: 300, isConnected: true },
      b: { username: 'B', points: 100, isConnected: false },
    });

    expect(reset.a!.points).toBe(0);
    expect(reset.b!.points).toBe(0);
    expect(reset.a!.username).toBe('A');
    // A player inside their reconnect grace keeps their seat, so a new game
    // must not quietly mark them present.
    expect(reset.b!.isConnected).toBe(false);
  });
});

const standing = (username: string, points: number) => ({
  playerId: username.toLowerCase(),
  username,
  points,
});

describe('gameOverNotice', () => {
  it('names the winner with public score facts', () => {
    expect(
      gameOverNotice([standing('Alice', 40), standing('Bob', 12)]),
    ).toEqual({
      type: 'game:over',
      names: ['Alice'],
      points: 40,
      unit: 'point',
    });
  });
  it('names everybody tied at the top', () => {
    expect(
      gameOverNotice([
        standing('Alice', 40),
        standing('Bob', 40),
        standing('Cat', 40),
        standing('Dan', 3),
      ]),
    ).toEqual({
      type: 'game:over',
      names: ['Alice', 'Bob', 'Cat'],
      points: 40,
      unit: 'point',
    });
  });
  it('keeps the game score unit, including a single pair', () => {
    expect(gameOverNotice([standing('Maya', 1)], 'pair')).toEqual({
      type: 'game:over',
      names: ['Maya'],
      points: 1,
      unit: 'pair',
    });
  });
  it('ends a game nobody is left in', () => {
    expect(gameOverNotice([])).toEqual({ type: 'game:ended' });
  });
});
