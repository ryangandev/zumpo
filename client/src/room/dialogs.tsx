import { useRef } from 'react';
import { heirOf } from '../../../shared/room';
import type { AnyRoomState } from '../../../shared/wire-types';
import { Button, Dialog, DialogClose, TextField } from '../ui';
import { gameInfo, scoreOf, type GameInfo } from '../games/catalog';
import { useMessages, type Messages } from '../i18n';
import { useCopy } from '../shell/use-copy';
import { SwapLabel } from '../shell/swap-label';
import styles from './dialogs.module.css';

/**
 * What leaving costs this viewer, as the room stands: watching costs
 * nothing; mid-game a Gomoku player resigns, a player whose going leaves too
 * few ends the game for everybody, and anybody else gives up their seat and
 * score while the game carries on; between games only the seat. A host is
 * told who takes the crown, or that the room closes with them.
 */
export function leaveCost(
  state: AnyRoomState,
  playerId: string,
  m: Messages,
): string {
  const seat = state.playerList[playerId];
  const others = Object.keys(state.playerList).filter((id) => id !== playerId);
  const cost = !seat
    ? m.room.leaveSpectating
    : !state.isGameStarted
      ? m.room.leaveBetweenGames
      : state.gameType === 'gomoku'
        ? m.room.leaveResigns(state.playerList[others[0] ?? '']?.username ?? '')
        : others.length < gameInfo(state.gameType).minPlayers
          ? m.room.leaveEndsGame
          : seat.points === 0
            ? m.room.leaveInGameNoScore
            : m.room.leaveInGame(scoreOf(m, state.gameType, seat.points));
  if (state.owner.playerId !== playerId) return cost;
  const rest = {
    playerList: without(state.playerList, playerId),
    spectators: without(state.spectators, playerId),
  };
  const heir = heirOf(rest);
  const next = heir
    ? m.room.leaveNextHost(
        (rest.playerList[heir] ?? rest.spectators[heir])?.username ?? '',
      )
    : m.room.leaveCloses;
  return m.room.both(cost, next);
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
