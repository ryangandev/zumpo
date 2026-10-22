import { useRef, useState } from 'react';
import {
  boardOf,
  colorToMove,
  lastStoneOf,
  otherColor,
  pointName,
} from '../../../shared/gomoku';
import type {
  GomokuColor,
  GomokuGameSummary,
  GomokuRoomState,
} from '../../../shared/wire-types';
import { Button, Dialog, Notice, TurnBar, type TurnBarProps } from '../ui';
import { scoreOf } from '../games/catalog';
import { useMessages, type Messages } from '../i18n';
import { useSecondsLeft } from '../net/use-seconds-left';
import { initialsOf, toneOf } from '../players/avatar';
import {
  RESULT_TITLE,
  ResultBar,
  ResultsActions,
  useResultsNote,
  type ResultsNote,
  WaitingPanel,
} from '../room/panels';
import { rankedPlayers, type Seat } from '../room/players';
import { useRoomContext, type Room as RoomOf } from '../room/room-context';
import { RoomLayout, type PlayerLine } from '../room/room-layout';
import { PHONE, TOUCH, useMediaQuery } from '../shell/use-media-query';
import { GomokuTable, type SeatView } from './table';

/**
 * The turn bar width under which its hints take a line of their own. The
 * widest hint in play, the last move, by name, beside whose turn it is, with
 * 18-character names and its clock, in either language, needs 786 px beside
 * its main line. Its result (ResultBar), as tall as the bar in play over the
 * same board, fits there too: a heading naming one 18-character player stays
 * at full size beside its detail, and one where the detail names another,
 * "Bartholomew Wilson wins with five in a row." beside "225 moves.
 * Maximilian Fischer plays Black next.", is scaled no smaller than 0.85 from
 * 792 px on Linux's text. 4 px to spare for subpixel text (TurnBar's
 * hintRowBelow).
 */
const HINT_ROW_BELOW = 796;

type Room = RoomOf<GomokuRoomState>;

/** A point the viewer picked, good while the game is still at that move. */
interface Picked {
  point: number;
  at: number;
}

