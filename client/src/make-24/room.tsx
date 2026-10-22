import { useState } from 'react';
import type {
  Make24HandResult,
  Make24RoomState,
} from '../../../shared/wire-types';
import {
  formatFraction,
  isTarget,
  lastCard,
  type Step,
} from '../../../shared/make-24';
import { PickResult, TurnBar, type TurnBarProps } from '../ui';
import { useMessages, type Messages } from '../i18n';
import { useSecondsLeft } from '../net/use-seconds-left';
import { initialsOf, toneOf } from '../players/avatar';
import { EndedEarlyPanel, ResultsPanel, WaitingPanel } from '../room/panels';
import { rankedPlayers, type Seat } from '../room/players';
import { useRoomContext, type Room as RoomOf } from '../room/room-context';
import { RoomLayout, type PlayerLine } from '../room/room-layout';
import {
  cardsAfter,
  DealtCards,
  FinalCard,
  HandTable,
  TablePanel,
} from './table';
import styles from './room.module.css';

/**
 * The turn bar width under which its hints take a line of their own: the
 * widest of them, how much time a solve had left, beside its points, with
 * 18-character names and its clock, in either language, needs this much
 * beside its main line, with 4 px to spare for a clock's digits and subpixel
 * text (TurnBar's hintRowBelow).
 */
const HINT_ROW_BELOW = 569;

type Room = RoomOf<Make24RoomState>;

/** T06-T09, T12: a Make 24 room, before, during and after a game. */
export function Make24Room() {
  const m = useMessages();
  const room = useRoomContext<Make24RoomState>();
  const { state } = room;
  const players = rankedPlayers(state);
  const inGame = state.isGameStarted;
  const ended = !inGame ? state.lastGame : null;
  const solvedOpenHand = state.phase === 'solving' && state.mySolve !== null;
  return (
    <RoomLayout
      phase={
        inGame
          ? { tone: 'blue', label: m.make24.hand(state.hand, state.hands) }
          : ended && !ended.endedEarly
            ? { tone: 'lime', label: m.make24.gameOver }
            : ended && players.length < 2
              ? { tone: 'peach', label: m.make24.gameEnded }
              : { tone: 'blue', label: m.make24.waitingRoom }
      }
      stage={
        inGame ? (
          // Each hand starts with nothing picked and no steps taken.
          <Hand key={state.hand} room={room} />
        ) : (
          <BetweenGames room={room} />
        )
      }
      players={players.map((seat) => playerLine(state, seat, m))}
      chat={{
        placeholder: m.make24.messagePlaceholder,
        lockedReason: solvedOpenHand
          ? m.make24.solvedChat
          : room.spectating && state.phase === 'solving'
            ? m.make24.spectatorChatLocked
            : undefined,
      }}
    />
  );
}

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
          detail={m.make24.resultsDetail(summary.hands)}
          onPlayAgain={startGame}
          starting={starting}
        />
        {/* The standings count the last hand: its cards stand alone. */}
        {state.lastDeal.length > 0 && (
          <TablePanel>
            <DealtCards deal={state.lastDeal} />
          </TablePanel>
        )}
      </>
    );
  }
  if (summary?.endedEarly && count < 2) return <EndedEarlyPanel />;
  return (
    <WaitingPanel
      aloneTitle={m.make24.aloneTitle}
      setup={m.make24.setup(count, state.hands)}
      guestSetup={m.make24.guestSetup(count, state.hands)}
      onStart={startGame}
      starting={starting}
    />
  );
}

/** T06-T08, T12: one hand: the turn bar, then the table or its results. */
function Hand({ room }: { room: Room }) {
  const m = useMessages();
  const { state, receivedAt, reconnecting, socket } = room;
  const seconds = useSecondsLeft(state.phaseEndsInMs, receivedAt, reconnecting);
  const [steps, setSteps] = useState<readonly Step[]>([]);
  const cards = cardsAfter(state.deal, steps);
  const last = lastCard(cards);
  const madeIt = last !== null && isTarget(last.value);

  const step = (next: Step) => {
    const taken = [...steps, next];
    setSteps(taken);
    const after = lastCard(cardsAfter(state.deal, taken));
    // The server replays the steps and says whether they count.
    if (after && isTarget(after.value)) {
      socket.emit('t24:solve', state.roomId, taken);
    }
  };

  if (state.phase === 'reveal') {
    return (
      <>
        <TurnBar
          {...turnBar(room, seconds, cards, m)}
          hintRowBelow={HINT_ROW_BELOW}
        />
        <HandResults state={state} />
      </>
    );
  }

  const donePrompt = m.make24.donePrompt;
  if (room.spectating) {
    return (
      <>
        <TurnBar
          {...turnBar(room, seconds, cards, m)}
          hintRowBelow={HINT_ROW_BELOW}
        />
        <TablePanel>
          <DealtCards deal={state.deal} />
        </TablePanel>
      </>
    );
  }
  return (
    <>
      <TurnBar
        {...turnBar(room, seconds, cards, m)}
        hintRowBelow={HINT_ROW_BELOW}
      />
      <TablePanel>
        {state.mySolve && !madeIt ? (
          // A refresh keeps the solve but not the steps that made it.
          <FinalCard
            value="24"
            formula={state.mySolve.expression}
            state="solved"
            prompt={donePrompt}
          />
        ) : (
          <HandTable
            deal={state.deal}
            steps={steps}
            onStep={step}
            onUndo={() => setSteps(steps.slice(0, -1))}
            onStartOver={() => setSteps([])}
            paused={reconnecting}
            done={madeIt ? donePrompt : undefined}
          />
        )}
      </TablePanel>
    </>
  );
}

