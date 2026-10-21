import { itemAt } from '../../../shared/list';
import type { ReactNode } from 'react';
import type { GameSummary } from '../../../shared/wire-types';
import { MAX_SPECTATORS } from '../../../shared/room';
import { Button, ButtonLink, HowToPlay, Notice, PlayerRow } from '../ui';
import { gameInfo, gamePath, scoreOf } from '../games/catalog';
import { useMessages } from '../i18n';
import { initialsOf, toneOf } from '../players/avatar';
import { useSession } from '../net/session';
import { NameMenuButton } from '../shell/name-menu';
import { StatusLine } from '../shell/status-line';
import { listNames, ordinal, placesOf } from './players';
import { useRoomContext } from './room-context';
import styles from './panels.module.css';

/** The paper panel that stands in for the game between games. */
export function RoomPanel({
  title,
  children,
  notice,
  actions,
  footer,
}: {
  title: ReactNode;
  children: ReactNode;
  /** Something for the viewer alone, between the text and the actions. */
  notice?: ReactNode;
  actions?: ReactNode;
  /** Under the actions, past a line: how to play, while waiting. */
  footer?: ReactNode;
}) {
  const { refusal } = useRoomContext();
  return (
    <section className={styles.panel} aria-labelledby="room-panel-title">
      <h2 id="room-panel-title" className={styles.title}>
        {title}
      </h2>
      <p className={styles.body}>{children}</p>
      {refusal && (
        <Notice tone="error" className={styles.notice}>
          {refusal}
        </Notice>
      )}
      {notice && <Notice className={styles.notice}>{notice}</Notice>}
      {actions && <div className={styles.actions}>{actions}</div>}
      {footer}
    </section>
  );
}

function InviteButton({ primary = false }: { primary?: boolean }) {
  const m = useMessages();
  const { openInvite } = useRoomContext();
  return (
    <Button
      variant={primary ? 'primary' : 'secondary'}
      icon="link"
      onClick={openInvite}
    >
      {m.room.invite}
    </Button>
  );
}

/**
 * Between games, the way to the other kind of seat: Take a seat for a
 * spectator while one is free, Watch instead for a player while a spectator
 * seat is free, or nothing. A move under way says so instead.
 */
function SeatMove({ primary = false }: { primary?: boolean }) {
  const m = useMessages();
  const { state, spectating, watch, sit, moving } = useRoomContext();
  if (moving) return <StatusLine>{m.room.moving}</StatusLine>;
  if (spectating) {
    const seatFree = Object.keys(state.playerList).length < state.maxPlayers;
    if (!seatFree) return null;
    return (
      <Button variant={primary ? 'primary' : 'secondary'} onClick={sit}>
        {m.room.sit}
      </Button>
    );
  }
  if (Object.keys(state.spectators).length >= MAX_SPECTATORS) return null;
  return (
    <Button variant="secondary" onClick={watch}>
      {m.room.watch}
    </Button>
  );
}

/**
 * A spectator who is not the host, between games: they are watching, and can
 * take a seat for the next game while one is free.
 */
function SpectatorPanel({ footer }: { footer?: ReactNode }) {
  const m = useMessages();
  const { state } = useRoomContext();
  const seatFree = Object.keys(state.playerList).length < state.maxPlayers;
  return (
    <RoomPanel
      title={m.room.spectatingTitle}
      footer={footer}
      actions={
        <>
          <SeatMove primary />
          <InviteButton />
        </>
      }
    >
      {seatFree ? m.room.spectatingSeatFree : m.room.spectatingSeatsFull}
    </RoomPanel>
  );
}

/**
 * While the viewer still has the name picked for them, which a friend who came
 * from an invite link likely does: who the room thinks they are, and the way
 * to say who they really are (P19).
 */
function usePickedName(): { notice?: string; change?: ReactNode } {
  const m = useMessages();
  const { namePicked } = useSession();
  const { state, playerId } = useRoomContext();
  const seat = state.playerList[playerId];
  if (!namePicked || !seat) return {};
  return {
    notice: m.room.pickedName(seat.username),
    change: <NameMenuButton>{m.shell.name.changeName}</NameMenuButton>,
  };
}

/**
 * Before a game, on the waiting card, the same for the host and everyone
 * else: what the game is and how to play it, for a friend who came from an
 * invite link and meets the game here first.
 */
