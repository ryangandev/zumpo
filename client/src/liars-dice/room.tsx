import type { LiarsDiceRoomState } from '../../../shared/wire-types';
import { BidPicker, Button, TurnBar, type TurnBarProps } from '../ui';
import { useMessages, type Messages } from '../i18n';
import { useSecondsLeft } from '../net/use-seconds-left';
import { EndedEarlyPanel, ResultsPanel, WaitingPanel } from '../room/panels';
import { rankedPlayers, type Seat } from '../room/players';
import { useRoomContext, type Room as RoomOf } from '../room/room-context';
import { RoomLayout, type PlayerLine } from '../room/room-layout';
import { useBidChoice } from './bid-choice';
import { fromViewer, Table, type TableSeat } from './table';
import { bidLine, naming, revealBar, stood, type Naming } from './words';
import styles from './room.module.css';

/**
 * The turn bar width under which its hints take a line of their own: the
 * widest of them, a long name's bid beside the round's hint, with
 * 18-character names, in either language, needs this much beside its main
 * line (TurnBar's hintRowBelow).
 */
const HINT_ROW_BELOW = 665;

type Room = RoomOf<LiarsDiceRoomState>;

/** LD08-LD12: a Liar's Dice room, before, during and after a game. */
export function LiarsDiceRoom() {
  const m = useMessages();
  const room = useRoomContext<LiarsDiceRoomState>();
  const { state } = room;
  const inGame = state.isGameStarted;
  const players = inGame
    ? inTurnOrder(state, room.playerId)
    : rankedPlayers(state);
  const ended = !inGame ? state.lastGame : null;
  return (
    <RoomLayout
      yourTurn={inGame && bidding(room)}
      // No standings over the board: everybody’s cups are on the table.
      standings={false}
      phase={
        inGame
          ? { tone: 'blue', label: m.liarsDice.round(state.round) }
          : ended && !ended.endedEarly
            ? { tone: 'lime', label: m.liarsDice.gameOver }
            : ended && players.length < 2
              ? { tone: 'peach', label: m.liarsDice.gameEnded }
              : { tone: 'blue', label: m.liarsDice.waitingRoom }
      }
      stage={inGame ? <Turn room={room} /> : <BetweenGames room={room} />}
      players={players.map((seat) => playerLine(state, seat, m))}
      chat={{ placeholder: m.liarsDice.chat }}
    />
  );
}

/**
 * During a game the Players panel follows the table: turn order from the
 * viewer, so who bids after whom reads the same in both. Between games it
 * ranks by dice left.
 */
function inTurnOrder(state: LiarsDiceRoomState, youId: string): Seat[] {
  const ranked = rankedPlayers(state);
  const order = fromViewer(state.cups, (cup) => cup.playerId, youId).map(
    (cup) => cup.playerId,
  );
  const place = (seat: Seat) => {
    const at = order.indexOf(seat.playerId);
    return at < 0 ? order.length : at;
  };
  return ranked.toSorted((a, b) => place(a) - place(b));
}

/** Whether it is this player's turn to bid or call. */
const bidding = ({ state, playerId, reconnecting }: Room) =>
  state.phase === 'bidding' && state.turnPlayerId === playerId && !reconnecting;

const whoIn = (room: Room, m: Messages): Naming =>
  naming(
    room.playerId,
    (id) => room.state.playerList[id]?.username ?? m.liarsDice.somebody,
    m,
  );

/** The cups as the table draws them: seated players, in turn order. */
const seatsOf = (state: LiarsDiceRoomState, m: Messages): TableSeat[] =>
  state.cups.map((cup) => ({
    id: cup.playerId,
    name: state.playerList[cup.playerId]?.username ?? m.liarsDice.somebody,
    diceLeft: cup.diceLeft,
    dice: cup.dice,
    outInRound: cup.outInRound,
  }));

const diceOnTable = (state: LiarsDiceRoomState) =>
  state.cups.reduce((total, cup) => total + cup.diceLeft, 0);

function BetweenGames({ room }: { room: Room }) {
  const m = useMessages();
  const { state, startGame, starting } = room;
  const count = Object.keys(state.playerList).length;
  const summary = state.lastGame;

  if (summary && !summary.endedEarly) {
    return (
      <>
        <ResultsPanel
          summary={summary}
          detail={m.liarsDice.resultDetail(
            summary.rounds,
            summary.dicePerPlayer,
          )}
          onPlayAgain={startGame}
          starting={starting}
          ranked
          statusOf={(standing, place) =>
            place === 1
              ? m.room.winner
              : standing.outInRound === null
                ? m.liarsDice.leftGame
                : m.liarsDice.outRound(standing.outInRound)
          }
        />
        {/* LD12: the last call stays open under the results. */}
        {state.reveal && (
          <Table
            seats={seatsOf(state, m)}
            youId={room.playerId}
            // The last game's, as the next game's may have been changed.
            dicePerPlayer={summary.dicePerPlayer}
            turnId={null}
            nextId={null}
            bids={[]}
            reveal={state.reveal}
            who={whoIn(room, m)}
            countLabel={m.liarsDice.lastCall}
            inPlay={false}
          />
        )}
      </>
    );
  }
  if (summary?.endedEarly && count < 2) return <EndedEarlyPanel />;
  return (
    <WaitingPanel
      aloneTitle={m.liarsDice.alone}
      setup={m.liarsDice.setup(count, state.dicePerPlayer)}
      guestSetup={m.liarsDice.guestSetup(count, state.dicePerPlayer)}
      onStart={startGame}
      starting={starting}
    />
  );
}

