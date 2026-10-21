import { describe, expect, it } from 'vitest';
import { neighboursOf } from '../../../../shared/minesweeper';
import {
  cellAt,
  chord,
  elapsed,
  minesLeft,
  clearedCells,
  safeCells,
  newGame,
  reveal,
  toggleFlag,
  type SoloGame,
} from './game';

/** A seeded random source, so a test lays the same mines every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const mineIndexes = (game: SoloGame) =>
  game.layout.flatMap((mine, index) => (mine ? [index] : []));

const started = (seed = 1, first = 40) =>
  reveal(newGame('Small'), first, 1000, seeded(seed));

describe('the first click', () => {
  it('lays the mines, starts the clock and always opens an area', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const first = (seed * 7) % 81;
      const game = started(seed, first);
      expect(mineIndexes(game)).toHaveLength(10);
      expect(game.layout[first]).toBe(false);
      for (const neighbour of neighboursOf(game, first)) {
        expect(game.layout[neighbour]).toBe(false);
      }
      expect(cellAt(game, first)).toBe(0);
      expect(game.open.filter(Boolean).length).toBeGreaterThan(1);
      expect(game.startedAt).toBe(1000);
      expect(game.status === 'playing' || game.status === 'won').toBe(true);
    }
  });

  it('leaves a game untouched until then', () => {
    const game = newGame('Medium');
    expect(game.status).toBe('ready');
    expect(elapsed(game, 5000)).toBe(0);
    expect(cellAt(game, 0)).toBe('hidden');
    expect(minesLeft(game)).toBe(40);
  });
});

describe('opening cells', () => {
  it('a number opens only itself', () => {
    const game = started();
    const index = game.adjacent.findIndex(
      (count, at) => count > 0 && !game.layout[at] && !game.open[at],
    );
    const next = reveal(game, index, 2000);
    expect(next.open.filter(Boolean).length).toBe(
      game.open.filter(Boolean).length + 1,
    );
    expect(cellAt(next, index)).toBe(game.adjacent[index]);
  });

  it('a mine loses and shows every mine, the hit one apart', () => {
    let game = started();
    const [hit, flagged, ...rest] = mineIndexes(game);
    const wrong = game.layout.findIndex((mine, at) => !mine && !game.open[at]);
    game = toggleFlag(toggleFlag(game, flagged!), wrong);
    const lost = reveal(game, hit!, 4000);
    expect(lost.status).toBe('lost');
    expect(lost.endedAt).toBe(4000);
    expect(cellAt(lost, hit!)).toBe('hit');
    expect(cellAt(lost, flagged!)).toBe('flag');
    expect(cellAt(lost, wrong)).toBe('wrong-flag');
    for (const mine of rest) expect(cellAt(lost, mine)).toBe('mine');
    expect(safeCells(lost)).toBe(71);
    expect(clearedCells(lost)).toBe(game.open.filter(Boolean).length);
    expect(elapsed(lost, 9999)).toBe(3000);
    // The game is over: nothing more opens or flags.
    expect(reveal(lost, rest[0]!, 5000)).toBe(lost);
    expect(toggleFlag(lost, rest[0]!)).toBe(lost);
  });

  it('opening every safe cell wins and flags the mines', () => {
    let game = started();
    for (let index = 0; index < 81; index++) {
      if (!game.layout[index]) game = reveal(game, index, 61_000);
    }
    expect(game.status).toBe('won');
    expect(elapsed(game, 99_000)).toBe(60_000);
    expect(minesLeft(game)).toBe(0);
    for (const mine of mineIndexes(game))
      expect(cellAt(game, mine)).toBe('flag');
  });
});

describe('flags', () => {
  it('toggle on hidden cells only, and block opening', () => {
    const game = started();
    const hidden = game.open.findIndex((isOpen) => !isOpen);
    const flagged = toggleFlag(game, hidden);
    expect(cellAt(flagged, hidden)).toBe('flag');
    expect(minesLeft(flagged)).toBe(9);
    expect(reveal(flagged, hidden, 2000)).toBe(flagged);
    expect(cellAt(toggleFlag(flagged, hidden), hidden)).toBe('hidden');
    const open = game.open.findIndex(Boolean);
    expect(toggleFlag(game, open)).toBe(game);
  });

  it('can count below zero', () => {
    let game = started();
    const hidden = game.open.flatMap((isOpen, at) => (isOpen ? [] : [at]));
    for (const index of hidden.slice(0, 12)) game = toggleFlag(game, index);
    expect(minesLeft(game)).toBe(-2);
  });
});

/** An open number with all its mines flagged, and hidden safe cells left. */
function chordable(game: SoloGame) {
  for (let index = 0; index < game.open.length; index++) {
    if (!game.open[index] || game.adjacent[index] === 0) continue;
    const around = neighboursOf(game, index);
    const hiddenSafe = around.filter(
      (at) => !game.open[at] && !game.layout[at],
    );
    if (hiddenSafe.length === 0) continue;
    let flagged = game;
    for (const at of around)
      if (game.layout[at]) flagged = toggleFlag(flagged, at);
    return { index, flagged, hiddenSafe, around };
  }
  throw new Error('no chordable number on this board');
}

describe('a chord', () => {
  it('opens the rest of a number’s neighbours once its flags add up', () => {
    const { index, flagged, hiddenSafe } = chordable(started(3));
    const next = chord(flagged, index, 3000);
    for (const at of hiddenSafe) expect(next.open[at]).toBe(true);
  });

  it('does nothing while the flags do not add up', () => {
    const game = started(3);
    const { index } = chordable(game);
    expect(chord(game, index, 3000)).toBe(game);
  });

  it('opens a mine when a flag was wrong', () => {
    const game = started(3);
    const { index, around } = chordable(game);
    const mines = around.filter((at) => game.layout[at]);
    const safe = around.filter((at) => !game.open[at] && !game.layout[at]);
    // Flag a safe cell in place of one mine: the chord opens that mine.
    let wrong = toggleFlag(game, safe[0]!);
    for (const mine of mines.slice(1)) wrong = toggleFlag(wrong, mine);
    const lost = chord(wrong, index, 3000);
    expect(lost.status).toBe('lost');
    expect(lost.hit).toBe(mines[0]);
    expect(cellAt(lost, safe[0]!)).toBe('wrong-flag');
  });
});