/** GM08-GM19: a Gomoku room, before, during and after a game. */
export function GomokuRoom() {
  const m = useMessages();
  const room = useRoomContext<GomokuRoomState>();
  const { state, playerId, socket, spectating, reconnecting } = room;
  const phone = useMediaQuery(PHONE);
  // A tap shows the stone first wherever there is no hover to show it.
  const tapTwice = useMediaQuery(TOUCH) || phone;
  const seconds = useSecondsLeft(
    state.phaseEndsInMs,
    room.receivedAt,
    reconnecting,
  );
  const playing = state.phase === 'playing';
  // The last board stays until the next game; its result only while the
  // same pair is at the table: a new opponent is waiting for a new game.
  const last = playing ? null : state.lastGame;
  const summary = last && sameSeats(state) ? last : null;
  const mine = colorOf(state, playerId);
  const myTurn = playing && state.turnPlayerId === playerId && !reconnecting;
  // A phone's results say what the next game waits on in the turn bar.
  const note = useResultsNote(room.starting);

  // A first tap on a phone, and a stone sent and not yet answered: each holds
  // only while the game is still at the move it was picked on.
  const [preview, setPreview] = useState<Picked | null>(null);
  const [sent, setSent] = useState<Picked | null>(null);
  const current = (picked: Picked | null) =>
    playing && picked?.at === state.moves.length ? picked.point : null;
  const sending = current(sent);
  const previewing = myTurn && sending === null ? current(preview) : null;
  const [resigning, setResigning] = useState(false);

  // A game that ends, or a page that drops and comes back, forgets what was
  // picked or asked: the next game may reach the same move.
  const [seen, setSeen] = useState({ playing, reconnecting });
  if (seen.playing !== playing || seen.reconnecting !== reconnecting) {
    setSeen({ playing, reconnecting });
    setSent(null);
    setPreview(null);
    if (seen.playing !== playing) setResigning(false);
  }

  const place = (point: number) => {
    if (!myTurn || sending !== null) return;
    setSent({ point, at: state.moves.length });
    setPreview(null);
    socket.emit('gomoku:place', state.roomId, point);
  };

  const board = {
    stones: boardOf(state.moves),
    last: lastStoneOf(state.moves),
    winLines: last ? state.winLines : null,
    color: playing ? mine : null,
    pending: sending ?? previewing,
    disabled: !myTurn || sending !== null,
    onPlace: mine && playing ? place : undefined,
    onPreview: tapTwice
      ? (point: number) => setPreview({ point, at: state.moves.length })
      : undefined,
    label: m.gomoku.board,
  };

  const canResign = playing && mine !== null;
  const resign = canResign ? (
    <Button variant="secondary" onClick={() => setResigning(true)}>
      {m.gomoku.resign}
    </Button>
  ) : null;

  return (
    <RoomLayout
      // No standings over the board: the seats under the board say who is who.
      standings={false}
      yourTurn={myTurn}
      phase={
        playing
          ? { tone: 'blue', label: m.gomoku.game(state.gameNumber) }
          : summary
            ? { tone: 'lime', label: m.gomoku.gameOver }
            : { tone: 'blue', label: m.gomoku.waitingRoom }
      }
      stage={
        <>
          {playing || summary ? null : (
            <WaitingPanel
              aloneTitle={m.gomoku.alone}
              setup={m.gomoku.setup}
              guestSetup={m.gomoku.setup}
              onStart={room.startGame}
              starting={room.starting}
            />
          )}
          <GomokuTable
            phone={phone}
            fill={phone && (playing || summary !== null)}
            // The table stays through the game's end, so it keeps its scale.
            fitHeight={(playing || summary !== null) && 'room'}
            turn={
              playing ? (
                <TurnBar
                  hintRowBelow={HINT_ROW_BELOW}
                  {...turnBar(room, seconds, previewing !== null, phone, m)}
                  // Its words fit one row, so the board keeps the height.
                  stackOnPhone={false}
                />
              ) : summary && phone ? (
                <TurnBar
                  {...resultBar(room, summary, note, m)}
                  stackOnPhone={false}
                />
              ) : (
                summary && <Results room={room} summary={summary} />
              )
            }
            board={board}
            seats={seatsOf(room, phone, m)}
            notice={
              playing && mine && state.missedTurns[playerId] === 1 ? (
                <Notice>{m.gomoku.missedNotice}</Notice>
              ) : null
            }
            note={!playing && !summary ? m.gomoku.colorsNote : undefined}
            holdActions={phone && playing && spectating}
            actions={
              playing ? (
                (tapTwice ? mine !== null : resign) && (
                  <>
                    {/* A touch screen's player always has it, live once a
                        faint stone is down, so nothing moves when one is. */}
                    {tapTwice && mine !== null && (
                      <Button
                        disabled={previewing === null}
                        onClick={() => {
                          if (previewing !== null) place(previewing);
                        }}
                      >
                        {m.gomoku.placeStone}
                      </Button>
                    )}
                    {resign}
                  </>
                )
              ) : summary ? (
                // Where Resign was: at the foot of the seats beside the
                // board, or under it on a phone, whose turn bar says the
                // words.
                <ResultsActions
                  onPlayAgain={room.startGame}
                  starting={room.starting}
                  words={!phone}
                />
              ) : null
            }
          />
          <ResignDialog
            open={resigning && canResign && !spectating}
            winner={mine ? sideName(state, otherColor(mine)) : ''}
            game={state.gameNumber}
            onResign={() => {
              setResigning(false);
              socket.emit('gomoku:resign', state.roomId);
            }}
            onKeep={() => setResigning(false)}
          />
        </>
      }
      players={playersOf(state).map((seat) =>
        playerLine(state, playerId, seat, m),
      )}
      chat={{ placeholder: m.gomoku.chat }}
    />
  );
}

/** The viewer's colour this game, or the last; null while watching. */
function colorOf(state: GomokuRoomState, playerId: string): GomokuColor | null {
  if (state.colors?.black.playerId === playerId) return 'black';
  if (state.colors?.white.playerId === playerId) return 'white';
  return null;
}

