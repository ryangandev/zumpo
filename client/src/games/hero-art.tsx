import type { CSSProperties } from 'react';
import {
  Die,
  LetterTile,
  NumberCard,
  PairsCard,
  symbolNamed,
  TriosCard,
} from '../ui';
import { cx } from '../ui/cx';
import styles from './hero-art.module.css';

/**
 * Where a piece sits in P01's 560 × 300 hero art: Figma's x, y and rotation,
 * which turns about the top left corner and counts anticlockwise.
 */
const at = (x: number, y: number, rotation = 0): CSSProperties => ({
  left: x,
  top: y,
  transform: rotation ? `rotate(${-rotation}deg)` : undefined,
});

/**
 * The home page hero's right side: real pieces from the games, as the first
 * Paper Pop concept drew paper objects there. Decoration only.
 */
export function HeroArt({ className }: { className?: string }) {
  return (
    <div className={cx(styles.art, className)} aria-hidden="true">
      <span className={styles.backdrop} style={at(150, 10)} />
      <span className={styles.piece} style={at(140, 40, 8)}>
        <NumberCard value="24" state="solved" />
      </span>
      <span className={styles.piece} style={at(330, 36, -7)}>
        <TriosCard card={6} state="found" size="compact" />
      </span>
      {/* A Daily Word row, whose words are English in every language, and
          the brand's "FUN", as the footer keeps "play a little". */}
      <span className={styles.word} style={at(236, 196, 3)} lang="en">
        <LetterTile letter="F" state="correct" />
        <LetterTile letter="U" state="present" />
        <LetterTile letter="N" state="correct" />
      </span>
      <span className={styles.piece} style={at(470, 150, -12)}>
        <Die face={5} state="counted" label={null} />
      </span>
      <span className={styles.piece} style={at(40, 170, 10)}>
        <PairsCard
          state={{ kind: 'up', symbol: symbolNamed('Star Orange') }}
          row={0}
          column={0}
        />
      </span>
      <span className={styles.coral} style={at(470, 40)} />
      <span className={styles.lime} style={at(110, 120)} />
    </div>
  );
}
