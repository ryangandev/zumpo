/*
 * What a game on your own keeps on this device: best results and the last
 * choice made. localStorage, unlike the session's identity, because a best is
 * the device's, not the tab's. Storage can be blocked or full; then nothing
 * is kept and the games play on.
 */

import type { Messages } from '../i18n';

const PREFIX = 'zumpo:solo:';

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Not kept; the game is unaffected.
  }
}

/** A best kept as a non-negative number, lower being better. */
export function readBest(key: string): number | null {
  const stored = Number(readStored(`best:${key}`));
  return Number.isFinite(stored) && stored > 0 ? stored : null;
}

/**
 * Keeps `result` when it beats the stored best, and says what it beat. Lower
 * is better: milliseconds, or turns.
 */
export function recordBest(
  key: string,
  result: number,
): { previous: number | null; isBest: boolean } {
  const previous = readBest(key);
  const isBest = previous === null || result < previous;
  if (isBest) writeStored(`best:${key}`, String(result));
  return { previous, isBest };
}

/** "3:05": a run's time, in whole seconds. */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** One day's best, lower being better. `day` is local: "2026-10-04". */
export interface DayBest {
  day: string;
  result: number;
}

/** How many days of bests are kept. */
const DAYS_KEPT = 7;

/** A local calendar day, as bests are kept by. */
export function dayOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The best of each of the last few days played, latest first. */
export function readDayBests(key: string): DayBest[] {
  try {
    const stored: unknown = JSON.parse(readStored(`days:${key}`) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter(
      (entry): entry is DayBest =>
        typeof entry?.day === 'string' &&
        Number.isFinite(entry?.result) &&
        entry.result > 0,
    );
  } catch {
    return [];
  }
}

/** Keeps `result` as `date`'s best when it beats it, and says whether it did. */
export function recordDayBest(key: string, result: number, date: Date) {
  const day = dayOf(date);
  const days = readDayBests(key);
  const today = days.find((entry) => entry.day === day);
  if (today && today.result <= result) return { isDayBest: false };
  const kept = [{ day, result }, ...days.filter((entry) => entry.day !== day)]
    .toSorted((a, b) => b.day.localeCompare(a.day))
    .slice(0, DAYS_KEPT);
  writeStored(`days:${key}`, JSON.stringify(kept));
  return { isDayBest: true };
}

/** "Today", "Yesterday", "Oct 1": a kept day, as of `now`. */
export function dayLabel(day: string, now: Date, m: Messages): string {
  if (day === dayOf(now)) return m.solo.today;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (day === dayOf(yesterday)) return m.solo.yesterday;
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return m.solo.date(new Date(year, month - 1, date));
}