function sideName(state: GomokuRoomState, color: GomokuColor): string {
  return state.colors?.[color].username ?? '';
}

/** Whether everybody at the table played in this game, or the last. */
function sameSeats(state: GomokuRoomState): boolean {
  const { colors } = state;
  return (
    colors !== null &&
    Object.keys(state.playerList).every(
      (id) => id === colors.black.playerId || id === colors.white.playerId,
    )
  );
}

/** A seat's avatar, as the scoreboard draws the same player's. */
const avatar = (name: string) => ({
  initials: initialsOf(name),
  tone: toneOf(name),
});

/**
 * The seats, Black's first: this game's or the last game's colours, and a
 * free seat while one is. Before a pair's first game nobody has a colour,
 * and the scoreboard already says who is here: there are no seats yet.
 */
function seatsOf(room: Room, phone: boolean, m: Messages): SeatView[] {
  const { state, playerId } = room;
  const playing = state.phase === 'playing';
  const { colors } = state;
  if (!colors || !sameSeats(state)) return [];
  const free = (color: GomokuColor): SeatView => ({
    key: `free-${color}`,
    name: m.gomoku.freeSeat,
    detail: m.gomoku.anybodyCanSit,
    color,
  });

  const summary = playing ? null : state.lastGame;
  return (['black', 'white'] as const).map((color) => {
    const side = colors[color];
    const seat = state.playerList[side.playerId];
    if (!seat) return free(color);
    const you = side.playerId === playerId;
    const turn = playing && state.turnPlayerId === side.playerId;
    const won = summary?.winner === color;
    const playNote = !seat.isConnected
      ? m.gomoku.notes.away
      : playing
        ? playingNote(state, playerId, side.playerId, m)
        : undefined;
    const endNote = won
      ? summary?.ending === 'five'
        ? m.gomoku.notes.five
        : m.gomoku.notes.won
      : summary?.ending === 'draw'
        ? m.gomoku.notes.draw
        : undefined;
    const note = playNote ?? endNote;
    // On a phone the scoreboard is on its own tab: the seats carry the score.
    const score = summary && phone && scoreOf(m, 'gomoku', seat.points);
    // A compact seat is one line that never wraps: the stone shows the
    // colour, and the turn bar and the lime seat say how a game ended.
    const short = [playNote, score].filter(Boolean).join(' · ');
    const notes = [note, score].filter(Boolean).join(' · ');
    return {
      key: side.playerId,
      name: seat.username,
      detail: m.gomoku.seat(color, notes || undefined),
      compactDetail: m.gomoku.phoneSeat(short),
      avatar: avatar(seat.username),
      color,
      state: turn ? 'turn' : won ? 'won' : 'default',
      you,
    };
  });
}

/** In a game, a seat's note: whose turn it is, or a missed turn. */
function playingNote(
  state: GomokuRoomState,
  viewer: string,
  seat: string,
  m: Messages,
): string | undefined {
  if (state.turnPlayerId === seat) {
    return seat === viewer ? m.gomoku.notes.yourTurn : m.gomoku.notes.thinking;
  }
  return state.missedTurns[seat] === 1 ? m.gomoku.notes.missed : undefined;
}

