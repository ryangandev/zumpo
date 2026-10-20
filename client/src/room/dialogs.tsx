import { useRef } from 'react';
import { Button, Dialog, DialogClose, TextField } from '../ui';
import type { GameInfo } from '../games/catalog';
import { useMessages } from '../i18n';
import { useCopy } from '../shell/use-copy';
import styles from './dialogs.module.css';

/**
 * P11, P16: leaving asks first. Mid-game it costs the seat and the score
 * (P11); between games only the seat, for a way out other than Leave room
 * (P16).
 */
export function LeaveDialog({
  open,
  roomName,
  inGame,
  spectating,
  score,
  onStay,
  onLeave,
}: {
  open: boolean;
  roomName: string;
  inGame: boolean;
  /** Watching: nothing is lost, in a game or not. */
  spectating: boolean;
  /** "180 points", "3 pairs". */
  score: string;
  onStay: () => void;
  onLeave: () => void;
}) {
  const m = useMessages();
  const stay = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onStay();
      }}
      title={m.room.leaveTitle(roomName)}
      description={
        spectating
          ? m.room.leaveSpectating
          : inGame
            ? m.room.leaveInGame(score)
            : m.room.leaveBetweenGames
      }
      initialFocus={stay}
      actions={
        <>
          <Button variant="danger" icon="leave" onClick={onLeave}>
            {m.room.leave}
          </Button>
          <Button ref={stay} variant="secondary" onClick={onStay}>
            {m.room.stay}
          </Button>
        </>
      }
    />
  );
}

/** P15: the game's rules over the room, which carries on behind them. */
export function RulesDialog({
  open,
  onOpenChange,
  game,
  solo = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: GameInfo;
  /** The rules of the game on your own rather than in a room. */
  solo?: boolean;
}) {
  const m = useMessages();
  const text = m.games.of[game.type];
  const rules =
    solo && text.solo
      ? text.solo
      : { summary: text.lobbySummary, facts: text.lobbyFacts };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={m.room.rulesTitle(text.name)}
      description={rules.summary}
      actions={<DialogClose render={<Button>{m.room.backToGame}</Button>} />}
    >
      <ul className={styles.facts}>
        {rules.facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
    </Dialog>
  );
}

/** P12: the room's link, to copy and send to friends. */
export function InviteDialog({
  open,
  onOpenChange,
  roomName,
  link,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomName: string;
  link: string;
}) {
  const m = useMessages();
  const { copied, copy } = useCopy(link);
  // Opening on Copy keeps the link whole on screen, rather than selected and
  // scrolled to its end, and makes Enter copy it.
  const copyButton = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={m.room.invite}
      description={m.room.inviteDescription(roomName)}
      initialFocus={copyButton}
      actions={
        <>
          <Button
            ref={copyButton}
            icon={copied ? 'check' : 'copy'}
            onClick={copy}
          >
            {copied ? m.room.copied : m.room.copy}
          </Button>
          <DialogClose
            render={<Button variant="secondary">{m.room.done}</Button>}
          />
        </>
      }
    >
      <TextField
        label={m.room.roomLink}
        value={link}
        readOnly
        // Figma wraps the link over two lines; a phone needs three.
        render={<textarea rows={2} className={styles.link} />}
        onFocus={(event) => event.currentTarget.select()}
      />
    </Dialog>
  );
}
