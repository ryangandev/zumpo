import { cardsToTake } from '../../../shared/snap';
import type { SnapRoomState } from '../../../shared/wire-types';
import type { SnapSpotMark, TurnBarProps } from '../ui';
import { useMessages, type Messages } from '../i18n';
import { useSecondsLeft } from '../net/use-seconds-left';
import { useSecondsSince } from '../net/use-seconds-since';
import { initialsOf } from '../players/avatar';
import { EndedEarlyPanel, ResultsPanel, WaitingPanel } from '../room/panels';
import { rankedPlayers, type Seat } from '../room/players';
import { useRoomContext, type Room as RoomOf } from '../room/room-context';
import { RoomLayout, type PlayerLine } from '../room/room-layout';
import { SnapBoard, SnapTurnBar, type CardView } from './board';

type Room = RoomOf<SnapRoomState>;
type Marks = Partial<Record<number, SnapSpotMark>>;

/** SN05-SN09, SN12-SN13: a Snap room, before, during and after a game. */
export function SnapRoom() {
  const m = useMessages();
  const room = useRoomContext<SnapRoomState>();
  const { state } = room;
  const players = rankedPlayers(state);
  const inGame = state.isGameStarted;
  const ended = !inGame ? state.lastGame : null;
  return (
    <RoomLayout
      phase={
        inGame
          ? { tone: 'blue', label: m.snap.progress(state.taken, state.cards) }
          : ended && !ended.endedEarly
            ? { tone: 'lime', label: m.snap.gameOver }
            : ended && players.length < 2
              ? { tone: 'peach', label: m.snap.gameEnded }
              : { tone: 'blue', label: m.snap.waitingRoom }
      }
      stage={inGame ? <Play room={room} /> : <BetweenGames room={room} />}
      players={players.map((seat) => playerLine(state, seat, m))}
      chat={{ placeholder: m.snap.chat }}
    />
  );
}

/** Who took the latest card, as the badge and the tags name them. */
function takerOf(state: SnapRoomState, playerId: string, m: Messages) {
  const take = state.lastTake;
  if (!take) return null;
  const name = take.playerId === playerId ? m.snap.you : take.username;
  return {
    mine: take.playerId === playerId,
    name,
    initials: initialsOf(take.username),
    label: m.ui.snap.takenBy(name),
  };
}

/** Your card, with the cards you have taken on its tag. */
function myView(
  room: Room,
  m: Messages,
  extra: Partial<CardView> = {},
): CardView | null {
  const { state, playerId } = room;
  if (!state.myCard) return null;
  return {
    symbols: state.myCard,
    label: m.snap.yourCard,
    tag: m.snap.won(state.playerList[playerId]?.points ?? 0),
    ...extra,
  };
}

function BetweenGames({ room }: { room: Room }) {
  const m = useMessages();
  const { state, startGame, starting, playerId } = room;
  const count = Object.keys(state.playerList).length;
  const summary = state.lastGame;

  if (summary && !summary.endedEarly) {
    const taker = takerOf(state, playerId, m);
    const take = state.lastTake;
    return (
      <>
        <ResultsPanel
          summary={summary}
          detail={m.snap.resultDetail(summary.taken)}
          onPlayAgain={startGame}
          starting={starting}
        />
        {/* SN09: the last middle card stays, with its taker, until the next
            game is dealt. */}
        {state.middle && taker && take && (
          <SnapBoard
            middle={{
              symbols: state.middle.symbols,
              label: m.snap.lastCard,
              tag: taker.name,
              state: 'taken',
              marks: { [take.symbol]: 'match' },
              badge: taker.initials,
              badgeLabel: taker.label,
            }}
            // Its taker's card is the last card itself.
            mine={taker.mine ? null : myView(room, m)}
          />
        )}
      </>
    );
  }
  if (summary?.endedEarly && count < 2) return <EndedEarlyPanel />;
  return (
    <WaitingPanel
      aloneTitle={m.snap.alone}
      setup={m.snap.setup(count, cardsToTake(count))}
      guestSetup={m.snap.guestSetup(count, cardsToTake(count))}
      onStart={startGame}
      starting={starting}
    />
  );
}

