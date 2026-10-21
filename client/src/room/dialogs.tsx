import { useRef } from 'react';
import { Button, Dialog, DialogClose, HowToPlay, TextField } from '../ui';
import type { GameInfo } from '../games/catalog';
import { FullRules } from '../games/full-rules';
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

/**
 * P15, P21: how to play over the room, which carries on behind it: the goal,
 * how to act and read the board, how it scores, and the full rules a click
 * away, so nobody leaves the room to look a rule up.
 */
export function RulesDialog({
  open,
  onOpenChange,
  game,
  solo = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: GameInfo;
  /** How to play the game on your own rather than in a room. */
  solo?: boolean;
}) {
  const m = useMessages();
  const text = m.games.of[game.type];
  const howTo = (solo && text.solo?.howToPlay) || text.howToPlay;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={m.room.rulesTitle(text.name)}
      description={howTo.goal}
      actions={<DialogClose render={<Button>{m.room.backToGame}</Button>} />}
    >
      <HowToPlay steps={[...howTo.steps, howTo.score]} />
      <FullRules game={game.type} />
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
