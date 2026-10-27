import { describe, expect, it } from 'vitest';
import { gomokuState, ME } from '../tests/fixtures';
import { isNewGomokuGame, turnOf } from './sounds';

const MAYA = 'p2';
const LEO = 'p3';

const pair = (black: string, white: string) => ({
  black: { playerId: black, username: black },
  white: { playerId: white, username: white },
});

const game = (gameNumber: number, moves: number, colors = pair(ME, MAYA)) =>
  gomokuState({
    isGameStarted: true,
    phase: 'playing',
    gameNumber,
    colors,
    moves: Array.from({ length: moves }, (_, index) => ({
      color: index % 2 === 0 ? ('black' as const) : ('white' as const),
      point: index,
    })),
  });

describe('a Gomoku room’s goes and games', () => {
  it('names each go by the turns taken, a turn lost to the clock included', () => {
    expect(turnOf(game(1, 0))).toBe('0');
    expect(turnOf(game(1, 7))).toBe('7');
    const lost = gomokuState({
      ...game(1, 7),
      moves: [...game(1, 7).moves, { color: 'white', point: null }],
    });
    expect(turnOf(lost)).toBe('8');
  });

  it('tells another game by its number or its pair', () => {
    expect(isNewGomokuGame(game(1, 12), game(2, 3))).toBe(true);
    // A new pair counts from 1 again.
    expect(isNewGomokuGame(game(1, 12), game(1, 3, pair(LEO, MAYA)))).toBe(
      true,
    );
    expect(isNewGomokuGame(game(1, 12), game(1, 3, pair(MAYA, ME)))).toBe(true);
    expect(isNewGomokuGame(game(2, 3), game(2, 9))).toBe(false);
  });
});