/** SN05-SN08, SN12-SN13: the middle card everybody looks at, and yours. */
function Play({ room }: { room: Room }) {
  const m = useMessages();
  const { state, receivedAt, reconnecting, socket, playerId } = room;
  const seconds = useSecondsLeft(state.phaseEndsInMs, receivedAt, reconnecting);
  const lockedSeconds = useSecondsLeft(
    state.lockedOutMs,
    receivedAt,
    reconnecting,
  );
  const cardSeconds = useSecondsSince(
    state.cardMs,
    receivedAt,
    reconnecting || state.phase !== 'finding',
  );
  const { middle } = state;
  if (!middle) return null;

  const locked = state.lockedOutMs > 0;
  const taps = !room.spectating && state.myCard !== null;
  const canTap = taps && state.phase === 'finding' && !locked && !reconnecting;

  const middleMarks: Marks = {};
  const myMarks: Marks = {};
  const taker = takerOf(state, playerId, m);
  const take = state.phase === 'taken' ? state.lastTake : null;
  if (take) {
    middleMarks[take.symbol] = 'match';
    // The taker sees the match on both cards; everybody else's card stays.
    if (taker?.mine) myMarks[take.symbol] = 'match';
  }
  if (locked && state.myMiss) {
    const marks = state.myMiss.on === 'mine' ? myMarks : middleMarks;
    marks[state.myMiss.symbol] = 'miss';
  }

  return (
    <>
      <SnapTurnBar
        names
        {...turnBar(room, { seconds, lockedSeconds, cardSeconds }, m)}
      />
      <SnapBoard
        middle={{
          symbols: middle.symbols,
          label: m.snap.middleCard,
          tag: m.snap.left(state.cards - state.taken),
          marks: middleMarks,
          ...(take && taker
            ? {
                state: 'taken' as const,
                badge: taker.initials,
                badgeLabel: taker.label,
              }
            : {}),
        }}
        mine={myView(room, m, {
          marks: myMarks,
          state: locked ? 'locked' : 'default',
        })}
        onTap={
          taps
            ? (symbol) =>
                socket.emit('snap:claim', state.roomId, middle.number, symbol)
            : undefined
        }
        disabled={!canTap}
      />
    </>
  );
}

/** The clocks the turn bar can show, in whole seconds. */
interface Clocks {
  /** Left of a taken card's moment. */
  seconds: number;
  /** Left of this player's lockout. */
  lockedSeconds: number;
  /** How long the middle card has been out. */
  cardSeconds: number;
}

/**
 * What the turn bar says, with a clock in every phase: the bar keeps its
 * height, so the cards under it never move.
 */
function turnBar(
  room: Room,
  { seconds, lockedSeconds, cardSeconds }: Clocks,
  m: Messages,
): TurnBarProps {
  const { state, playerId, reconnecting } = room;
  // While reconnecting the server's clocks cannot be known: they hold.
  const clock = (label: string, left: number, waiting = true) =>
    reconnecting
      ? { seconds: left, label: m.snap.paused, waiting: true }
      : { seconds: left, label, waiting };
  if (state.phase === 'taken' && state.lastTake) {
    const mine = state.lastTake.playerId === playerId;
    return {
      label: m.snap.taken,
      kind: 'status',
      main: mine ? m.snap.youTook : m.snap.tookIt(state.lastTake.username),
      meta: m.snap.wasOnBoth(state.lastTake.symbol),
      countdown: clock(m.snap.nextCard, seconds),
    };
  }
  if (state.lockedOutMs > 0) {
    // Under a card turned up since, the miss is no longer about anything.
    const miss = state.myMiss;
    return {
      label: m.snap.lockedTitle,
      kind: 'status',
      main: miss ? m.snap.notMatch : m.snap.stillLocked,
      meta: miss ? m.snap.onlyOn(miss.symbol, miss.on) : m.snap.tapAfterLockout,
      countdown: clock(m.snap.lockedOut, lockedSeconds, false),
    };
  }
  // The time on this card is not a deadline, so it never turns urgent.
  return {
    label: room.spectating ? m.snap.watching : m.snap.oneOnBoth,
    kind: 'status',
    main: room.spectating ? m.snap.everyoneLooking : m.snap.spot,
    meta: m.snap.firstTakes,
    countdown: { ...clock(m.snap.onThisCard, cardSeconds), deadline: false },
  };
}

/** One player's line on the scoreboard. */
function playerLine(state: SnapRoomState, seat: Seat, m: Messages): PlayerLine {
  if (!seat.isConnected) {
    return { seat, status: m.snap.away, statusIcon: 'away', state: 'away' };
  }
  if (!state.isGameStarted) return { seat, status: m.snap.waiting };
  if (state.phase === 'taken' && state.lastTake?.playerId === seat.playerId) {
    return { seat, status: m.snap.tookCard, state: 'scored' };
  }
  return { seat, status: m.snap.looking };
}
