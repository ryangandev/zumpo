import { useMessages } from '../../i18n';
import { cx } from '../cx';
import styles from './letter-tile.module.css';

export type LetterTileState =
  | 'empty'
  /** Typed into the open row, not checked yet. */
  | 'typed'
  /** In the word, in this place. */
  | 'correct'
  /** In the word, somewhere else. */
  | 'present'
  /** Not in the word, or not as many times. */
  | 'absent';

export type LetterTileSize = 'regular' | 'compact' | 'small' | 'mini';

export interface LetterTileProps {
  /** One letter, shown in capitals; none on an empty or a Mini tile. */
  letter?: string;
  state?: LetterTileState;
  /**
   * Regular is your board on a wide screen, Compact on a phone, Small a board
   * at the reveal, Mini another player's board, marks only.
   */
  size?: LetterTileSize;
  /**
   * A peg in another game's marks, whose row says what it means: the tile
   * says nothing, so no word game's wording reaches it.
   */
  decorative?: boolean;
}

/**
 * Zumpo/Letter tile: one letter of a guess. Its shape says the mark as much
 * as its colour does: a square for the right place, a circle for somewhere
 * else, a flat tile for not in the word.
 */
export function LetterTile({
  letter,
  state = 'empty',
  size = 'regular',
  decorative = false,
}: LetterTileProps) {
  const m = useMessages();
  const shown = size === 'mini' ? undefined : letter?.toUpperCase();
  const marked =
    state === 'correct' || state === 'present' || state === 'absent';
  const name = decorative
    ? undefined
    : marked
      ? shown
        ? m.ui.word.marked(shown, m.ui.word.marks[state])
        : m.ui.word.marks[state]
      : shown;
  // An empty tile says nothing, so a board reads as its guesses only.
  return (
    <span
      role={name ? 'img' : undefined}
      aria-label={name}
      aria-hidden={name ? undefined : true}
      className={cx(styles.tile, styles[size], styles[state])}
    >
      {shown && (
        <span className={styles.letter} aria-hidden="true">
          {shown}
        </span>
      )}
    </span>
  );
}