/** GM09-GM11: whose turn, what was played last, and the clock. */
function turnBar(
  room: Room,
  seconds: number,
  previewing: boolean,
  phone: boolean,
  m: Messages,
): TurnBarProps {
  const { state, playerId, reconnecting } = room;
  const toMove = colorToMove(state.moves);
  const name = sideName(state, toMove);
  const mine = state.turnPlayerId === playerId;
  const last = state.moves.at(-1);
  const lastMine = last
    ? state.colors?.[last.color].playerId === playerId
    : false;
  const lastName = last ? sideName(state, last.color) : '';
  // A phone's bar keeps each line to one line at 360 px whatever the names:
  // the seats under the board name the players, so it names nobody; the
  // main line says whose stone goes down by its colour.
  const now = mine
    ? m.gomoku.place(toMove)
    : phone
      ? m.gomoku.phone.thinking(toMove)
      : m.gomoku.isThinking(name);
  // A turn that ran out of time leads the bar, so nobody misses that it did;
  // what happens now goes under it.
  const passed =
    last?.point === null
      ? lastMine
        ? m.gomoku.yourTurnPassed
        : phone
          ? m.gomoku.phone.passed(last.color)
          : m.gomoku.passed(lastName)
      : null;
  // A phone's one row has no room for the hint beside the clock: it takes
  // the main line, scaled to fit, and the faint stone shows the colour.
  const hintMain = previewing && phone;
  return {
    label: mine
      ? m.gomoku.yourTurn
      : !phone
        ? m.gomoku.turn(name)
        : room.spectating
          ? m.gomoku.phone.watching
          : m.gomoku.phone.theirTurn,
    kind: 'status',
    main: hintMain ? m.gomoku.tapAgain : (passed ?? now),
    meta: hintMain
      ? undefined
      : previewing
        ? m.gomoku.tapAgain
        : passed
          ? now
          : !last || last.point === null
            ? // A phone's one row has no room for it beside the clock; the
              // main line already says whose stone goes down.
              phone
              ? undefined
              : m.gomoku.firstMove
            : phone
              ? m.gomoku.phone.lastMove(pointName(last.point))
              : lastMine
                ? m.gomoku.youPlayed(pointName(last.point))
                : m.gomoku.played(lastName, pointName(last.point)),
    // While reconnecting the server's clock cannot be known: it holds.
    countdown: reconnecting
      ? { seconds, label: m.gomoku.paused, waiting: true }
      : { seconds, label: m.gomoku.toMove, waiting: !mine },
  };
}

/** What happened in the last game, for the viewer: "You win: Leo resigned." */
function resultTitle(
  room: Room,
  summary: GomokuGameSummary,
  m: Messages,
  phone = false,
): string {
  const { state, playerId } = room;
  if (summary.winner === null) return m.gomoku.draw;
  const winner = state.colors?.[summary.winner];
  const loser = state.colors?.[otherColor(summary.winner)];
  if (phone) {
    // A phone's turn bar: by colour, as the seats under the board say who.
    const losing = otherColor(summary.winner);
    if (winner?.playerId === playerId) {
      return m.gomoku.phone.youWin(summary.ending, losing);
    }
    if (
      loser?.playerId === playerId &&
      (summary.ending === 'resigned' || summary.ending === 'timeout')
    ) {
      return m.gomoku.youLose(summary.ending, '');
    }
    return m.gomoku.phone.wins(summary.ending, summary.winner, losing);
  }
  if (winner?.playerId === playerId) {
    return m.gomoku.youWin(summary.ending);
  }
  if (loser?.playerId === playerId) {
    return m.gomoku.youLose(summary.ending, winner?.username ?? '');
  }
  return m.gomoku.theyWin(summary.ending, winner?.username ?? '');
}

/** What comes next: who plays Black, or whose seat is free. */
function resultNext(
  state: GomokuRoomState,
  summary: GomokuGameSummary,
  m: Messages,
  phone = false,
): string | null {
  if (summary.ending === 'left' && summary.winner !== null) {
    const left = otherColor(summary.winner);
    return phone
      ? m.gomoku.phone.seatFree(left)
      : m.gomoku.seatFree(sideName(state, left));
  }
  // The colours swap for the same pair; a new pair's are drawn.
  if (!state.samePair) return null;
  return phone
    ? m.gomoku.phone.swap
    : m.gomoku.nextBlack(sideName(state, 'white'));
}

/**
 * GM13-GM15: the result in the turn bar's place over the finished board, as
 * tall as the bar in play, so the board keeps its size and place; what comes
 * next is where Resign was, at the foot of the seats.
 */
function Results({
  room,
  summary,
}: {
  room: Room;
  summary: GomokuGameSummary;
}) {
  const m = useMessages();
  const first =
    summary.ending === 'draw'
      ? m.gomoku.drawDetail(summary.stones)
      : m.gomoku.moves(summary.stones);
  const next = resultNext(room.state, summary, m);
  return (
    <ResultBar
      summary={summary}
      label={m.gomoku.gameOver}
      title={resultTitle(room, summary, m)}
      detail={next ? m.gomoku.both(first, next) : first}
      // As the bar in play: one row on a narrow column, as tall.
      stackOnPhone={false}
      hintRowBelow={HINT_ROW_BELOW}
    />
  );
}

