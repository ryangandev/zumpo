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
        {/* Both rows share one place and the taller one's height, so Done and
            Keep editing never move what is above them. */}
        <div className={styles.swap}>
          <div
            className={cx(
              styles.actions,
              styles.doneActions,
              !done && styles.held,
            )}
            aria-hidden={done ? undefined : true}
          >
            <Notice tone="success" className={styles.notice}>
              {/* Its words arrive with Done, so the status is announced; until
                  then they only hold the row's height, out of sight. */}
              {done ? (
                doneMessage
              ) : (
                <span aria-hidden="true">{doneMessage}</span>
              )}
            </Notice>
            <Button
              ref={keepEditing}
              type="button"
              variant="secondary"
              icon="edit"
              iconOnlyWhenNarrow
              disabled={!done}
              onClick={onKeepEditing}
            >
              {m.ui.chain.keepEditing}
            </Button>
          </div>
          <div
            className={cx(styles.actions, done && styles.held)}
            aria-hidden={done ? true : undefined}
          >
            {onSuggest && (
              <Button
                type="button"
                variant="secondary"
                icon="dice"
                className={styles.half}
                disabled={done}
                onClick={onSuggest}
              >
                {m.ui.chain.suggest}
              </Button>
            )}
            <Button
              type="submit"
              icon="check"
              className={styles.done}
              disabled={done}
            >
              {m.ui.chain.done}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
