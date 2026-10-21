import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { zh } from '../i18n/zh';
import { gomokuState, ME, minesweeperState } from '../tests/fixtures';
import { leaveCost } from './dialogs';

const seat = (username: string, points = 0, isConnected = true) => ({
  username,
  points,
  isConnected,
});
const threePlayers = {
  p1: seat('Ryan', 40),
  p2: seat('Maya'),
  p3: seat('Sam'),
};
const playing = { isGameStarted: true, phase: 'picking' as const, round: 1 };
const asGuest = { owner: { username: 'Maya', playerId: 'p2' } };

describe('what leaving costs', () => {
  it('is the seat and score while the game carries on', () => {
    expect(
      leaveCost(
        minesweeperState({ ...playing, ...asGuest, playerList: threePlayers }),
        ME,
        en,
      ),
    ).toBe(
      'The game carries on without you, and your seat and your 40 points go with you. You can join again while a seat is open.',
    );
  });

  it('leaves no score out, rather than "your 0 points"', () => {
    expect(
      leaveCost(
        minesweeperState({
          ...playing,
          ...asGuest,
          playerList: { ...threePlayers, p1: seat('Ryan') },
        }),
        ME,
        en,
      ),
    ).toBe(
      'The game carries on without you, and your seat goes with you. You can join again while a seat is open.',
    );
  });

  it('is the game, for everyone, when too few would be left', () => {
    expect(
      leaveCost(minesweeperState({ ...playing, ...asGuest }), ME, en),
    ).toBe(
      'Too few players would be left, so leaving ends the game for everyone.',
    );
  });

  it('is the game, to the opponent, in Gomoku', () => {
    expect(
      leaveCost(
        gomokuState({ isGameStarted: true, phase: 'playing', ...asGuest }),
        ME,
        en,
      ),
    ).toBe('Leaving ends the game, and Maya wins it.');
    expect(
      leaveCost(
        gomokuState({ isGameStarted: true, phase: 'playing', ...asGuest }),
        ME,
        zh,
      ),
    ).toBe('离开会结束这一局，Maya 获胜。');
  });

  it('names the next host, somebody here before somebody away', () => {
    expect(
      leaveCost(
        minesweeperState({
          ...playing,
          playerList: { ...threePlayers, p2: seat('Maya', 0, false) },
        }),
        ME,
        en,
      ),
    ).toBe(
      'The game carries on without you, and your seat and your 40 points go with you. You can join again while a seat is open. Sam becomes the host.',
    );
  });

  it('says a host alone closes the room', () => {
    expect(
      leaveCost(minesweeperState({ playerList: { p1: seat('Ryan') } }), ME, en),
    ).toBe(
      'Your seat goes with you. You can join again while a seat is open. Nobody else is here, so the room closes.',
    );
  });

  it('costs a spectator nothing', () => {
    expect(
      leaveCost(
        minesweeperState({
          ...playing,
          ...asGuest,
          playerList: { p2: seat('Maya'), p3: seat('Sam') },
          spectators: { p1: { username: 'Ryan', isConnected: true } },
        }),
        ME,
        en,
      ),
    ).toBe(
      'You’re only watching, so nothing is lost. You can come back while a spectator seat is open.',
    );
  });
});
