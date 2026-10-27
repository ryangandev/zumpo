import { describe, expect, it } from 'vitest';
import type { LiarsDiceCup } from '../../../shared/wire-types';
import { liarsDiceState, ME } from '../tests/fixtures';
import { isNewLiarsDiceGame, turnOf } from './sounds';

const MAYA = 'p2';
const LEO = 'p3';

const cup = (playerId: string, diceLeft = 5): LiarsDiceCup => ({
  playerId,
  diceLeft,
  dice: null,
  outInRound: null,
});

const bid = { playerId: ME, count: 2, face: 3 };

const at = (round: number, cups: LiarsDiceCup[], bids = 0) =>
  liarsDiceState({
    isGameStarted: true,
    phase: 'bidding',
    round,
    cups,
    bids: Array.from({ length: bids }, () => bid),
  });

const three = [cup(ME), cup(MAYA), cup(LEO)];

describe('a Liar’s Dice room’s goes and games', () => {
  it('names each bid within its roll, by the dice still in', () => {
    expect(turnOf(at(3, three))).toBe('3.15.0');
    expect(turnOf(at(3, three, 2))).toBe('3.15.2');
  });

  it('never names a go twice when a round is rolled again', () => {
    // Leo leaves with dice two bids in: round 3 is rolled again without him.
    const before = [0, 1, 2].map((bids) => turnOf(at(3, three, bids)));
    const again = [0, 1, 2].map((bids) =>
      turnOf(at(3, [cup(ME), cup(MAYA)], bids)),
    );
    expect(new Set([...before, ...again]).size).toBe(6);
  });

  it('keeps the go’s name when a player already out leaves', () => {
    const out = { ...cup(LEO, 0), outInRound: 2 };
    const go = at(3, [cup(ME), cup(MAYA), out], 2);
    expect(turnOf(at(3, [cup(ME), cup(MAYA)], 2))).toBe(turnOf(go));
  });

  it('tells another game by its rounds, its players, or its dice', () => {
    const late = at(4, [cup(ME, 3), cup(MAYA, 2)]);
    expect(isNewLiarsDiceGame(late, at(1, [cup(ME), cup(MAYA)]))).toBe(true);
    expect(isNewLiarsDiceGame(late, at(4, [cup(ME, 3), cup(LEO, 2)]))).toBe(
      true,
    );
    expect(isNewLiarsDiceGame(late, at(4, [cup(ME, 5), cup(MAYA, 5)]))).toBe(
      true,
    );
    // The same game, further on: a die lost, a player gone.
    expect(isNewLiarsDiceGame(late, at(5, [cup(ME, 3), cup(MAYA, 1)]))).toBe(
      false,
    );
    expect(isNewLiarsDiceGame(late, at(4, [cup(ME, 3)]))).toBe(false);
  });
});