/** GM19: on a phone the result sits in the turn bar, over the board. */
function resultBar(
  room: Room,
  summary: GomokuGameSummary,
  /** What the next game waits on (`useResultsNote`), over the rest. */
  note: ResultsNote | null,
  m: Messages,
): TurnBarProps {
  const { state, playerId } = room;
  const next = resultNext(state, summary, m, true);
  // The same pair swaps colours, so a player knows theirs before saying
  // Ready; a new pair's are drawn when the game starts.
  const played = colorOf(state, playerId);
  const color =
    next && state.samePair && played && summary.ending !== 'left'
      ? otherColor(played)
      : null;
  // One line at 360 px whatever the names: the note names nobody.
  const waits = (kind: ResultsNote['kind']) =>
    kind === 'wait'
      ? state.ready.includes(playerId)
        ? m.gomoku.phone.waiting(color ?? undefined)
        : m.gomoku.phone.theyReady(color ?? undefined)
      : room.starting
        ? m.room.starting
        : room.spectating
          ? m.gomoku.phone.waitNext
          : m.gomoku.phone.youStart;
  const said =
    note && color && note.kind === 'ask'
      ? m.gomoku.nextAsk(color)
      : note && note.kind !== 'ask'
        ? waits(note.kind)
        : note
          ? note.text
          : color && m.gomoku.nextYou(color);
  return {
    label: m.gomoku.gameOver,
    kind: 'status',
    main: resultTitle(room, summary, m, true),
    headingId: RESULT_TITLE,
    meta:
      said ??
      (summary.ending === 'draw'
        ? m.gomoku.drawDetail(summary.stones)
        : (next ?? m.gomoku.moves(summary.stones))),
  };
}

/** GM12: resigning asks first; the clock keeps running behind it. */
function ResignDialog({
  open,
  winner,
  game,
  onResign,
  onKeep,
}: {
  open: boolean;
  winner: string;
  game: number;
  onResign: () => void;
  onKeep: () => void;
}) {
  const m = useMessages();
  const keep = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onKeep();
      }}
      title={m.gomoku.resignTitle}
      description={m.gomoku.resignBody(winner, game)}
      initialFocus={keep}
      actions={
        <>
          <Button variant="danger" onClick={onResign}>
            {m.gomoku.resign}
          </Button>
          <Button ref={keep} variant="secondary" onClick={onKeep}>
            {m.gomoku.keepPlaying}
          </Button>
        </>
      }
    />
  );
}

/** The scoreboard's order: Black then White in a game, else most games won. */
function playersOf(state: GomokuRoomState): Seat[] {
  const players = rankedPlayers(state);
  const { colors } = state;
  if (state.phase !== 'playing' || !colors) return players;
  const order = [colors.black.playerId, colors.white.playerId];
  return players.toSorted(
    (a, b) => order.indexOf(a.playerId) - order.indexOf(b.playerId),
  );
}

/** One player's line on the scoreboard, as their seat reads in a game. */
function playerLine(
  state: GomokuRoomState,
  viewer: string,
  seat: Seat,
  m: Messages,
): PlayerLine {
  if (!seat.isConnected) {
    return { seat, status: m.gomoku.away, statusIcon: 'away', state: 'away' };
  }
  const color = colorOf(state, seat.playerId);
  if (state.phase === 'playing' && color) {
    return {
      seat,
      status: m.gomoku.seat(
        color,
        playingNote(state, viewer, seat.playerId, m),
      ),
      state: state.turnPlayerId === seat.playerId ? 'highlight' : 'default',
    };
  }
  const summary = state.lastGame;
  if (summary?.winner && color === summary.winner && sameSeats(state)) {
    return { seat, status: m.gomoku.wonGame(state.gameNumber) };
  }
  return { seat, status: m.gomoku.waiting };
}