/** LD08-LD11: whose turn it is, and the table. */
function Turn({ room }: { room: Room }) {
  const m = useMessages();
  const { state, receivedAt, reconnecting, playerId } = room;
  const seconds = useSecondsLeft(state.phaseEndsInMs, receivedAt, reconnecting);
  const mine = bidding(room);
  const out =
    !room.spectating && (state.playerList[playerId]?.points ?? 0) === 0;
  return (
    <>
      <TurnBar {...turnBar(room, seconds, m)} hintRowBelow={HINT_ROW_BELOW} />
      <Table
        seats={seatsOf(state, m)}
        round={state.round}
        youId={playerId}
        dicePerPlayer={state.dicePerPlayer}
        turnId={state.turnPlayerId}
        nextId={state.nextPlayerId}
        bids={state.bids}
        reveal={state.phase === 'reveal' ? state.reveal : null}
        who={whoIn(room, m)}
        beside={
          mine ? (
            <YourMove room={room} />
          ) : out ? (
            <p className={styles.note}>{m.liarsDice.outNote}</p>
          ) : undefined
        }
      />
    </>
  );
}

/** LD09: the bid picker, opening on your strongest face. */
function YourMove({ room }: { room: Room }) {
  const m = useMessages();
  const { state, socket } = room;
  const latest = state.bids.at(-1) ?? null;
  const mine =
    state.cups.find((cup) => cup.playerId === room.playerId)?.dice ?? [];
  const picker = useBidChoice(latest, diceOnTable(state), mine, (bid) =>
    socket.emit('ld:bid', state.roomId, bid.count, bid.face),
  );
  const call = latest ? () => socket.emit('ld:call', state.roomId) : undefined;
  // Every die on the table bid as 6s leaves nothing to raise to.
  if (!picker) {
    return (
      <div className={styles.callOnly}>
        <Button variant="danger" onClick={call}>
          {m.liarsDice.callLiar}
        </Button>
      </div>
    );
  }
  return <BidPicker {...picker} onCall={call} />;
}

function turnBar(room: Room, seconds: number, m: Messages): TurnBarProps {
  const { state, playerId, reconnecting } = room;
  const who = whoIn(room, m);
  const clock = (label: string, waiting: boolean) =>
    reconnecting
      ? { seconds, label: m.liarsDice.paused, waiting: true }
      : { seconds, label, waiting };

  if (state.phase === 'reveal' && state.reveal) {
    return {
      ...revealBar(state.reveal, who, m),
      kind: 'status',
      countdown: clock(m.liarsDice.nextRound, true),
    };
  }
  const latest = state.bids.at(-1);
  const name = who(state.turnPlayerId ?? '').name;
  const bidMeta = latest ? bidLine(who(latest.playerId), latest, m) : undefined;
  if (state.turnPlayerId === playerId) {
    return {
      label: m.liarsDice.yourTurn,
      kind: 'status',
      main: latest ? m.liarsDice.raiseOrCall : m.liarsDice.openBidding,
      // What beats the bid in front of you, the raise rule in a line.
      meta: latest
        ? m.liarsDice.beat(latest)
        : m.liarsDice.onTable(diceOnTable(state)),
      countdown: clock(m.liarsDice.toBid, false),
    };
  }
  return {
    label: m.liarsDice.turn(name),
    kind: 'status',
    main: m.liarsDice.isDeciding(name),
    meta: bidMeta ?? m.liarsDice.openingRound,
    countdown: clock(m.liarsDice.toBid, true),
  };
}

/** One player's line on the scoreboard; their score is their dice left. */
function playerLine(
  state: LiarsDiceRoomState,
  seat: Seat,
  m: Messages,
): PlayerLine {
  if (!seat.isConnected) {
    return {
      seat,
      status: m.liarsDice.away,
      statusIcon: 'away',
      state: 'away',
    };
  }
  if (!state.isGameStarted) return { seat, status: m.liarsDice.waiting };
  const { reveal } = state;
  if (state.phase === 'reveal' && reveal) {
    if (seat.playerId === reveal.loserId) {
      return {
        seat,
        status: reveal.out ? m.liarsDice.out : m.liarsDice.lostDie,
      };
    }
    if (seat.playerId === reveal.bid.playerId) {
      return {
        seat,
        status: stood(reveal) ? m.liarsDice.bidStands : m.liarsDice.bidLie,
      };
    }
    if (seat.playerId === reveal.callerId) {
      return { seat, status: m.liarsDice.calledLiar };
    }
  }
  if (seat.points === 0) return { seat, status: m.liarsDice.out };
  if (state.phase === 'bidding') {
    if (seat.playerId === state.turnPlayerId) {
      return { seat, status: m.liarsDice.bidding, state: 'highlight' };
    }
    if (seat.playerId === state.nextPlayerId) {
      return { seat, status: m.liarsDice.upNext };
    }
    const own = state.bids.findLast((bid) => bid.playerId === seat.playerId);
    if (own) return { seat, status: m.liarsDice.bidLabel(own) };
  }
  return { seat, status: m.liarsDice.waiting };
}
