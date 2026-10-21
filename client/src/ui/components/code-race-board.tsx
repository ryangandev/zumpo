import type { CodeBreakerRow } from '../../../../shared/wire-types';
import { useMessages } from '../../i18n';
import { cx } from '../cx';
import { CodeBoard, type CodeBoardRow } from './code-board';
import { CodeMarksBoard } from './code-marks-board';
import styles from './code-race-board.module.css';

export type CodeRaceBoardState = 'guessing' | 'cracked' | 'out';

export interface CodeRaceBoardProps {
  name: string;
  /** "4 guesses", "Cracked · +633", "Missed". */
  status: string;
  state?: CodeRaceBoardState;
  /**
   * The rows: marks only during a round, so a row's digits are never needed;
   * with their digits at the reveal.
   */
  rows: readonly CodeBreakerRow[];
  /**
   * Column stacks the name over the board, for boards side by side; Row puts
   * the name beside the board and fills the width, for a phone's list of
   * boards with digits, where two do not fit across.
   */
  layout?: 'column' | 'row';
  /** Each guess's accessible name, on a board with digits. */
  describe?: (row: CodeBoardRow) => string;
}

/**
 * Zumpo/Code race board: one player's board beside their name, as pegs only
 * during a round and with the digits at the reveal.
 */
export function CodeRaceBoard({
  name,
  status,
  state = 'guessing',
  rows,
  layout = 'column',
  describe,
}: CodeRaceBoardProps) {
  const m = useMessages();
  const label = m.ui.code.board(name);
  const digits = describe !== undefined;
  return (
    <div
      className={cx(
        styles.race,
        digits && styles.digits,
        styles[state],
        layout === 'row' && styles.row,
      )}
    >
      <div className={styles.head}>
        <span className={styles.name}>{name}</span>
        <span className={styles.status}>{status}</span>
      </div>
      {digits ? (
        <CodeBoard
          rows={rows.map((row) => ({ guess: row.guess ?? '', mark: row.mark }))}
          size="small"
          label={label}
          describe={describe}
        />
      ) : (
        <CodeMarksBoard marks={rows.map((row) => row.mark)} label={label} />
      )}
    </div>
  );
}
