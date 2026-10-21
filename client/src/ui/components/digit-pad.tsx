import { useMessages } from '../../i18n';
import { Fit } from '../../shell/fit';
import { cx } from '../cx';
import { LetterKey, type LetterKeyState } from './letter-key';
import { ToggleChip } from './toggle-chip';
import styles from './digit-pad.module.css';

/** A player's own note on a digit: out of the code, or in it. */
export type DigitNote = 'out' | 'in';

export interface DigitPadProps {
  /** The player's notes, by digit; a digit not in it is plain. */
  notes?: Readonly<Partial<Record<string, DigitNote>>>;
  /**
   * Digits the game knows are out of the code, dimmed on a key the player
   * has not noted (on your own; a room's pad has none). A note always wins:
   * the notes stay the player's own.
   */
  ruledOut?: readonly string[];
  /** Whether a digit key notes its digit instead of typing it. */
  noting?: boolean;
  onNoting: () => void;
  onDigit: (digit: string) => void;
  onEnter: () => void;
  onDelete: () => void;
  /**
   * Desktop is one row beside the Notes toggle, scaled down where even that
   * is too wide; Phone is two rows under it that share the width.
   */
  layout?: 'desktop' | 'phone';
  disabled?: boolean;
  className?: string;
}

const DIGITS = [...'1234567890'];

/** A note shows as a Letter key's mark: out is flat grey, in is green. */
const KEY_STATE: Readonly<Record<DigitNote, LetterKeyState>> = {
  out: 'absent',
  in: 'correct',
};

/**
 * Zumpo/Digit pad: the ten digits with Delete and Enter, and the Notes
 * toggle. The keys take the player's notes, and dim a digit the game knows
 * is out.
 */
export function DigitPad({
  notes = {},
  ruledOut = [],
  noting = false,
  onNoting,
  onDigit,
  onEnter,
  onDelete,
  layout = 'desktop',
  disabled,
  className,
}: DigitPadProps) {
  const m = useMessages();
  const phone = layout === 'phone';
  const key = (digit: string) => {
    const note = notes[digit];
    const out = !note && ruledOut.includes(digit);
    return (
      <LetterKey
        key={digit}
        letter={digit}
        state={note ? KEY_STATE[note] : out ? 'ruledOut' : 'plain'}
        label={
          note
            ? m.ui.code.noted(digit, note)
            : out
              ? m.ui.code.ruledOut(digit)
              : digit
        }
        fill={phone}
        onPress={() => onDigit(digit)}
        disabled={disabled}
      />
    );
  };
  const remove = (
    <LetterKey
      kind="delete"
      label={m.ui.code.delete}
      fill={phone}
      onPress={onDelete}
      disabled={disabled}
    />
  );
  const enter = (
    <LetterKey
      kind="enter"
      fill={phone}
      onPress={onEnter}
      disabled={disabled}
    />
  );
  const notesToggle = (
    <ToggleChip on={noting} onToggle={onNoting}>
      {m.ui.code.notes}
    </ToggleChip>
  );

  if (phone) {
    return (
      <div
        role="group"
        aria-label={m.ui.code.pad}
        className={cx(styles.phone, className)}
      >
        <div className={styles.notes}>{notesToggle}</div>
        <div className={styles.row}>
          {DIGITS.slice(0, 5).map(key)}
          {remove}
        </div>
        <div className={styles.row}>
          {DIGITS.slice(5).map(key)}
          {enter}
        </div>
      </div>
    );
  }
  return (
    <div className={cx(styles.container, className)}>
      <Fit>
        <div role="group" aria-label={m.ui.code.pad} className={styles.desktop}>
          {notesToggle}
          <div className={styles.keys}>
            {DIGITS.map(key)}
            {remove}
            {enter}
          </div>
        </div>
      </Fit>
    </div>
  );
}
