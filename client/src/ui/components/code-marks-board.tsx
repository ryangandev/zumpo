import { MAX_GUESSES } from '../../../../shared/code-breaker';
import type { CodeBreakerMark } from '../../../../shared/wire-types';
import { CodeMarks } from './code-marks';
import styles from './code-marks-board.module.css';

export interface CodeMarksBoardProps {
  marks: readonly CodeBreakerMark[];
  /** The board's accessible name: "Maya’s board", "Your marks". */
  label: string;
}

/**
 * Zumpo/Code marks board: a board as marks only, ten rows of pegs in a row
 * and never a digit. The others' boards while a round runs, and the preview
 * of a challenge.
 */
export function CodeMarksBoard({ marks, label }: CodeMarksBoardProps) {
  return (
    <div role="group" aria-label={label} className={styles.board}>
      {Array.from({ length: MAX_GUESSES }, (_, index) => (
        <CodeMarks key={index} mark={marks[index]} layout="row" />
      ))}
    </div>
  );
}
