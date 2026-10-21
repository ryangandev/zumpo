import { useMessages } from '../../i18n';
import { cx } from '../cx';
import { WordBoard, type WordBoardRow } from './word-board';
import styles from './race-board.module.css';

export type RaceBoardState = 'guessing' | 'found' | 'out';

export interface RaceBoardProps {
  name: string;
  /** "3 guesses", "Found · +431", "Missed". */
  status: string;
  state?: RaceBoardState;
  /**
   * Mini during a round, marks only and never letters; Small at the reveal,
   * with the letters and only the rows played.
   */
  board?: 'mini' | 'small';
  /**
   * Column stacks the name over the board, for boards side by side; Row puts
   * the name beside the board and fills the width, for a phone's list of
   * Small boards (DW15, DW16), where two do not fit across.
   */
  layout?: 'column' | 'row';
  rows: readonly WordBoardRow[];
}

/** Zumpo/Race board: one player's board beside their name. */
export function RaceBoard({
  name,
  status,
  state = 'guessing',
  board = 'mini',
  layout = 'column',
  rows,
}: RaceBoardProps) {
  const m = useMessages();
  return (
    <div
      className={cx(
        styles.race,
        styles[board],
        styles[state],
        layout === 'row' && styles.row,
      )}
    >
      <div className={styles.head}>
        <span className={styles.name}>{name}</span>
        <span className={styles.status}>{status}</span>
      </div>
      <WordBoard
        rows={rows}
        size={board}
        played={board === 'small'}
        label={m.ui.word.board(name)}
      />
    </div>
  );
}