/** T08: a revealed hand's cards, and how everybody did. */
function HandResults({ state }: { state: Make24RoomState }) {
  const m = useMessages();
  const deal = state.lastDeal;
  const hand = state.hand;
  if (deal.length === 0) return null;
  return (
    <TablePanel>
      <DealtCards deal={deal} />
      <section className={styles.results} aria-labelledby="hand-results">
        <h2 id="hand-results" className={styles.resultsTitle}>
          {m.make24.handResults(hand)}
        </h2>
        <ul className={styles.resultList}>
          {state.lastHand.map((result) => (
            <PickResult
              key={result.playerId}
              name={result.username}
              initials={initialsOf(result.username)}
              tone={toneOf(result.username)}
              outcome={result.solved ? 'safe' : 'auto'}
              label={result.solved ? m.make24.solved : m.make24.outOfTime}
              detail={resultDetail(result, m)}
              points={result.points}
            />
          ))}
        </ul>
      </section>
    </TablePanel>
  );
}

/** "(8 − 6) × 3 × 4 · 46 s left", or "No answer". */
function resultDetail(result: Make24HandResult, m: Messages): string {
  return result.solved
    ? m.make24.resultDetail(result.expression, result.secondsLeft)
    : m.make24.noAnswer;
}

function turnBar(
  room: Room,
  seconds: number,
  cards: ReturnType<typeof cardsAfter>,
  m: Messages,
): TurnBarProps {
  const { state, playerId, reconnecting } = room;
  const clock = (label: string, waiting = false) =>
    reconnecting
      ? { seconds, label: m.make24.paused, waiting: true }
      : { seconds, label, waiting };
  const label = m.make24.hand(state.hand, state.hands);

  if (state.phase === 'reveal') {
    const mine = state.lastHand.find((result) => result.playerId === playerId);
    const base = {
      label: m.make24.handResultsLabel(state.hand, state.hands),
      kind: 'status' as const,
      countdown: clock(
        state.hand < state.hands ? m.make24.nextHand : m.make24.finalScores,
        true,
      ),
    };
    if (mine?.solved) {
      return {
        ...base,
        main: m.make24.pointsForYou(mine.points),
        meta: m.make24.solvedWithTime(mine.secondsLeft),
      };
    }
    return {
      ...base,
      main: room.spectating ? m.make24.handOver : m.make24.outOfTime,
      meta: state.lastSolution
        ? m.make24.oneWay(state.lastSolution)
        : m.make24.nextHandSoon,
    };
  }

  if (state.mySolve) {
    const waitingFor = Object.entries(state.playerList)
      .filter(
        ([id, player]) =>
          player.isConnected &&
          id !== playerId &&
          !state.solved.some((solve) => solve.playerId === id),
      )
      .map(([, player]) => player.username);
    return {
      label,
      kind: 'status',
      main: m.make24.solvedPoints(state.mySolve.points),
      meta: waitingFor.length
        ? m.make24.waitingCount(waitingFor.length)
        : m.make24.everyoneSolved,
      countdown: clock(m.make24.toSolve),
    };
  }
  const solvers = state.solved.map((solve) => solve.username);
  const last = lastCard(cards);
  if (last && !isTarget(last.value)) {
    return {
      label,
      kind: 'status',
      main: m.make24.makes(formatFraction(last.value)),
      // Who has solved it stays in view: the race goes on while you undo.
      meta: solvers.length
        ? m.make24.solvedCountUndo(solvers.length)
        : m.make24.undoPrompt,
      countdown: clock(m.make24.toSolve),
    };
  }
  return {
    label,
    kind: 'status',
    main: m.games.of['make-24'].name,
    meta: solvers.length
      ? m.make24.solvedCount(solvers.length)
      : m.make24.useEachNumber,
    countdown: clock(m.make24.toSolve, room.spectating),
  };
}

/** One player's line on the scoreboard. */
function playerLine(
  state: Make24RoomState,
  seat: Seat,
  m: Messages,
): PlayerLine {
  if (!seat.isConnected) {
    return { seat, status: m.make24.away, statusIcon: 'away', state: 'away' };
  }
  if (!state.isGameStarted) return { seat, status: m.make24.waiting };
  if (state.phase === 'reveal') {
    const result = state.lastHand.find((r) => r.playerId === seat.playerId);
    if (!result) return { seat, status: m.make24.waiting };
    return result.solved
      ? {
          seat,
          status: m.make24.solvedStatusPoints(result.points),
          statusIcon: 'check',
        }
      : { seat, status: m.make24.outOfTime, statusIcon: 'clock' };
  }
  const solve = state.solved.find((s) => s.playerId === seat.playerId);
  return solve
    ? {
        seat,
        status: m.make24.solvedStatusPoints(solve.points),
        statusIcon: 'check',
        state: 'scored',
      }
    : { seat, status: m.make24.solving };
}
