import type {
  MinesweeperPickResult,
  MinesweeperRoomState,
} from '../../../shared/wire-types';
import { PickResult, TurnBar, type TurnBarProps } from '../ui';
import { useMessages, type Messages } from '../i18n';
import { useSecondsLeft } from '../net/use-seconds-left';
import { initialsOf, toneOf } from '../players/avatar';
import { EndedEarlyPanel, ResultsPanel, WaitingPanel } from '../room/panels';
import { rankedPlayers, type Seat } from '../room/players';
import { useRoomContext, type Room as RoomOf } from '../room/room-context';
import { RoomLayout, type PlayerLine } from '../room/room-layout';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import { HIDDEN } from '../../../shared/minesweeper';
import { playColumn } from '../shell/play-board';
import { cx } from '../ui/cx';
import { Board } from './board';
import styles from './room.module.css';

/**
 * The turn bar width under which its hints take a line of their own: the
 * widest of them, a mine's risk beside what it cost, with its clock, in
 * either language, needs this much beside its main line, with 4 px to spare
 * for a clock's digits and subpixel text (TurnBar's hintRowBelow).
 */
const HINT_ROW_BELOW = 739;

type Room = RoomOf<MinesweeperRoomState>;

/** M01-M16: a Minesweeper room, before, during and after a game. */
export function MinesweeperRoom() {
  const m = useMessages();
  const room = useRoomContext<MinesweeperRoomState>();
  const { state } = room;
  const players = rankedPlayers(state);
  const inGame = state.isGameStarted;
  const ended = !inGame ? state.lastGame : null;
  return (
    <RoomLayout
      phase={
        inGame
          ? { tone: 'blue', label: m.minesweeper.round(state.round) }
          : ended && !ended.endedEarly
            ? { tone: 'lime', label: m.minesweeper.gameOver }
            : ended && players.length < 2
              ? { tone: 'peach', label: m.minesweeper.gameEnded }
              : { tone: 'blue', label: m.minesweeper.waitingRoom }
      }
      stage={inGame ? <Round room={room} /> : <BetweenGames room={room} />}
      players={players.map((seat) => playerLine(state, seat, m))}
      chat={{ placeholder: m.minesweeper.messagePlaceholder }}
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
          detail={m.minesweeper.resultsDetail(
            summary.difficulty,
            summary.rounds,
          )}
          onPlayAgain={startGame}
          starting={starting}
        />
        <Minefield room={room} showPicks={false} />
      </>
    );
  }
  if (summary?.endedEarly && count < 2) return <EndedEarlyPanel />;
  return (
    <WaitingPanel
      aloneTitle={m.minesweeper.aloneTitle}
      setup={m.minesweeper.setup(count, state.difficulty)}
      guestSetup={m.minesweeper.guestSetup(count, state.difficulty)}
      onStart={startGame}
      starting={starting}
    />
  );
}

/** M04-M13: one round: the turn bar, then the board and the last results. */
function Round({ room }: { room: Room }) {
  const m = useMessages();
  const { state, receivedAt, reconnecting, socket } = room;
  const seconds = useSecondsLeft(state.phaseEndsInMs, receivedAt, reconnecting);
  const canPick =
    state.phase === 'picking' &&
    state.myPick === null &&
    !reconnecting &&
    !room.spectating;
  const phone = useMediaQuery(PHONE);

  return (
    <>
      <TurnBar
        {...turnBar(room, seconds, phone, m)}
        hintRowBelow={HINT_ROW_BELOW}
      />
      <Minefield
        room={room}
        showPicks={state.phase === 'reveal'}
        onPick={
          canPick
            ? (index) => socket.emit('ms:pick', state.roomId, index)
            : undefined
        }
      />
    </>
  );
}

/**
 * The board, with the latest round's results under it. A phone shows them
 * only while the round is revealed (MO13), so the next pick (MO11, MO12)
 * keeps the board alone on screen. A finished game's standings already
 * count its last round, so the board stands alone under them.
 */
