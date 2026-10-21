import { describe, expect, it } from 'vitest';
import { departureFrom } from '../../shared/room.js';

const seats = (...points: number[]) =>
  Object.fromEntries(
    points.map((p, index) => [`p${index + 1}`, { points: p }]),
  );

describe('what a departure mid-game does', () => {
  it('cuts most games short below their fewest players', () => {
    expect(departureFrom({ gameType: 'minesweeper', seats: seats(4) })).toEqual(
      { kind: 'cut-short' },
    );
    expect(
      departureFrom({ gameType: 'minesweeper', seats: seats(4, 0) }),
    ).toEqual({ kind: 'plays-on' });
    expect(departureFrom({ gameType: 'hush', seats: seats(0) })).toEqual({
      kind: 'cut-short',
    });
  });

  it('hands Gomoku to the one left', () => {
    expect(departureFrom({ gameType: 'gomoku', seats: seats(0) })).toEqual({
      kind: 'decided',
      winner: 'p1',
    });
  });

  it('gives Liar’s Dice to the one player left with dice', () => {
    expect(
      departureFrom({ gameType: 'liars-dice', seats: seats(2, 0) }),
    ).toEqual({ kind: 'decided', winner: 'p1' });
    expect(
      departureFrom({ gameType: 'liars-dice', seats: seats(2, 1, 0) }),
    ).toEqual({ kind: 'plays-on' });
    expect(departureFrom({ gameType: 'liars-dice', seats: seats(3) })).toEqual({
      kind: 'cut-short',
    });
  });

  it('plays a Doodle Chain on down to two, and never cuts the reveal short', () => {
    const chain = { gameType: 'doodle-chain' as const, step: 2, steps: 3 };
    expect(
      departureFrom({ ...chain, phase: 'draw', seats: seats(0, 0) }),
    ).toEqual({ kind: 'plays-on' });
    expect(departureFrom({ ...chain, phase: 'draw', seats: seats(0) })).toEqual(
      { kind: 'cut-short' },
    );
    expect(
      departureFrom({ ...chain, phase: 'passing', seats: seats(0) }),
    ).toEqual({ kind: 'cut-short' });
    expect(
      departureFrom({ ...chain, phase: 'passing', step: 3, seats: seats(0) }),
    ).toEqual({ kind: 'plays-on' });
    expect(
      departureFrom({ ...chain, phase: 'reveal', step: 3, seats: seats() }),
    ).toEqual({ kind: 'plays-on' });
  });
});
