/**
 * Days for a daily puzzle: Daily Word's word and Code Breaker's code. A day
 * is the device's own calendar date, so everybody plays puzzle n on the same
 * date wherever they are, and the next one comes out at their own midnight.
 */

/** A calendar date, months from 1. */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since 1970 for a calendar date, whatever the time zone. */
const dayIndex = ({ year, month, day }: CalendarDate) =>
  Math.round(Date.UTC(year, month - 1, day) / DAY_MS);

/** Puzzle numbers counted from `first`, which is puzzle #1. */
export function puzzleDays(first: CalendarDate) {
  const firstIndex = dayIndex(first);
  const number = (today: CalendarDate) =>
    Math.max(1, dayIndex(today) - firstIndex + 1);
  return {
    /**
     * The puzzle for the device's own date, from 1. A clock set before the
     * first day plays the first.
     */
    puzzleNumber: (now: Date): number =>
      number({
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
      }),
    /** The same, for the UTC date, which is what the server goes by. */
    utcPuzzleNumber: (now: Date): number =>
      number({
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
        day: now.getUTCDate(),
      }),
  };
}

/** Milliseconds until the device's next midnight, when the next puzzle is out. */
export function msUntilMidnight(now: Date): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}
