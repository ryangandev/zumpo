import { pegsOf } from '../../../../shared/code-breaker';
import type { CodeBreakerMark } from '../../../../shared/wire-types';
import { useMessages } from '../../i18n';
import { cx } from '../cx';
import { LetterTile, type LetterTileState } from './letter-tile';
import styles from './code-marks.module.css';

export interface CodeMarksProps {
  /** A guess's mark; none on a row not guessed yet, which shows empty pegs. */
  mark?: CodeBreakerMark | null;
  /**
   * Grid is a 2 × 2 square beside a guess, so the pegs are never read as
   * places; Row stands where there are no digits: the others' boards.
   */
  layout?: 'grid' | 'row';
  /** Beside a guess whose own name says its mark, the pegs say nothing. */
  decorative?: boolean;
}

const PEG: Readonly<Record<'right' | 'moved' | 'none', LetterTileState>> = {
  right: 'correct',
  moved: 'present',
  none: 'absent',
};

/**
 * Zumpo/Code marks: four pegs, a green square for each digit in place, then a
 * coral circle for each one elsewhere, then grey for the rest. Their shapes
 * are the Letter tile's, so they read without colour too.
 */
export function CodeMarks({
  mark,
  layout = 'grid',
  decorative = false,
}: CodeMarksProps) {
  const m = useMessages();
  const pegs: LetterTileState[] = mark
    ? pegsOf(mark).map((peg) => PEG[peg])
    : ['empty', 'empty', 'empty', 'empty'];
  const named = mark && !decorative;
  return (
    <span
      role={named ? 'img' : undefined}
      aria-label={named ? m.ui.code.mark(mark.right, mark.moved) : undefined}
      aria-hidden={named ? undefined : true}
      className={cx(styles.marks, styles[layout])}
    >
      {pegs.map((state, index) => (
        <span key={index} className={styles.peg} aria-hidden="true">
          <LetterTile state={state} size="mini" />
        </span>
      ))}
    </span>
  );
}
