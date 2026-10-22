import type { PairsCardView, PairsRoomState } from '../../../shared/wire-types';
import { PAIRS_BOARDS } from '../../../shared/pairs';
import { TurnBar, type PairsCardState, type TurnBarProps } from '../ui';
import { useMessages, type Messages } from '../i18n';
import { useSecondsLeft } from '../net/use-seconds-left';
import { EndedEarlyPanel, ResultsPanel, WaitingPanel } from '../room/panels';
import { rankedPlayers, type Seat } from '../room/players';
import { useRoomContext, type Room as RoomOf } from '../room/room-context';
import { RoomLayout, type PlayerLine } from '../room/room-layout';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import { BoardPanel, PairsGrid } from './board';

/**
 * The turn bar width under which its hints take a line of their own: the
 * widest of them, whose turn is next, by name, beside a miss, with
 * 18-character names and its clock, in either language, needs this much
 * beside its main line, with 4 px to spare for a clock's digits and subpixel
 * text (TurnBar's hintRowBelow).
 */
const HINT_ROW_BELOW = 679;

type Room = RoomOf<PairsRoomState>;

/** PR05-PR07, PR10: a Pairs room, before, during and after a game. */
export function PairsRoom() {
  const m = useMessages();
  const room = useRoomContext<PairsRoomState>();
  const { state } = room;
  const players = rankedPlayers(state);
  const inGame = state.isGameStarted;
  const ended = !inGame ? state.lastGame : null;
  return (
    <RoomLayout
      yourTurn={inGame && flipping(room)}
      phase={
        inGame
          ? {
              tone: 'blue',
              label: m.pairs.progress(
                state.pairsFound,
                PAIRS_BOARDS[state.board].pairs,
              ),
            }
          : ended && !ended.endedEarly
            ? { tone: 'lime', label: m.pairs.gameOver }
            : ended && players.length < 2
              ? { tone: 'peach', label: m.pairs.gameEnded }
              : { tone: 'blue', label: m.pairs.waitingRoom }
      }
      stage={inGame ? <Turn room={room} /> : <BetweenGames room={room} />}
      players={players.map((seat) => playerLine(state, seat, m))}
      chat={{ placeholder: m.pairs.messagePlaceholder }}
    />
  );
}

/** Whether it is this player's turn to flip, and the cards take it. */
const flipping = ({ state, playerId, reconnecting }: Room) =>
  state.phase === 'flipping' &&
  state.turnPlayerId === playerId &&
  !reconnecting;

const cardsOf = (cards: readonly PairsCardView[]): PairsCardState[] =>
  cards.map((card) =>
    card.symbol === null || card.state === 'down'
      ? { kind: 'down' }
      : { kind: card.state, symbol: card.symbol },
  );

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
          detail={m.pairs.resultsDetail(summary.board, summary.pairs)}
          onPlayAgain={startGame}
          starting={starting}
        />
        {/* PR07: the finished board stays on the table. */}
        <BoardPanel>
          <PairsGrid cards={cardsOf(state.cards)} inPlay={false} />
        </BoardPanel>
      </>
    );
  }
  if (summary?.endedEarly && count < 2) return <EndedEarlyPanel />;
  return (
    <WaitingPanel
      aloneTitle={m.pairs.aloneTitle}
      setup={m.pairs.setup(count, m.pairs.boardName(state.board))}
      guestSetup={m.pairs.guestSetup(count, m.pairs.boardName(state.board))}
      onStart={startGame}
      starting={starting}
    />
  );
}

/** PR05, PR06, PR10: whose turn it is, and the board. */
function Turn({ room }: { room: Room }) {
  const m = useMessages();
  const { state, receivedAt, reconnecting, socket } = room;
  const seconds = useSecondsLeft(state.phaseEndsInMs, receivedAt, reconnecting);
  const phone = useMediaQuery(PHONE);
  return (
    <>
      <TurnBar
        {...turnBar(room, seconds, phone, m)}
        hintRowBelow={HINT_ROW_BELOW}
      />
      <BoardPanel>
        <PairsGrid
          cards={cardsOf(state.cards)}
          onFlip={
            flipping(room)
              ? (index) => socket.emit('pairs:flip', state.roomId, index)
              : undefined
          }
        />
      </BoardPanel>
    </>
  );
}

function turnBar(
  room: Room,
  seconds: number,
  phone: boolean,
  m: Messages,
): TurnBarProps {
  const { state, playerId, reconnecting } = room;
  const mine = state.turnPlayerId === playerId;
  const clock = (label: string, waiting: boolean) =>
    reconnecting
      ? { seconds, label: m.pairs.paused, waiting: true }
      : { seconds, label, waiting };
  const nameOf = (id: string | null) =>
    id === null ? null : (state.playerList[id]?.username ?? null);
  const label = mine
    ? m.pairs.yourTurn
    : m.pairs.playerTurn(nameOf(state.turnPlayerId));
  const next = nameOf(state.nextPlayerId);
  const whoIsNext =
    state.nextPlayerId === playerId
      ? m.pairs.youreNext
      : next
        ? m.pairs.nextPlayer(next)
        : '';

  if (state.phase === 'showing') {
    return {
      label,
      kind: 'status',
      main: m.pairs.notPair,
      meta: m.pairs.bothFlipBack(whoIsNext),
      countdown: clock(m.pairs.flipBack, true),
    };
  }
  // Whose turn just ran out of time, said until the next card is turned.
  const timedOut = state.timedOut;
  const late = timedOut === playerId ? null : nameOf(timedOut);
  if (mine) {
    const oneUp = state.cards.some((card) => card.state === 'up');
    return {
      label,
      kind: 'status',
      main: oneUp ? m.pairs.flipSecond : m.pairs.flipCard,
      meta: late
        ? m.pairs.ranOutYourTurn(late)
        : phone
          ? m.pairs.pairKeepsTurn
          : m.pairs.goAgain,
      countdown: clock(m.pairs.toFlip, false),
    };
  }
  if (timedOut === playerId) {
    return {
      label,
      kind: 'status',
      main: m.pairs.yourTurnPassed,
      meta: whoIsNext || undefined,
      countdown: clock(m.pairs.toFlip, true),
    };
  }
  return {
    label,
    kind: 'status',
    main: m.pairs.watchClosely,
    meta: late ? m.pairs.ranOut(late) : whoIsNext || undefined,
    countdown: clock(m.pairs.toFlip, true),
  };
}

/** One player's line on the scoreboard. */
function playerLine(
  state: PairsRoomState,
  seat: Seat,
  m: Messages,
): PlayerLine {
  if (!seat.isConnected) {
    return { seat, status: m.pairs.away, statusIcon: 'away', state: 'away' };
  }
  if (!state.isGameStarted) return { seat, status: m.pairs.waiting };
  if (seat.playerId === state.turnPlayerId) {
    return { seat, status: m.pairs.flipping, state: 'highlight' };
  }
  if (seat.playerId === state.nextPlayerId)
    return { seat, status: m.pairs.upNext };
  return { seat, status: m.pairs.waiting };
}
