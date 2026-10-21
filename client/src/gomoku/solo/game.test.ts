import { describe, expect, it } from 'vitest';
import { pointAt, POINTS } from '../../../../shared/gomoku';
import {
  canTakeBack,
  isYourTurn,
  newGame,
  play,
  takeBack,
  toMove,
  youWon,
  type SoloGame,
} from './game';

/** Plays the points in turn, Black first. */
const playAll = (game: SoloGame, points: readonly number[]) =>
  points.reduce(play, game);

/** Colours in pairs of columns, shifted every other row: no five anywhere. */
const colorAt = (point: number) =>
  ((point % 15) + 2 * Math.floor(point / 15)) % 4 < 2 ? 'black' : 'white';

const start = newGame({ level: 'medium', color: 'black' });

describe('a game on your own', () => {
  it('starts with Black to move', () => {
    expect(toMove(start)).toBe('black');
    expect(isYourTurn(start)).toBe(true);
    expect(isYourTurn(newGame({ level: 'easy', color: 'white' }))).toBe(false);
  });

  it('takes back your last stone and the answer to it, on your turn only', () => {
    const asWhite = newGame({ level: 'easy', color: 'white' });
    const opened = play(asWhite, pointAt(7, 8));
    expect(canTakeBack(opened)).toBe(false);
    expect(takeBack(opened)).toBe(opened);

    const answered = playAll(opened, [pointAt(0, 1), pointAt(7, 9)]);
    expect(canTakeBack(answered)).toBe(true);
    expect(takeBack(answered).moves).toEqual(opened.moves);
    // Mid-thought, it is not your turn.
    const thinking = play(answered, pointAt(0, 2));
    expect(takeBack(thinking)).toBe(thinking);
  });

  it('ignores a stone on a taken point or off the board', () => {
    const one = play(start, pointAt(7, 8));
    expect(play(one, pointAt(7, 8))).toBe(one);
    expect(play(one, POINTS)).toBe(one);
    expect(play(one, -1)).toBe(one);
  });

  it('ends on a five down a diagonal into a corner, with its line', () => {
    const black = [0, 1, 2, 3, 4].map((step) => pointAt(step, 1 + step));
    const white = [0, 1, 2, 3].map((step) => pointAt(14, 1 + step * 2));
    const points = black.flatMap((point, index) => [
      point,
      ...(index < white.length ? [white[index]!] : []),
    ]);
    const over = playAll(start, points);
    expect(over.over).toBe(true);
    expect(youWon(over)).toBe(true);
    expect(over.winLines).toEqual([black]);
    expect(play(over, pointAt(7, 8))).toBe(over);
  });

  it('counts six in a row as a win', () => {
    // Black: A8 B8 C8 E8 F8, then D8 joins them into six.
    const black = [0, 1, 2, 4, 5, 3].map((column) => pointAt(column, 8));
    const white = [0, 1, 2, 4, 5].map((column) => pointAt(column, 1));
    const points = black.flatMap((point, index) =>
      index < white.length ? [point, white[index]!] : [point],
    );
    const over = playAll(start, points);
    expect(over.winner).toBe('black');
    expect(over.winLines?.[0]).toHaveLength(6);
  });

  it('is a draw once every point is filled without five', () => {
    const blacks = Array.from({ length: POINTS }, (_, p) => p).filter(
      (p) => colorAt(p) === 'black',
    );
    const whites = Array.from({ length: POINTS }, (_, p) => p).filter(
      (p) => colorAt(p) === 'white',
    );
    const points = blacks.flatMap((point, index) =>
      index < whites.length ? [point, whites[index]!] : [point],
    );
    const over = playAll(start, points);
    expect(over.over).toBe(true);
    expect(over.winner).toBeNull();
    expect(over.moves).toHaveLength(POINTS);
  });
});
