import { itemAt } from '../../../shared/list';
import { useState } from 'react';
import type { TriosRoomState } from '../../../shared/wire-types';
import { TurnBar, type TurnBarProps } from '../ui';
import { useMessages, type Messages } from '../i18n';
import { useSecondsLeft } from '../net/use-seconds-left';
import { useSecondsSince } from '../net/use-seconds-since';
import { initialsOf } from '../players/avatar';
import { EndedEarlyPanel, ResultsPanel, WaitingPanel } from '../room/panels';
import { rankedPlayers, type Seat } from '../room/players';
import { useRoomContext, type Room as RoomOf } from '../room/room-context';
import { RoomLayout, type PlayerLine } from '../room/room-layout';
import { LastTrio, TablePanel, TriosTable, type PlaceView } from './table';
import { whyNotATrio } from './words';

/**
 * The turn bar width under which its hints take a line of their own: the
 * widest of them, why three cards are not a trio, beside the lockout, with
 * 18-character names and its clock, in either language, needs this much
 * beside its main line, with 4 px to spare for a clock's digits and subpixel
 * text (TurnBar's hintRowBelow).
 */
const HINT_ROW_BELOW = 732;

type Room = RoomOf<TriosRoomState>;

/** TS05-TS09, TS12: a Trios room, before, during and after a game. */
export function TriosRoom() {
  const m = useMessages();
  const room = useRoomContext<TriosRoomState>();
  const { state } = room;
  const players = rankedPlayers(state);
  const inGame = state.isGameStarted;
  const ended = !inGame ? state.lastGame : null;
  return (
    <RoomLayout
      phase={
        inGame
          ? {
              tone: 'blue',
              label: m.trios.progress(state.found, state.trios),
            }
          : ended && !ended.endedEarly
            ? { tone: 'lime', label: m.trios.gameOver }
            : ended && players.length < 2
              ? { tone: 'peach', label: m.trios.gameEnded }
              : { tone: 'blue', label: m.trios.waitingRoom }
      }
      stage={inGame ? <Play room={room} /> : <BetweenGames room={room} />}
      players={players.map((seat) => playerLine(state, seat, m))}
      chat={{ placeholder: m.trios.chat }}
    />
  );
}

/** Who took the latest trio, as the card badges and the strip name them. */
function finderOf(state: TriosRoomState, playerId: string, m: Messages) {
  const trio = state.lastTrio;
  if (!trio) return null;
  return {
    initials: initialsOf(trio.username),
    name: trio.playerId === playerId ? m.trios.you : trio.username,
    label: m.trios.by(trio.playerId === playerId ? m.trios.you : trio.username),
  };
}

/** The places of a trio just taken, marked with who took it. */
function takenPlaces(
  state: TriosRoomState,
  playerId: string,
  m: Messages,
): Record<number, PlaceView> {
  const finder = finderOf(state, playerId, m);
  if (!state.lastTrio || !finder) return {};
  return Object.fromEntries(
    state.lastTrio.places.map((place) => [
      place,
      { state: 'found', badge: finder.initials, badgeLabel: finder.label },
    ]),
  );
}

function BetweenGames({ room }: { room: Room }) {
  const m = useMessages();
  const { state, startGame, starting, playerId } = room;
  const count = Object.keys(state.playerList).length;
  const summary = state.lastGame;

  if (summary && !summary.endedEarly) {
    return (
      <>
        <ResultsPanel
          summary={summary}
          detail={m.trios.resultDetail(summary.trios)}
          onPlayAgain={startGame}
          starting={starting}
        />
        {/* TS09: the finished table stays until the next game is dealt, its
            last trio marked with who took it, so no strip repeats it. */}
        <TablePanel>
          <TriosTable
            cards={state.table}
            places={takenPlaces(state, playerId, m)}
            inPlay={false}
          />
        </TablePanel>
      </>
    );
  }
  if (summary?.endedEarly && count < 2) return <EndedEarlyPanel />;
  return (
    <WaitingPanel
      aloneTitle={m.trios.alone}
      setup={m.trios.setup(count, state.trios)}
      guestSetup={m.trios.guestSetup(count, state.trios)}
      onStart={startGame}
      starting={starting}
    />
  );
}

