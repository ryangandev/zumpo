import { useState, type ReactNode } from 'react';
import {
  Button,
  NameMenu,
  NameMenuForm,
  type ButtonVariant,
  type ViewerMenu,
} from '../ui';
import { useLocale, useMessages } from '../i18n';
import { useSession } from '../net/session';
import { randomName } from '../players/random-name';

/**
 * The name in a field, saved for this browser and every seat. Mounted with
 * the menu's popup, so it opens with the current name every time.
 */
function NameForm({ onSaved }: { onSaved: () => void }) {
  const m = useMessages();
  const { locale } = useLocale();
  const { name, setName } = useSession();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string>();

  return (
    <NameMenuForm
      value={value}
      onValueChange={(next) => {
        setValue(next);
        if (error && next.trim()) setError(undefined);
      }}
      error={error}
      onSave={() => {
        const chosen = value.trim();
        if (!chosen) {
          setError(m.shell.name.empty);
          return false;
        }
        // Always sent: the picked name saved unchanged becomes theirs, and a
        // seat still under an older name, such as another tab's, catches up.
        setName(chosen);
        onSaved();
        return true;
      }}
      onRoll={() => {
        setValue(randomName(locale, value.trim()));
        setError(undefined);
      }}
    />
  );
}

/** The menu the viewer's avatar opens: the name, to change. */
export function useViewerMenu(): ViewerMenu {
  const m = useMessages();
  const [open, setOpen] = useState(false);
  return {
    open,
    onOpenChange: setOpen,
    label: m.shell.name.yourName,
    children: <NameForm onSaved={() => setOpen(false)} />,
  };
}

/** A button that opens the name menu under itself: Change name in a waiting room (P19). */
export function NameMenuButton({
  variant = 'secondary',
  className,
  children,
}: {
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
}) {
  const m = useMessages();
  const [open, setOpen] = useState(false);
  return (
    <NameMenu
      open={open}
      onOpenChange={setOpen}
      align="start"
      label={m.shell.name.yourName}
      trigger={
        <Button variant={variant} icon="edit" className={className}>
          {children}
        </Button>
      }
    >
      <NameForm onSaved={() => setOpen(false)} />
    </NameMenu>
  );
}