function WaitingHowTo() {
  const m = useMessages();
  const { state } = useRoomContext();
  const { goal, steps } = m.games.of[state.gameType].howToPlay;
  return (
    <HowToPlay
      heading={m.ui.room.howToPlay}
      goal={goal}
      steps={steps}
      className={styles.howTo}
    />
  );
}

/**
 * D01-D03, M01-M03: before a game. The host starts once there are two; a
 * guest waits for the host. Each says how to play under its actions.
 */
export function WaitingPanel({
  aloneTitle,
  aloneDetail,
  setup,
  guestSetup,
  onStart,
  starting,
}: {
  /** The host's title while alone. */
  aloneTitle: string;
  /** Why the game needs more players, where it says more than the count. */
  aloneDetail?: string;
  /** For the host: "4 players, 2 rounds. The word category is…". */
  setup: string;
  /** For a guest: "4 players, 2 rounds." */
  guestSetup: string;
  onStart: () => void;
  starting: boolean;
}) {
  const { state, isHost, spectating } = useRoomContext();
  const m = useMessages();
  const gameName = m.games.of[state.gameType].name;
  const { minPlayers } = gameInfo(state.gameType);
  const count = Object.keys(state.playerList).length;
  const picked = usePickedName();
  const howTo = <WaitingHowTo />;

  if (spectating && !isHost) return <SpectatorPanel footer={howTo} />;
  if (!isHost) {
    return (
      <RoomPanel
        title={m.room.waitingForHost(state.owner.username)}
        notice={picked.notice}
        footer={howTo}
        actions={
          <>
            <InviteButton />
            <SeatMove />
            {picked.change}
          </>
        }
      >
        {m.room.guestSetup(guestSetup)}
      </RoomPanel>
    );
  }
  if (count < minPlayers) {
    return (
      <RoomPanel
        title={aloneTitle}
        notice={picked.notice}
        footer={howTo}
        actions={
          <>
            <InviteButton primary />
            <SeatMove />
            {picked.change}
          </>
        }
      >
        {aloneDetail ?? m.room.needsPlayers(gameName, minPlayers)}
      </RoomPanel>
    );
  }
  return (
    <RoomPanel
      title={m.room.everyoneHere}
      notice={picked.notice}
      footer={howTo}
      actions={
        starting ? (
          <StatusLine>{m.room.starting}</StatusLine>
        ) : (
          <>
            <Button onClick={onStart}>{m.room.start}</Button>
            <InviteButton />
            <SeatMove />
            {picked.change}
          </>
        )
      }
    >
      {setup}
    </RoomPanel>
  );
}

/** D15, M16: the game ended because everyone else left. */
export function EndedEarlyPanel() {
  const { state, spectating, isHost } = useRoomContext();
  const m = useMessages();
  const gameName = m.games.of[state.gameType].name;
  // Its words are for the player left at the table.
  if (spectating && !isHost) return <SpectatorPanel />;
  return (
    <RoomPanel
      title={m.room.everyoneLeft}
      actions={
        <>
          <InviteButton primary />
          <SeatMove />
          <ButtonLink
            to={gamePath(state.gameType)}
            variant="secondary"
            icon="back"
          >
            {m.room.backToRooms}
          </ButtonLink>
        </>
      }
    >
      {m.room.endedEarly(gameName)}
    </RoomPanel>
  );
}

/**
 * A finished game's actions: Play again for the host while there are enough
 * players, Invite while there are not, or a guest's wait for the host.
 */
export function ResultsActions({
  onPlayAgain,
  starting,
  again,
}: {
  onPlayAgain: () => void;
  starting: boolean;
  /** Play again's label, where the game names the next one: "Start game 3". */
  again?: string;
}) {
  const { state, isHost, spectating } = useRoomContext();
  const m = useMessages();
  const count = Object.keys(state.playerList).length;
  if (!isHost) {
    return (
      <>
        <StatusLine>{m.room.waitingForAgain(state.owner.username)}</StatusLine>
        <SeatMove primary={spectating} />
      </>
    );
  }
  if (starting) return <StatusLine>{m.room.starting}</StatusLine>;
  if (count >= gameInfo(state.gameType).minPlayers) {
    return (
      <>
        <Button onClick={onPlayAgain}>{again ?? m.room.playAgain}</Button>
        <InviteButton />
        <SeatMove />
      </>
    );
  }
  return (
    <>
      <InviteButton primary />
      <SeatMove />
    </>
  );
}

