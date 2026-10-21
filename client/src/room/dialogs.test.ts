import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { zh } from '../i18n/zh';
import {
  doodleChainState,
  gomokuState,
  liarsDiceState,
  ME,
  minesweeperState,
} from '../tests/fixtures';
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

  it('says a host alone closes the room, and nothing about coming back', () => {
    expect(
      leaveCost(minesweeperState({ playerList: { p1: seat('Ryan') } }), ME, en),
    ).toBe('Nobody else is here, so the room closes.');
  });

  it('plays a Doodle Chain on with two of three, as the server does', () => {
    expect(
      leaveCost(
        doodleChainState({
          ...asGuest,
          isGameStarted: true,
          phase: 'draw',
          step: 2,
        }),
        ME,
        en,
      ),
    ).toBe(
      'The game carries on without you, and your seat goes with you. You can join again while a seat is open.',
    );
  });

  it('ends a Doodle Chain mid-step when one would be left', () => {
    const twoAtTheTable = { p1: seat('Ryan'), p2: seat('Maya') };
    expect(
      leaveCost(
        doodleChainState({
          ...asGuest,
          playerList: twoAtTheTable,
          isGameStarted: true,
          phase: 'write',
          step: 1,
        }),
        ME,
        en,
      ),
    ).toBe(
      'Too few players would be left, so leaving ends the game for everyone.',
    );
    // The last step played and passing, or the reveal: nothing ends early.
    for (const late of [
      { phase: 'passing' as const, step: 3 },
      { phase: 'reveal' as const, step: 3 },
    ]) {
      expect(
        leaveCost(
          doodleChainState({
            ...asGuest,
            playerList: twoAtTheTable,
            isGameStarted: true,
            ...late,
          }),
          ME,
          en,
        ),
      ).toBe(
        'The game carries on without you, and your seat goes with you. You can join again while a seat is open.',
      );
    }
  });

  it('hands Liar’s Dice to the one player left with dice', () => {
    expect(
      leaveCost(
        liarsDiceState({
          ...asGuest,
          isGameStarted: true,
          phase: 'bidding',
          playerList: {
            p1: seat('Ryan', 2),
            p2: seat('Maya', 1),
            p3: seat('Sam'),
          },
        }),
        ME,
        en,
      ),
    ).toBe('Leaving ends the game, and Maya wins it.');
  });

  it('plays Liar’s Dice on while two still hold dice, and ends it with one seat left', () => {
    expect(
      leaveCost(
        liarsDiceState({
          ...asGuest,
          isGameStarted: true,
          phase: 'bidding',
          playerList: {
            p1: seat('Ryan', 2),
            p2: seat('Maya', 1),
            p3: seat('Sam', 3),
          },
        }),
        ME,
        en,
      ),
    ).toBe(
      'The game carries on without you, and your seat and your 2 dice go with you. You can join again while a seat is open.',
    );
    expect(
      leaveCost(
        liarsDiceState({
          ...asGuest,
          isGameStarted: true,
          phase: 'bidding',
          playerList: { p1: seat('Ryan', 2), p2: seat('Maya', 1) },
        }),
        ME,
        en,
      ),
    ).toBe(
      'Too few players would be left, so leaving ends the game for everyone.',
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
