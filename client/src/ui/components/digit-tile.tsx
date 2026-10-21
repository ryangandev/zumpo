import { cx } from '../cx';
import styles from './digit-tile.module.css';

export type DigitTileState =
  | 'empty'
  /** Typed into the open row, not checked yet. */
  | 'typed'
  /** A submitted guess. */
  | 'guessed'
  /** The guess that cracked the code. */
  | 'cracked';

export type DigitTileSize = 'regular' | 'compact' | 'small';

export interface DigitTileProps {
  /** One digit; none on an empty tile. */
  digit?: string;
  state?: DigitTileState;
  /**
   * Regular is the game artwork, Compact your board, Small a board beside
   * the others' at the reveal.
   */
  size?: DigitTileSize;
  /**
   * Gives the tile a short nudge, as when its digit was typed again. A new
   * value nudges it again.
   */
  nudge?: number;
}

/**
 * Zumpo/Digit tile: one digit of a Code Breaker guess. The tile says no mark:
 * a guess is marked as a whole, by the pegs beside it.
 */
export function DigitTile({
  digit,
  state = 'empty',
  size = 'compact',
  nudge,
}: DigitTileProps) {
  return (
    <span
      // Keyed on the nudge, so each one plays the animation from the start.
      key={nudge}
      aria-hidden="true"
      className={cx(
        styles.tile,
        styles[size],
        styles[state],
        nudge !== undefined && nudge > 0 && styles.nudge,
      )}
    >
      {digit && <span className={styles.digit}>{digit}</span>}
    </span>
  );
}
