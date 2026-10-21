import { useMessages } from '../../i18n';
import { cx } from '../cx';
import { Icon } from './icon';
import styles from './letter-key.module.css';

export type LetterKeyState = 'plain' | 'correct' | 'present' | 'absent';

export interface LetterKeyProps {
  kind?: 'letter' | 'enter' | 'delete';
  /** The letter of a letter key. */
  letter?: string;
  /** The best mark the letter has had so far; plain when unused. */
  state?: LetterKeyState;
  /**
   * Regular is 40 × 56; Compact, 30 × 44, is for a phone, and a Regular key
   * becomes Compact in a container narrower than the Desktop keyboard.
   */
  size?: 'regular' | 'compact';
  /**
   * Shares a row's width with the keys beside it, at the Regular height,
   * as the Digit pad's keys do on a phone.
   */
  fill?: boolean;
  /** Says what the key is when its state is not a mark: "1, noted out". */
  label?: string;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * Zumpo/Letter key: one key of the on-screen keyboard, with the tile's shapes:
 * a square for the right place, a pill for somewhere else, flat grey for not
 * in the word.
 */
export function LetterKey({
  kind = 'letter',
  letter = '',
  state = 'plain',
  size = 'regular',
  fill = false,
  label: given,
  onPress,
  disabled,
}: LetterKeyProps) {
  const m = useMessages();
  const shown = letter.toUpperCase();
  const label =
    given ??
    (kind === 'enter'
      ? m.ui.word.enter
      : kind === 'delete'
        ? m.ui.word.delete
        : state === 'plain'
          ? shown
          : m.ui.word.marked(shown, m.ui.word.marks[state]));
  return (
    <button
      type="button"
      aria-label={label}
      className={cx(
        styles.key,
        size === 'compact' && styles.compact,
        fill && styles.fill,
        kind !== 'letter' && styles.wide,
        styles[state],
      )}
      disabled={disabled}
      // A click keeps the focus where it was, so a real keyboard's Enter
      // submits the row rather than pressing this key again.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
    >
      {kind === 'delete' ? (
        <Icon glyph="back" size={20} />
      ) : (
        <span
          className={kind === 'enter' ? styles.word : styles.letter}
          aria-hidden="true"
        >
          {kind === 'enter' ? m.ui.word.enter : shown}
        </span>
      )}
    </button>
  );
}
