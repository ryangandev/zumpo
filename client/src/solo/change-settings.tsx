import { useState, type ReactNode } from 'react';
import { Button, Dialog } from '../ui';
import { useMessages } from '../i18n';

/**
 * "Change board", "Change level", "Change table": beside Play again on a
 * finished game, the one place a game on your own is set. Play solo starts
 * with the last settings played on this device, or the defaults, so a first
 * game is one click away; this opens the settings over the finished game,
 * and Play starts the next one with them.
 */
export function ChangeSettings<Settings>({
  label,
  title,
  description,
  settings,
  onPlay,
  children,
}: {
  /** The button: "Change board". */
  label: string;
  /** The dialog: "Pick a board". */
  title: string;
  description?: string;
  /** The settings just played, picked when the dialog opens. */
  settings: Settings;
  onPlay: (settings: Settings) => void;
  /** The fields, for the settings being picked. */
  children: (picked: Settings, pick: (settings: Settings) => void) => ReactNode;
}) {
  const m = useMessages();
  const [open, setOpen] = useState(false);
  const [picked, pick] = useState(settings);
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          pick(settings);
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        actions={
          <>
            <Button
              onClick={() => {
                setOpen(false);
                onPlay(picked);
              }}
            >
              {m.solo.play}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {m.solo.cancel}
            </Button>
          </>
        }
      >
        {children(picked, pick)}
      </Dialog>
    </>
  );
}
