import { itemAt } from '../../../shared/list';
import type { ReactNode } from 'react';
import type { GameSummary } from '../../../shared/wire-types';
import { MAX_SPECTATORS, waitingOn } from '../../../shared/room';
import {
  Avatar,
  Button,
  ButtonLink,
  HowToPlay,
  Notice,
  PlayerRow,
} from '../ui';
import { gameInfo, gamePath, scoreOf } from '../games/catalog';
import { roomSetting } from '../games/room-setting';
import { SettingField, settingsOf } from '../games/setting-field';
import { cx } from '../ui/cx';
import { useMessages } from '../i18n';
import { initialsOf, toneOf } from '../players/avatar';
import { useSession } from '../net/session';
import { NameMenuButton } from '../shell/name-menu';
import { PHONE, TOUCH, useMediaQuery } from '../shell/use-media-query';
import { SwapLabel } from '../shell/swap-label';
import { useCopy } from '../shell/use-copy';
import { StatusLine } from '../shell/status-line';
import { listNames, ordinal, placesOf, roomNameOf } from './players';
import { useRoomContext } from './room-context';
import styles from './panels.module.css';

/** The paper panel that stands in for the game between games. */
export function RoomPanel({
  title,
  children,
  aside,
  notice,
  actions,
  footer,
}: {
  title: ReactNode;
  children: ReactNode;
  /** Under the text: who is here, on a phone's waiting card. */
  aside?: ReactNode;
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
      {aside}
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

/**
 * Invite friends sends the link the way the device does: the system share
 * sheet under a finger, the clipboard under a mouse, saying "Link copied" in
 * place. Where neither works, the invite dialog shows the link to copy by
 * hand. A share sheet closed without sharing is the player changing their
 * mind, and opens nothing.
 */
function InviteButton({ primary = false }: { primary?: boolean }) {
  const m = useMessages();
  const { state, inviteLink, openInvite } = useRoomContext();
  const { copied, copy } = useCopy(inviteLink);
  const touch = useMediaQuery(TOUCH);
  const invite = async () => {
    if (touch && typeof navigator.share === 'function') {
      const room = roomNameOf(state, m);
      try {
        await navigator.share({
          title: room,
          text: m.room.shareText(m.games.of[state.gameType].name, room),
          url: inviteLink,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
      }
    } else if (await copy()) {
      return;
    }
    openInvite();
  };
  return (
    <Button
      variant={primary ? 'primary' : 'secondary'}
      icon={copied ? 'check' : 'link'}
      onClick={() => void invite()}
    >
      <SwapLabel second={copied} labels={[m.room.invite, m.room.linkCopied]} />
    </Button>
  );
}

/**
 * Between games, the way to the other kind of seat: Take a seat for a
 * spectator while one is free, Watch instead for a guest while a spectator
 * seat is free, or nothing. A move under way says so instead.
 *
 * The host is never offered Watch instead: it would hand the crown to
 * somebody at the table for good, and a host alone has nobody to hand it to.
 * For a guest it is the quiet choice beside Invite, not one of equal weight.
 */
function SeatMove({ primary = false }: { primary?: boolean }) {
  const m = useMessages();
  const { state, spectating, isHost, watch, sit, moving } = useRoomContext();
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
  if (isHost) return null;
  if (Object.keys(state.spectators).length >= MAX_SPECTATORS) return null;
  return (
    <Button variant="quiet" onClick={watch}>
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
 * For the player who may start because the host is away: why the start is
 * theirs to press.
 */
function useStandIn(): string | undefined {
  const m = useMessages();
  const { canStart, isHost, state } = useRoomContext();
  return canStart && !isHost ? m.room.standIn(state.owner.username) : undefined;
}

/**
 * MO20: on a phone, where the scoreboard is on its own tab, the waiting card
 * says who else is at the table, so "Everyone's here?" can be answered on
 * the spot. Nothing while nobody else is.
 */
function WhoIsHere() {
  const m = useMessages();
  const { state, playerId } = useRoomContext();
  const phone = useMediaQuery(PHONE);
  const others = Object.entries(state.playerList).filter(
    ([id]) => id !== playerId,
  );
  if (!phone || others.length === 0) return null;
  const names = others.map(([, seat]) => seat.username);
  return (
    <div className={styles.here}>
      <span className={styles.faces}>
        {others.map(([id, seat]) => (
          <Avatar
            key={id}
            initials={initialsOf(seat.username)}
            tone={toneOf(seat.username)}
            size="small"
          />
        ))}
      </span>
      <span className={styles.hereText}>
        {m.room.here(listNames(names, m), names.length)}
      </span>
    </div>
  );
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
 * D01-D03, M01-M03: before a game. The host starts once there are two, or
 * while they are away the player next in line; a guest waits for them. Each
 * says how to play under its actions.
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
  const { state, canStart, spectating, starterName } = useRoomContext();
  const m = useMessages();
  const gameName = m.games.of[state.gameType].name;
  const { minPlayers } = gameInfo(state.gameType);
  const count = Object.keys(state.playerList).length;
  const picked = usePickedName();
  const standIn = useStandIn();
  const howTo = <WaitingHowTo />;

  if (spectating && !canStart) return <SpectatorPanel footer={howTo} />;
  if (!canStart) {
    return (
      <RoomPanel
        title={m.room.waitingForHost(starterName)}
        aside={<WhoIsHere />}
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
        aside={<WhoIsHere />}
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
      aside={<WhoIsHere />}
      notice={picked.notice ?? standIn}
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
  const { state, spectating, isHost, becameHost } = useRoomContext();
  const m = useMessages();
  const gameName = m.games.of[state.gameType].name;
  // Its words are for the player left at the table.
  if (spectating && !isHost)
    return <SpectatorPanel footer={<WaitingHowTo />} />;
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
      {becameHost
        ? m.room.endedEarlyNewHost(gameName)
        : m.room.endedEarly(gameName)}
    </RoomPanel>
  );
}

/**
 * Between games, the next game's setting: for the starter to choose, for
 * everyone else to read. Nothing for a game with nothing to set.
 */
function NextGame() {
  const m = useMessages();
  const { state, canStart, changeSettings } = useRoomContext();
  const settings = settingsOf(state);
  if (!settings) return null;
  return (
    <div className={styles.line}>
      {canStart ? (
        <div className={styles.setting}>
          <SettingField
            gameType={state.gameType}
            settings={settings}
            onChange={changeSettings}
            label={m.room.nextGame}
          />
        </div>
      ) : (
        <p className={styles.body}>
          {m.room.nextGameIs(roomSetting(state, m))}
        </p>
      )}
    </div>
  );
}

/**
 * What a finished game's actions would say in words, short, for a phone's
 * results turn bar to say instead (`ResultsActions` with `words={false}`):
 * who the next game waits on, or that it is starting. Null when there is
 * nothing to say.
 */
export function useResultsNote(starting: boolean): string | null {
  const { state, playerId, canStart, isHost, starterName, spectating } =
    useRoomContext();
  const m = useMessages();
  const names = (ids: readonly string[]) =>
    listNames(
      ids.map((id) => state.playerList[id]?.username ?? ''),
      m,
    );
  if (canStart) {
    if (starting) return m.room.starting;
    const ready = state.ready.filter(
      (id) => id !== playerId && state.playerList[id],
    );
    if (ready.length > 0) return m.room.areReady(names(ready), ready.length);
    return isHost ? null : m.room.short.standIn(state.owner.username);
  }
  if (spectating) return m.room.short.waitingFor(starterName);
  if (!state.ready.includes(playerId)) return m.room.short.ready;
  const waiting = waitingOn(state, state.ready).filter((id) => id !== playerId);
  return m.room.short.waitingFor(
    waiting.length > 0 ? names(waiting) : starterName,
  );
}

/**
 * A finished game's actions. The starter (the host, or while they are away
 * the player next in line) chooses the next game's setting and plays again
 * while there are enough players, or invites while there are not, and sees
 * who is ready. Anybody else at the table says Ready: once everyone has, the
 * next game starts without the starter. A spectator waits, and may sit.
 */
export function ResultsActions({
  onPlayAgain,
  starting,
  words = true,
}: {
  onPlayAgain: () => void;
  starting: boolean;
  /** False where `useResultsNote` says the words elsewhere: only buttons. */
  words?: boolean;
}) {
  const { state, playerId, canStart, starterName, spectating, setReady } =
    useRoomContext();
  const m = useMessages();
  const standIn = useStandIn();
  const count = Object.keys(state.playerList).length;
  const names = (ids: readonly string[]) =>
    listNames(
      ids.map((id) => state.playerList[id]?.username ?? ''),
      m,
    );

  if (canStart) {
    if (starting) {
      return words ? <StatusLine>{m.room.starting}</StatusLine> : null;
    }
    const enough = count >= gameInfo(state.gameType).minPlayers;
    const ready = state.ready.filter(
      (id) => id !== playerId && state.playerList[id],
    );
    const said = [
      standIn,
      ready.length > 0 && m.room.areReady(names(ready), ready.length),
    ].filter(Boolean);
    return (
      <>
        <NextGame />
        {words && said.length > 0 && (
          <p className={cx(styles.line, styles.body)}>{said.join(' ')}</p>
        )}
        {enough && <Button onClick={onPlayAgain}>{m.room.playAgain}</Button>}
        <InviteButton primary={!enough} />
        <SeatMove />
      </>
    );
  }
  if (spectating) {
    return (
      <>
        <NextGame />
        {words && (
          <StatusLine>{m.room.waitingForAgain(starterName)}</StatusLine>
        )}
        <SeatMove primary />
      </>
    );
  }
  const youReady = state.ready.includes(playerId);
  const waiting = waitingOn(state, state.ready).filter((id) => id !== playerId);
  return (
    <>
      <NextGame />
      {words && (
        <div className={styles.line}>
          {youReady ? (
            <StatusLine>
              {waiting.length > 0
                ? m.room.waitingOnReady(names(waiting), starterName)
                : m.room.waitingForAgain(starterName)}
            </StatusLine>
          ) : (
            <p className={styles.body}>{m.room.readyHint(starterName)}</p>
          )}
        </div>
      )}
      {youReady ? (
        <Button variant="secondary" onClick={() => setReady(false)}>
          {m.room.notReady}
        </Button>
      ) : (
        <Button icon="check" onClick={() => setReady(true)}>
          {m.room.ready}
        </Button>
      )}
      <SeatMove />
    </>
  );
}

/**
 * A finished game's panel: what happened, the game's own account of it, and
 * what comes next (`ResultsActions`).
 */
export function ResultsFrame({
  title,
  detail,
  children,
  onPlayAgain,
  starting,
}: {
  title: string;
  detail: string;
  children: ReactNode;
  onPlayAgain: () => void;
  starting: boolean;
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
        <ResultsActions onPlayAgain={onPlayAgain} starting={starting} />
      </div>
    </section>
  );
}

/**
 * D13, D14, M14, M15: the final standings, and what comes next
 * (`ResultsActions`).
 */
export function ResultsPanel<Summary extends GameSummary>({
  summary,
  title,
  detail,
  standingDetail,
  onPlayAgain,
  starting,
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
  const score = winner && scoreOf(m, state.gameType, winner.points);
  // The viewer's own win is theirs: "You win", not their name.
  const others = winners
    .filter((w) => w.playerId !== playerId)
    .map((w) => w.username);
  const won = others.length < winners.length;

  return (
    <ResultsFrame
      title={
        title ??
        (winner === undefined || score === undefined
          ? m.room.gameOver
          : won
            ? others.length === 0
              ? m.room.youWin(score)
              : m.room.youTie(listNames(others, m), score)
            : winners.length === 1
              ? m.room.wins(winner.username, score)
              : m.room.ties(
                  listNames(
                    winners.map((w) => w.username),
                    m,
                  ),
                  score,
                ))
      }
      detail={
        title === undefined && place !== undefined && place > 1
          ? m.room.finished(detail, ordinal(place, m))
          : detail
      }
      onPlayAgain={onPlayAgain}
      starting={starting}
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
                wrap
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
