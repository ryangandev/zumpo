import { readStored, writeStored } from '../../solo/device-store';
import { isLevel, LEVELS, type GomokuLevel } from './computer';
import type { SoloPicks } from './game';

/**
 * What Gomoku on your own keeps on this device at one level: the games won,
 * lost and drawn there, and the current run of wins.
 */
export interface LevelRecord {
  wins: number;
  losses: number;
  draws: number;
  /** Wins in a row, up to the last game. */
  run: number;
}

export type GomokuRecord = Record<GomokuLevel, LevelRecord>;

const RECORD = 'record:gomoku';
const PICKS = 'picks:gomoku';

const NO_RECORD: LevelRecord = { wins: 0, losses: 0, draws: 0, run: 0 };

/** A first game: Medium, playing Black. */
export const FIRST_PICKS: SoloPicks = { level: 'medium', color: 'black' };

export const gamesOf = (record: LevelRecord): number =>
  record.wins + record.losses + record.draws;

const isCount = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0;

function readJson(key: string): unknown {
  try {
    return JSON.parse(readStored(key) ?? 'null');
  } catch {
    return null;
  }
}

function levelRecord(stored: unknown): LevelRecord {
  const record = stored as Partial<LevelRecord> | null | undefined;
  if (
    record &&
    isCount(record.wins) &&
    isCount(record.losses) &&
    isCount(record.draws) &&
    isCount(record.run) &&
    record.run <= record.wins
  ) {
    const { wins, losses, draws, run } = record;
    return { wins, losses, draws, run };
  }
  return { ...NO_RECORD };
}

export function readRecord(): GomokuRecord {
  const stored = readJson(RECORD) as Partial<Record<string, unknown>> | null;
  return Object.fromEntries(
    LEVELS.map((level) => [level, levelRecord(stored?.[level])]),
  ) as GomokuRecord;
}

/** Counts a finished game at `level`, and returns that level's record now. */
export function recordGame(
  level: GomokuLevel,
  result: 'won' | 'lost' | 'draw',
): LevelRecord {
  const record = readRecord();
  const previous = record[level];
  const next: LevelRecord = {
    wins: previous.wins + (result === 'won' ? 1 : 0),
    losses: previous.losses + (result === 'lost' ? 1 : 0),
    draws: previous.draws + (result === 'draw' ? 1 : 0),
    run: result === 'won' ? previous.run + 1 : 0,
  };
  writeStored(RECORD, JSON.stringify({ ...record, [level]: next }));
  return next;
}

/** The picks made last time, offered first; a first game's otherwise. */
export function readPicks(): SoloPicks {
  const stored = readJson(PICKS) as Partial<SoloPicks> | null;
  return {
    level: isLevel(stored?.level) ? stored.level : FIRST_PICKS.level,
    color:
      stored?.color === 'black' || stored?.color === 'white'
        ? stored.color
        : FIRST_PICKS.color,
  };
}

export function writePicks(picks: SoloPicks): void {
  writeStored(PICKS, JSON.stringify(picks));
}