/**
 * A finished game's panel: what happened, the game's own account of it, and
 * Play again for the host, or a guest's wait for them.
 */
export function ResultsFrame({
  title,
  detail,
  children,
  onPlayAgain,
  starting,
  again,
}: {
  title: string;
  detail: string;
  children: ReactNode;
  onPlayAgain: () => void;
  starting: boolean;
  again?: string;
}) {
  return (
    <section className={styles.results} aria-labelledby="results-title">
      <div className={styles.resultHeading}>
        <h2 id="results-title" className={styles.title}>
          {title}
        </h2>
        <p className={styles.body}>{detail}</p>
      </div>
      {children}
      <div className={styles.actions}>
        <ResultsActions
          onPlayAgain={onPlayAgain}
          starting={starting}
          again={again}
        />
      </div>
    </section>
  );
}

/**
 * D13, D14, M14, M15: the final standings. The host can play again; a guest
 * waits for them.
 */
export function ResultsPanel<Summary extends GameSummary>({
  summary,
  title,
  detail,
  standingDetail,
  onPlayAgain,
  starting,
  again,
  ranked = false,
  statusOf,
}: {
  summary: Summary;
  /**
   * What happened, where the game says more than who won with what; it says
   * the viewer's own result too, so the detail no longer adds their place.
   */
  title?: string;
  /** "2 rounds of Animals, 8 turns." */
  detail: string;
  /** More about each player's game after their place: "3 words found". */
  standingDetail?: (playerId: string) => string;
  onPlayAgain: () => void;
  starting: boolean;
  /** Play again's label, where the game names the next one. */
  again?: string;
  /**
   * The standings are in finishing order and no two share a place, as in
   * Liar's Dice; otherwise an equal score shares one.
   */
  ranked?: boolean;
  /** Under each name; "Winner", then "2nd place" and so on, unless given. */
  statusOf?: (standing: Summary['standings'][number], place: number) => string;
}) {
  const m = useMessages();
  const { state, playerId } = useRoomContext();
  const { standings } = summary;
  const places = ranked
    ? standings.map((_, index) => index + 1)
    : placesOf(standings);
  const winners = standings.filter((_, index) => places[index] === 1);
  // A spectator has no place.
  const place = places[standings.findIndex((s) => s.playerId === playerId)];
  const [winner] = winners;

  return (
    <ResultsFrame
      title={
        title ??
        (winner === undefined
          ? m.room.gameOver
          : winners.length === 1
            ? m.room.wins(
                winner.username,
                scoreOf(m, state.gameType, winner.points),
              )
            : m.room.ties(
                listNames(
                  winners.map((w) => w.username),
                  m,
                ),
                scoreOf(m, state.gameType, winner.points),
              ))
      }
      detail={
        title === undefined && place !== undefined && place > 1
          ? m.room.finished(detail, ordinal(place, m))
          : detail
      }
      onPlayAgain={onPlayAgain}
      starting={starting}
      again={again}
    >
      <ol className={styles.ranking} aria-label={m.room.standings}>
        {standings.map((standing, index) => {
          const seat = state.playerList[standing.playerId];
          const standingPlace = itemAt(places, index);
          return (
            <li key={standing.playerId} className={styles.place}>
              <span className={styles.number}>{standingPlace}</span>
              <PlayerRow
                as="div"
                className={styles.row}
                name={standing.username}
                initials={initialsOf(standing.username)}
                tone={toneOf(standing.username)}
                status={[
                  statusOf
                    ? statusOf(standing, standingPlace)
                    : standingPlace === 1
                      ? m.room.winner
                      : m.room.place(ordinal(standingPlace, m)),
                  standingDetail?.(standing.playerId),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                score={standing.points}
                host={standing.playerId === state.owner.playerId}
                you={standing.playerId === playerId}
                state={
                  standingPlace === 1 ? 'highlight' : seat ? 'default' : 'away'
                }
              />
            </li>
          );
        })}
      </ol>
    </ResultsFrame>
  );
}
