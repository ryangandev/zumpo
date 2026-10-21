import { CODE_LENGTH, MAX_GUESSES } from '../../../../shared/code-breaker';
import type { CodeBreakerMark } from '../../../../shared/wire-types';
import { cx } from '../cx';
import { CodeMarks } from './code-marks';
import { DigitTile, type DigitTileState } from './digit-tile';
import styles from './code-board.module.css';

/** A guess: its digits, and its mark. */
export interface CodeBoardRow {
  guess: string;
  mark: CodeBreakerMark;
}

export interface CodeBoardProps {
  rows: readonly CodeBoardRow[];
  /** The digits typed into the next row. */
  typed?: string;
  /** Which typed tile to nudge, and a count that nudges it again. */
  nudge?: { index: number; count: number } | null;
  /** Compact is your board; Small a board beside the others'. */
  size?: 'compact' | 'small';
  /**
   * Only the rows guessed, or one empty row where there are none: a finished
   * board, whose empty rows would say nothing.
   */
  played?: boolean;
  /** The board's accessible name: "Your guesses", "Maya’s board". */
  label: string;
  /** Each guess's accessible name: "4 1 7 0: 2 in place, 2 elsewhere". */
  describe: (row: CodeBoardRow) => string;
  className?: string;
}

/**
 * Zumpo/Code board: ten Code rows, each four Digit tiles and the pegs beside
 * them. A guess that cracked the code is green.
 */
export function CodeBoard({
  rows,
  typed = '',
  nudge,
  size = 'compact',
  played = false,
  label,
  describe,
  className,
}: CodeBoardProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(styles.board, styles[size], className)}
    >
      {Array.from(
        { length: played ? Math.max(rows.length, 1) : MAX_GUESSES },
        (_, index) => {
          const row = rows[index];
          const open = index === rows.length;
          const state: DigitTileState = row
            ? row.mark.right === CODE_LENGTH
              ? 'cracked'
              : 'guessed'
            : 'empty';
          // The row being typed reads as its digits so far: "4 0 7".
          const name = row
            ? describe(row)
            : open && typed
              ? [...typed].join(' ')
              : undefined;
          return (
            <div
              key={index}
              role={name ? 'img' : undefined}
              aria-label={name}
              className={styles.row}
              data-play-current={open ? '' : undefined}
            >
              <span className={styles.digits} aria-hidden="true">
                {Array.from({ length: CODE_LENGTH }, (_digit, place) => {
                  const digit = row
                    ? row.guess[place]
                    : open
                      ? typed[place]
                      : '';
                  return (
                    <DigitTile
                      key={place}
                      digit={digit}
                      state={row ? state : digit ? 'typed' : 'empty'}
                      size={size}
                      nudge={
                        open && nudge?.index === place ? nudge.count : undefined
                      }
                    />
                  );
                })}
              </span>
              <CodeMarks mark={row?.mark} decorative />
            </div>
          );
        },
      )}
    </div>
  );
}