function Minefield({
  room,
  showPicks,
  onPick,
}: {
  room: Room;
  showPicks: boolean;
  onPick?: (index: number) => void;
}) {
  const m = useMessages();
  const { state } = room;
  const phone = useMediaQuery(PHONE);
  // A game played to its end has standings that count its last round. Only
  // that game drops the round, not one cut short, which has no standings.
  const finished =
    !state.isGameStarted &&
    state.lastGame !== null &&
    !state.lastGame.endedEarly;
  const results =
    finished || (phone && state.isGameStarted && state.phase === 'picking')
      ? []
      : state.lastRound.toSorted((a, b) => b.points - a.points);
  // The round the results belong to: the one being revealed, the one before
  // the open one, or the last round of a game cut short.
  const resultsRound = !state.isGameStarted
    ? (state.lastGame?.rounds ?? state.round)
    : state.phase === 'reveal'
      ? state.round
      : state.round - 1;

  return (
    <div className={cx(styles.minefield, playColumn)}>
      <div className={cx(styles.boardPanel, playColumn)}>
        <Board
          state={state}
          onPick={onPick}
          showPicks={showPicks}
          inPlay={state.isGameStarted}
        />
      </div>
      {results.length > 0 && (
        <section className={styles.results} aria-labelledby="round-results">
          <h2 id="round-results" className={styles.resultsTitle}>
            {m.minesweeper.roundResults(resultsRound)}
          </h2>
          <ul className={styles.resultList}>
            {results.map((pick) => (
              <PickResult
                key={pick.playerId}
                name={pick.username}
                initials={initialsOf(pick.username)}
                tone={toneOf(pick.username)}
                outcome={outcomeOf(pick)}
                detail={m.minesweeper.pickDetail(pick.risk, pick.sharedWith)}
                points={pick.points}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function outcomeOf(pick: MinesweeperPickResult) {
  if (pick.hitMine) return 'mine' as const;
  return pick.autoPlayed ? ('auto' as const) : ('safe' as const);
}

/** "Ryan", "Ryan and Maya", "Ryan, Leo and Maya". */
function turnBar(
  room: Room,
  seconds: number,
  phone: boolean,
  m: Messages,
): TurnBarProps {
  const { state, playerId, reconnecting } = room;
  // A phone's one row has no room for the board's tag beside the round and
  // the mines: the board is in view under it, and the room said its size.
  const category = phone
    ? undefined
    : m.minesweeper.boardLabel(state.difficulty);
  const clock = (label: string, waiting = false) =>
    reconnecting
      ? { seconds, label: m.minesweeper.paused, waiting: true }
      : { seconds, label, waiting };

  if (state.phase === 'reveal') {
    const mine = state.lastRound.find((pick) => pick.playerId === playerId);
    const base = {
      category,
      label: m.minesweeper.roundResults(state.round),
      kind: 'status' as const,
      // The last round leads to the final scores, not another round.
      countdown: clock(
        state.board.includes(HIDDEN)
          ? m.minesweeper.nextRound
          : m.minesweeper.finalScores,
        true,
      ),
    };
    if (!mine) return { ...base, main: m.minesweeper.roundOver };
    if (mine.autoPlayed) {
      return {
        ...base,
        main: m.minesweeper.timeRanOut,
        meta: m.minesweeper.autoPickDetail(mine.risk, mine.points),
      };
    }
    if (mine.hitMine) {
      return {
        ...base,
        main: m.minesweeper.minePoints(mine.points),
        // MO13: a phone shows the risk alone.
        meta: m.minesweeper.cellRisk(mine.risk, !phone),
      };
    }
    const sharers = state.lastRound
      .filter((pick) => pick.index === mine.index && pick.playerId !== playerId)
      .map((pick) => pick.username);
    return {
      ...base,
      main: m.minesweeper.safePoints(mine.points),
      meta: sharers.length
        ? m.minesweeper.splitCount(sharers.length)
        : m.minesweeper.cellRisk(mine.risk),
    };
  }

  const label = m.minesweeper.round(state.round);
  const connected = Object.entries(state.playerList).filter(
    ([, player]) => player.isConnected,
  );
  const everyoneIn = connected.every(([id]) => state.lockedIn.includes(id));

  if (everyoneIn) {
    return {
      category,
      label,
      kind: 'status',
      main: m.minesweeper.everyoneLocked,
      meta: m.minesweeper.revealingPicks,
    };
  }
  // The scoreboard names who is still picking and who is in; the bar's meta
  // says only as much as fits a phone's one line.
  if (state.myPick !== null || room.spectating) {
    return {
      category,
      label,
      kind: 'status',
      main: room.spectating
        ? m.minesweeper.everyonePicking
        : m.minesweeper.lockedIn,
      meta: m.minesweeper.waitingOthers,
      countdown: clock(m.minesweeper.toPick, room.spectating),
    };
  }
  // How many are in already, so the race is seen while picking.
  const lockedIn = state.lockedIn.filter((id) => state.playerList[id]).length;
  return {
    category,
    label,
    kind: 'status',
    main: m.minesweeper.pickCell,
    meta:
      lockedIn > 0
        ? m.minesweeper.othersLockedIn(lockedIn)
        : phone
          ? m.minesweeper.minesShort(state.totalMines, state.minesFound)
          : state.minesFound > 0
            ? m.minesweeper.minesFound(state.totalMines, state.minesFound)
            : m.minesweeper.pickLocks(state.totalMines),
    countdown: clock(m.minesweeper.toPick),
  };
}

/** One player's line on the scoreboard. */
function playerLine(
  state: MinesweeperRoomState,
  seat: Seat,
  m: Messages,
): PlayerLine {
  if (!seat.isConnected) {
    return {
      seat,
      status: m.minesweeper.away,
      statusIcon: 'away',
      state: 'away',
    };
  }
  if (!state.isGameStarted) return { seat, status: m.minesweeper.waiting };
  if (state.phase === 'reveal') {
    const pick = state.lastRound.find((p) => p.playerId === seat.playerId);
    if (!pick) return { seat, status: m.minesweeper.waiting };
    if (pick.hitMine) {
      return {
        seat,
        status: m.minesweeper.hitMinePoints(pick.points),
        statusIcon: 'mine',
      };
    }
    if (pick.autoPlayed) {
      return {
        seat,
        status: m.minesweeper.autoPickedPoints(pick.points),
        statusIcon: 'clock',
      };
    }
    return {
      seat,
      status: m.minesweeper.safeStatusPoints(pick.points),
      statusIcon: 'check',
      state: 'scored',
    };
  }
  return state.lockedIn.includes(seat.playerId)
    ? { seat, status: m.minesweeper.lockedIn, statusIcon: 'lock' }
    : { seat, status: m.minesweeper.picking };
}
