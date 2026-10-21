import { useRef, useState, type FormEvent } from 'react';
import { useMessages } from '../../i18n';
import { cx } from '../cx';
import { useFocusFollows } from '../use-focus-follows';
import { Button } from './button';
import { Notice } from './notice';
import { TextField } from './text-field';
import styles from './chain-composer.module.css';

export interface ChainComposerProps {
  /** "Your first line", "Your description". */
  label: string;
  /** The count and what to write: "22 / 80 · anything drawable". */
  helper: string;
  value: string;
  onValueChange: (value: string) => void;
  /**
   * Done: the line is kept and waits; the field is read-only until Keep
   * editing. A blank line cannot be Done: pressing it says so instead.
   */
  done: boolean;
  /** Beside Keep editing once done: "Done. Waiting for Leo and Sam." */
  doneMessage: string;
  onDone: () => void;
  onKeepEditing: () => void;
  /** Fills the field with a suggested line; without it, no Suggest. */
  onSuggest?: () => void;
  /** Takes the keyboard as it appears: not under a finger, whose keyboard would cover the page. */
  autoFocus?: boolean;
  className?: string;
}

/**
 * Zumpo/Chain composer: writing a line of a chain, then Done. It lays itself
 * out as the Phone variant when its container is narrow.
 */
export function ChainComposer({
  label,
  helper,
  value,
  onValueChange,
  done,
  doneMessage,
  onDone,
  onKeepEditing,
  onSuggest,
  autoFocus = false,
  className,
}: ChainComposerProps) {
  const m = useMessages();
  const form = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  // Done takes the field and itself away, and Keep editing gives them back.
  useFocusFollows(done, form, keepEditing, field);
  // A blank line is never Done. Done stays pressable, and pressing it on a
  // blank line says why nothing happened, until there is something to send.
  const blank = value.trim() === '';
  const [triedBlank, setTriedBlank] = useState(false);
  if (triedBlank && !blank) setTriedBlank(false);
  // Enter is Done, as a form's submit.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (done) return;
    if (blank) {
      setTriedBlank(true);
      field.current?.focus();
      return;
    }
    onDone();
  };
  return (
    <form
      ref={form}
      className={cx(styles.container, className)}
      onSubmit={submit}
    >
      <div className={styles.composer}>
        <TextField
          ref={field}
          label={label}
          helper={helper}
          error={triedBlank ? m.ui.chain.writeFirst : undefined}
          value={value}
          onValueChange={(next: string) => onValueChange(next)}
          disabled={done}
          autoComplete="off"
          autoFocus={autoFocus}
          name="line"
        />
        {done ? (
          <div className={cx(styles.actions, styles.doneActions)}>
            <Notice tone="success" className={styles.notice}>
              {doneMessage}
            </Notice>
            <Button
              ref={keepEditing}
              type="button"
              variant="secondary"
              icon="edit"
              className={styles.wide}
              onClick={onKeepEditing}
            >
              {m.ui.chain.keepEditing}
            </Button>
          </div>
        ) : (
          <div className={styles.actions}>
            {onSuggest && (
              <Button
                type="button"
                variant="secondary"
                icon="dice"
                className={styles.half}
                onClick={onSuggest}
              >
                {m.ui.chain.suggest}
              </Button>
            )}
            <Button type="submit" icon="check" className={styles.done}>
              {m.ui.chain.done}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