/** TS05-TS08, TS12: the table everybody looks at, and your own picks. */
function Play({ room }: { room: Room }) {
  const m = useMessages();
  const { state, receivedAt, reconnecting, socket, playerId } = room;
  const seconds = useSecondsLeft(state.phaseEndsInMs, receivedAt, reconnecting);
  const lockedSeconds = useSecondsLeft(
    state.lockedOutMs,
    receivedAt,
    reconnecting,
  );
  // Once both hints are given there is nothing left to count down to.
  const searchingSeconds = useSecondsSince(
    state.searchingMs,
    receivedAt,
    reconnecting || state.hint.length < 2,
  );
  // Picks are yours alone and never leave this page until the third. A card
  // somebody else took leaves them; the rest stay picked.
  const [picks, setPicks] = useState<readonly number[]>([]);
  const picked = picks.filter((card) => state.table.includes(card));
  const locked = state.lockedOutMs > 0;
  const canPick =
    state.phase === 'finding' && !locked && !reconnecting && !room.spectating;

  const pick = (place: number) => {
    const card = itemAt(state.table, place);
    if (picked.includes(card)) {
      setPicks(picked.filter((other) => other !== card));
      return;
    }
    const next = [...picked, card];
    if (next.length < 3) {
      setPicks(next);
      return;
    }
    setPicks([]);
    socket.emit('trios:claim', state.roomId, next);
  };

  const places: Record<number, PlaceView> = {};
  for (const place of state.hint) {
    places[place] = {
      state: 'hinted',
      badge: m.trios.hint,
      badgeLabel: m.trios.hintBadge,
    };
  }
  // Your picks stay shown while a trio is taken, so you see what is still picked.
  for (const card of picked) {
    const place = state.table.indexOf(card);
    places[place] = { ...places[place], state: 'selected' };
  }
  if (locked) {
    for (const card of state.myMiss) {
      const place = state.table.indexOf(card);
      if (place >= 0) places[place] = { ...places[place], state: 'wrong' };
    }
  }
  if (state.phase === 'taken')
    Object.assign(places, takenPlaces(state, playerId, m));

  const finder = finderOf(state, playerId, m);
  return (
    <>
      <TurnBar
        hintRowBelow={HINT_ROW_BELOW}
        {...turnBar(
          room,
          picked.length,
          {
            seconds,
            lockedSeconds,
            searchingSeconds,
          },
          m,
        )}
      />
      <TablePanel>
        <TriosTable
          cards={state.table}
          places={places}
          onPick={canPick ? pick : undefined}
        />
        <LastTrio
          trio={
            state.lastTrio && finder
              ? { finder: finder.name, cards: state.lastTrio.cards }
              : null
          }
        />
      </TablePanel>
    </>
  );
}

/** The clocks the turn bar can show, in whole seconds. */
interface Clocks {
  /** Left of the phase: to the next hint, or to new cards. */
  seconds: number;
  /** Left of this player's lockout. */
  lockedSeconds: number;
  /** How long the table has gone without a trio. */
  searchingSeconds: number;
}

/**
 * What the turn bar says, with a clock in every phase: the bar keeps its
 * height, so the table under it never moves.
 */
function turnBar(
  room: Room,
  picked: number,
  { seconds, lockedSeconds, searchingSeconds }: Clocks,
  m: Messages,
): TurnBarProps {
  const { state, playerId, reconnecting } = room;
  // While reconnecting the server's clocks cannot be known: they hold.
  const clock = (label: string, waiting: boolean, left = seconds) =>
    reconnecting
      ? { seconds: left, label: m.trios.paused, waiting: true }
      : { seconds: left, label, waiting };
  // A hint is help, not a deadline, and neither is the time since a trio:
  // those clocks never turn urgent. A spectator only waits on them. Held
  // while reconnecting, they say Paused as every other clock does.
  const helpClock = (label: string, left = seconds) => ({
    ...clock(label, room.spectating, left),
    deadline: reconnecting,
  });
  if (state.phase === 'taken' && state.lastTrio) {
    const mine = state.lastTrio.playerId === playerId;
    return {
      label: m.trios.taken,
      kind: 'status',
      main: mine ? m.trios.youFound : m.trios.foundBy(state.lastTrio.username),
      meta: m.trios.newCardsSoon,
      countdown: clock(m.trios.newCards, true),
    };
  }
  if (state.lockedOutMs > 0) {
    return {
      label: m.trios.notTrio,
      kind: 'status',
      main: whyNotATrio(state.myMiss, m) ?? m.trios.notTrio,
      meta: m.trios.pickAgainSoon,
      countdown: clock(m.trios.lockedOut, false, lockedSeconds),
    };
  }
  const hints = state.hint.length;
  return {
    label: hints > 0 ? m.trios.hint : m.trios.findTrio,
    kind: 'status',
    main:
      picked === 2
        ? m.trios.pickThird
        : picked === 1
          ? m.trios.pickTwo
          : hints === 1
            ? m.trios.oneMarked
            : hints === 2
              ? m.trios.twoMarked
              : room.spectating
                ? m.trios.everyoneLooking
                : m.trios.pickThree,
    meta:
      hints === 1
        ? m.trios.findTwo
        : hints === 2
          ? m.trios.findThird
          : m.trios.firstTakes,
    // After the second hint nothing is left to count down to, so the clock
    // counts the time the table has gone without a trio.
    countdown:
      hints < 2
        ? helpClock(hints === 0 ? m.trios.toHint : m.trios.toSecondHint)
        : helpClock(m.trios.withoutTrio, searchingSeconds),
  };
}

/** One player's line on the scoreboard. */
function playerLine(
  state: TriosRoomState,
  seat: Seat,
  m: Messages,
): PlayerLine {
  if (!seat.isConnected) {
    return { seat, status: m.trios.away, statusIcon: 'away', state: 'away' };
  }
  if (!state.isGameStarted) return { seat, status: m.trios.waiting };
  if (state.phase === 'taken' && state.lastTrio?.playerId === seat.playerId) {
    return { seat, status: m.trios.foundTrio, state: 'scored' };
  }
  return { seat, status: m.trios.looking };
}
