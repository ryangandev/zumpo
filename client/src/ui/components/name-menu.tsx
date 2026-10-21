import { Popover } from '@base-ui/react/popover';
import {
  useEffect,
  useRef,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useMessages } from '../../i18n';
import { Button } from './button';
import { TextField } from './text-field';
import styles from './name-menu.module.css';

/** The server's limit on a name. */
export const NAME_MAX_LENGTH = 18;

export interface NameMenuProps {
  /** What opens it: the viewer's avatar, Playing as, or Change name. */
  trigger: ReactElement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lined up with the trigger's end edge, as under the avatar, or its start. */
  align?: 'start' | 'end';
  /** The popup's name when its content has no title of its own. */
  label?: string;
  /** NameMenuForm. */
  children: ReactNode;
}

/**
 * Zumpo/Name menu: a 320 px paper card, lifted, under whatever opened it, the
 * width of the screen less its margins on a phone (P03, P13, MO02).
 * Focus is the content's business: the form puts it in the field.
 */
export function NameMenu({
  trigger,
  open,
  onOpenChange,
  align = 'end',
  label,
  children,
}: NameMenuProps) {
  return (
    <Popover.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner
          className="zumpo"
          side="bottom"
          align={align}
          sideOffset={16}
          collisionPadding={16}
        >
          <Popover.Popup
            className={styles.menu}
            aria-label={label}
            initialFocus={false}
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export interface NameMenuFormProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Replaces the helper, as State=Error does (P03). */
  error?: string;
  /** False when the name could not be saved, which keeps focus in the field. */
  onSave: () => boolean;
  /** Fills in another random name, to save or change further. */
  onRoll: () => void;
}

/**
 * State=Edit and State=Error: the name in a field, selected so that typing
 * replaces it, with Save and Roll a name (P03, P13).
 */
export function NameMenuForm({
  value,
  onValueChange,
  error,
  onSave,
  onRoll,
}: NameMenuFormProps) {
  const m = useMessages().shell.name;
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onSave()) field.current?.focus();
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <TextField
        ref={field}
        label={m.yourName}
        helper={m.helper}
        error={error}
        value={value}
        onValueChange={(next: string) => onValueChange(next)}
        maxLength={NAME_MAX_LENGTH}
        autoComplete="nickname"
        name="name"
      />
      <div className={styles.actions}>
        <Button type="submit">{m.save}</Button>
        <Button
          variant="secondary"
          icon="dice"
          onClick={() => {
            onRoll();
            field.current?.focus();
          }}
        >
          {m.roll}
        </Button>
      </div>
    </form>
  );
}
