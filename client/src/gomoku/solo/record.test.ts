import { beforeEach, describe, expect, it } from 'vitest';
import { writeStored } from '../../solo/device-store';
import {
  FIRST_PICKS,
  readPicks,
  readRecord,
  recordGame,
  writePicks,
} from './record';

const none = { wins: 0, losses: 0, draws: 0, run: 0 };

beforeEach(() => {
  localStorage.clear();
});

describe('the Gomoku record on this device', () => {
  it('starts empty at every level', () => {
    expect(readRecord()).toEqual({ easy: none, medium: none, hard: none });
  });

  it('counts each level apart, with its run of wins', () => {
    recordGame('medium', 'won');
    recordGame('medium', 'won');
    expect(recordGame('medium', 'draw')).toEqual({
      wins: 2,
      losses: 0,
      draws: 1,
      run: 0,
    });
    expect(recordGame('hard', 'lost')).toEqual({ ...none, losses: 1 });
    expect(recordGame('medium', 'won')).toEqual({
      wins: 3,
      losses: 0,
      draws: 1,
      run: 1,
    });
    expect(readRecord().easy).toEqual(none);
  });

  it('ignores a level whose record does not add up', () => {
    writeStored(
      'record:gomoku',
      '{"easy":{"wins":1,"losses":0,"draws":0,"run":4},"hard":{"wins":2,"losses":1,"draws":0,"run":1}}',
    );
    expect(readRecord()).toEqual({
      easy: none,
      medium: none,
      hard: { wins: 2, losses: 1, draws: 0, run: 1 },
    });
  });

  it('offers the last picks, or Medium playing Black', () => {
    expect(readPicks()).toEqual(FIRST_PICKS);
    writePicks({ level: 'hard', color: 'white' });
    expect(readPicks()).toEqual({ level: 'hard', color: 'white' });
    writeStored('picks:gomoku', '{"level":"expert","color":"red"}');
    expect(readPicks()).toEqual(FIRST_PICKS);
  });
});
