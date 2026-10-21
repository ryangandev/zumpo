import { useRef } from 'react';
import { departureFrom, heirOf } from '../../../shared/room';
import type { AnyRoomState } from '../../../shared/wire-types';
import { Button, Dialog, DialogClose, HowToPlay, TextField } from '../ui';
import { scoreOf, type GameInfo } from '../games/catalog';
import { FullRules } from '../games/full-rules';
import { useMessages, type Messages } from '../i18n';
import { useCopy } from '../shell/use-copy';
import { SwapLabel } from '../shell/swap-label';
import styles from './dialogs.module.css';

/**
 * What leaving costs this viewer, as the room stands: watching costs
 * nothing; mid-game the game's own rule (`departureFrom`, which the server
 * acts on too) says whether it hands the game to somebody, ends it for
 * everybody, or plays on without their seat and score; between games only
 * the seat. A host is told who takes the crown; a host alone, only that the
 * room closes, since there is nothing to come back to.
 */
export function leaveCost(
  state: AnyRoomState,
  playerId: string,
  m: Messages,
): string {
  const rest = {
    playerList: without(state.playerList, playerId),
    spectators: without(state.spectators, playerId),
  };
  const heir = heirOf(rest);
  const host = state.owner.playerId === playerId;
  // Nobody to come back to: the room closes, and that is the whole cost.
  if (host && !heir) return m.room.leaveCloses;
  const cost = seatCost(state, playerId, rest.playerList, m);
  if (!host || !heir) return cost;
  const next = m.room.leaveNextHost(
    (rest.playerList[heir] ?? rest.spectators[heir])?.username ?? '',
  );
  return m.room.both(cost, next);
}

/** What leaving costs a viewer at the table, or watching it. */
function seatCost(
  state: AnyRoomState,
  playerId: string,
  seats: AnyRoomState['playerList'],
  m: Messages,
): string {
  const seat = state.playerList[playerId];
  if (!seat) return m.room.leaveSpectating;
  if (!state.isGameStarted) return m.room.leaveBetweenGames;
  const departure = departureFrom(
    state.gameType === 'doodle-chain'
      ? {
          gameType: state.gameType,
          seats,
          phase: state.phase,
          step: state.step,
          steps: state.steps,
        }
      : { gameType: state.gameType, seats },
  );
  switch (departure.kind) {
    case 'decided':
      return m.room.leaveResigns(seats[departure.winner]?.username ?? '');
    case 'cut-short':
      return m.room.leaveEndsGame;
    case 'plays-on':
      return seat.points === 0
        ? m.room.leaveInGameNoScore
        : m.room.leaveInGame(scoreOf(m, state.gameType, seat.points));
  }
}

function without<T>(
  members: Readonly<Record<string, T>>,
  playerId: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(members).filter(([id]) => id !== playerId),
  );
}

/**
 * P11, P16: leaving asks first, and says what it costs (`leaveCost`): mid-game
 * the seat and the score, or the game itself (P11); between games only the
 * seat, for a way out other than Leave room (P16).
 */
export function LeaveDialog({
  open,
  roomName,
  cost,
  onStay,
  onLeave,
}: {
  open: boolean;
  roomName: string;
  cost: string;
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
      description={cost}
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
            onClick={() => void copy()}
          >
            <SwapLabel second={copied} labels={[m.room.copy, m.room.copied]} />
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
