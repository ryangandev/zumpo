import { useEffect, useState } from 'react';
import { puzzleNumber as codePuzzle } from '../../../shared/code-breaker';
import type { GameType } from '../../../shared/wire-types';
import {
  readRecords as readCodes,
  todayOf as codeToday,
} from '../code-breaker/solo/records';
import { readStored } from '../solo/device-store';

/**
 * Where today's puzzle of a daily game stands on this device, once it is
 * started: the guess it is on, or done, with the streak that leaves.
 */
export type DailyToday =
  | { state: 'playing'; guess: number; of: number }
  | { state: 'done'; streak: number };

/**
 * Where Daily Word keeps its records. Here, not beside them, so the home page
 * can see there are some without loading the word lists that read them.
 */
export const DAILY_WORD_RECORDS = 'daily-word:puzzles';

/**
 * Today's state of a daily game, for its card and its page; null for any
 * other game, and before today's first guess. Daily Word's is worked out once
 * its word lists have loaded, and only when it has been played here.
 */
export function useToday(type: GameType): DailyToday | null {
  const [today, setToday] = useState<DailyToday | null>(() =>
    type === 'code-breaker'
      ? codeToday(readCodes(), codePuzzle(new Date()))
      : null,
  );
  useEffect(() => {
    if (type !== 'daily-word' || readStored(DAILY_WORD_RECORDS) === null)
      return;
    let live = true;
    void Promise.all([
      import('../daily-word/solo/records'),
      import('../../../shared/daily-word'),
    ]).then(([records, rules]) => {
      if (live) {
        setToday(
          records.todayOf(
            records.readRecords(),
            rules.puzzleNumber(new Date()),
          ),
        );
      }
    });
    return () => {
      live = false;
    };
  }, [type]);
  return today;
}
