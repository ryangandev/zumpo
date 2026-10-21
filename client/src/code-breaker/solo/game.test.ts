import { describe, expect, it } from 'vitest';
import {
  deleteKey,
  guessesToCrack,
  isOver,
  newGame,
  rowsOf,
  settledDigits,
  submit,
  typeKey,
  type SoloGame,
} from './game';

const type = (game: SoloGame, digits: string) =>
  submit([...digits].reduce(typeKey, game));

describe('a code on your own', () => {
  it('marks each guess and is cracked at four in place', () => {
    let game = type(newGame('4071'), '1234');
    expect(rowsOf(game)).toEqual([
      { guess: '1234', mark: { right: 0, moved: 2 } },
    ]);
    game = type(game, '4071');
    expect(isOver(game)).toBe(true);
    expect(guessesToCrack(game)).toBe(2);
    // A finished game takes nothing more.
    expect(typeKey(game, '5')).toBe(game);
    expect(deleteKey(game)).toBe(game);
  });

  it('turns back a short row or a repeat, costing nothing', () => {
    let game = type(newGame('4071'), '123');
    expect(game.draft).toMatchObject({ typed: '123', problem: 'tooShort' });
    expect(game.guesses).toEqual([]);
    game = type(type(newGame('4071'), '1234'), '1234');
    expect(game.draft.problem).toBe('alreadyGuessed');
    expect(game.guesses).toEqual(['1234']);
  });

  it('is missed after ten guesses', () => {
    const misses = ['0123', '0124', '0125', '0126', '0127'];
    const more = ['0128', '0129', '0132', '0134', '0135'];
    const game = [...misses, ...more].reduce(type, newGame('4071'));
    expect(isOver(game)).toBe(true);
    expect(guessesToCrack(game)).toBeNull();
  });
});

const row = (guess: string, right: number, moved: number) => ({
  guess,
  mark: { right, moved },
});

describe('the digits the marks settle', () => {
  it('is nothing until a row has no pegs or four', () => {
    expect(settledDigits([row('1234', 0, 2)])).toEqual({ in: [], out: [] });
  });

  it('rules out a row with no pegs', () => {
    expect(settledDigits([row('5689', 0, 0)])).toEqual({
      in: [],
      out: ['5', '6', '8', '9'],
    });
  });

  it('settles every digit once four are found', () => {
    expect(settledDigits([row('4170', 2, 2)])).toEqual({
      in: ['0', '1', '4', '7'],
      out: ['2', '3', '5', '6', '8', '9'],
    });
    // Six ruled out leave the code's four.
    expect(settledDigits([row('5689', 0, 0), row('2389', 0, 0)]).in).toEqual([
      '0',
      '1',
      '4',
      '7',
    ]);
  });
});
