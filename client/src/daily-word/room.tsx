import { useState } from 'react';
import type {
  DailyWordBoard,
  DailyWordRoomState,
} from '../../../shared/wire-types';
import { checkGuess, type GuessProblem } from '../../../shared/daily-word';
import { RaceBoard, TurnBar, type TurnBarProps } from '../ui';
import { useMessages, type Messages } from '../i18n';
import { REQUEST_TIMEOUT_MS } from '../net/socket';
import { useSecondsLeft } from '../net/use-seconds-left';
import { EndedEarlyPanel, ResultsPanel, WaitingPanel } from '../room/panels';
import { listNames, rankedPlayers, type Seat } from '../room/players';
import { useRoomContext, type Room as RoomOf } from '../room/room-context';
import { RoomLayout, type PlayerLine } from '../room/room-layout';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import { BoardPanel } from './panel';
import { PlayArea } from './play';
import styles from './room.module.css';

type Room = RoomOf<DailyWordRoomState>;

/**
 * The row being typed and what was wrong with it, for one word. It lives above
 * the board, which a phone unmounts on the Players and Chat tabs.
 */
interface Draft {
  round: number;
  typed: string;
  problem: GuessProblem | 'network' | null;
}

/** DW07-DW10, DW13, DW14: a Daily Word room, before, during and after a game. */
export function DailyWordRoom() {
  const m = useMessages();
  const room = useRoomContext<DailyWordRoomState>();
  const { state, playerId } = room;
  const phone = useMediaQuery(PHONE);
  const players = rankedPlayers(state);
  const inGame = state.isGameStarted;
  const ended = !inGame ? state.lastGame : null;
  const mine = state.boards.find((board) => board.playerId === playerId);
  const guessing = state.phase === 'guessing';
  const [draft, setDraft] = useState<Draft>({
    round: 0,
    typed: '',
    problem: null,
  });
  return (
    <RoomLayout
      phase={
        inGame
          ? {
              tone: 'blue',
              label: m.dailyWord.wordOf(state.round, state.rounds),
            }
          : ended && !ended.endedEarly
            ? { tone: 'lime', label: m.dailyWord.gameOver }
            : ended && players.length < 2
              ? { tone: 'peach', label: m.dailyWord.gameEnded }
              : { tone: 'blue', label: m.dailyWord.waitingRoom }
      }
      stage={
        inGame ? (
          <Round
            key={state.round}
            room={room}
            // Each word starts with nothing typed.
            draft={
              draft.round === state.round
                ? draft
                : { round: state.round, typed: '', problem: null }
            }
            onDraft={setDraft}
          />
        ) : (
          <BetweenGames room={room} />
        )
      }
      players={players.map((seat) => playerLine(state, seat, m))}
      chat={{
        placeholder: m.dailyWord.chatPlaceholder,
        lockedReason:
          guessing && mine?.status === 'found'
            ? m.dailyWord.foundChat
            : undefined,
      }}
      playersAside={
        phone && guessing && !room.spectating ? (
          <Others room={room} />
        ) : undefined
      }
    />
  );
}

export default DailyWordRoom;

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
          detail={m.dailyWord.wordsDetail(summary.rounds)}
          standingDetail={(id) =>
            m.dailyWord.wordsFound(summary.found[id] ?? 0)
          }
          onPlayAgain={startGame}
          starting={starting}
        />
        <RoundResults state={state} />
      </>
    );
  }
  if (summary?.endedEarly && count < 2) return <EndedEarlyPanel />;
  return (
    <WaitingPanel
      aloneTitle={m.dailyWord.alone}
      setup={m.dailyWord.setup(count, state.rounds)}
      guestSetup={m.dailyWord.guestSetup(count, state.rounds)}
      onStart={startGame}
      starting={starting}
    />
  );
}

/** DW07-DW09, DW13: one word: the turn bar, then your board or the reveal. */
function Round({
  room,
  draft,
  onDraft,
}: {
  room: Room;
  draft: Draft;
  onDraft: (draft: Draft) => void;
}) {
  const m = useMessages();
  const { state, receivedAt, reconnecting, socket, playerId } = room;
  const seconds = useSecondsLeft(state.phaseEndsInMs, receivedAt, reconnecting);
  const phone = useMediaQuery(PHONE);
  const { typed, problem } = draft;
  const setProblem = (next: GuessProblem | 'network') =>
    onDraft({ round: state.round, typed, problem: next });
  const [sending, setSending] = useState(false);
  const mine = state.boards.find((board) => board.playerId === playerId);

  // A spectator has no board of their own: everybody's is theirs to watch.
  if (state.phase === 'guessing' && room.spectating) {
    return (
      <>
        <TurnBar {...turnBar(room, seconds, mine, m)} />
        <BoardPanel>
          <Others room={room} />
        </BoardPanel>
      </>
    );
  }
  if (state.phase === 'reveal' || !mine) {
    return (
      <>
        <TurnBar {...turnBar(room, seconds, mine, m)} />
        <RoundResults state={state} />
      </>
    );
  }

  const rows = mine.rows.map((row) => ({
    word: row.word ?? '',
    marks: row.marks,
  }));
  const done = mine.status !== 'guessing';
  const change = (next: string) =>
    onDraft({ round: state.round, typed: next, problem: null });
  const typing = {
    onLetter: (letter: string) => {
      if (typed.length < 5) change(typed + letter);
    },
    onDelete: () => change(typed.slice(0, -1)),
    onEnter: async () => {
      if (sending) return;
      // The lists are here too, so most refusals need no round trip; the
      // server checks again and marks the guess.
      const local = checkGuess(
        typed,
        rows.map((row) => row.word),
      );
      if (local) {
        setProblem(local);
        return;
      }
      setSending(true);
      try {
        const answer = await socket
          .timeout(REQUEST_TIMEOUT_MS)
          .emitWithAck('dw:guess', state.roomId, typed);
        if (answer.ok) change('');
        else {
          const rejected = checkGuess(
            typed,
            rows.map((row) => row.word),
          );
          setProblem(rejected ?? 'network');
        }
      } catch {
        setProblem('network');
      }
      setSending(false);
    },
  };

  return (
    <>
      <TurnBar {...turnBar(room, seconds, mine, m)} />
      <BoardPanel>
        <div className={styles.table}>
          <PlayArea
            rows={rows}
            typed={done ? '' : typed}
            problem={
              done
                ? null
                : problem === 'network'
                  ? m.dailyWord.guessFailed
                  : problem
                    ? m.dailyWord.problem(problem)
                    : null
            }
            prompt={
              done
                ? mine.status === 'found'
                  ? m.dailyWord.foundWatch
                  : m.dailyWord.outWatch
                : undefined
            }
            typing={typing}
            keyboard={!done}
            disabled={reconnecting || sending}
            className={styles.mine}
          />
          {!phone && <Others room={room} />}
        </div>
      </BoardPanel>
    </>
  );
}

/** DW07, DW08, DW14: everybody else's board, marks only. */
function Others({ room }: { room: Room }) {
  const m = useMessages();
  const { state, playerId, spectating } = room;
  const others = state.boards.filter((board) => board.playerId !== playerId);
  if (others.length === 0) return null;
  return (
    <section className={styles.others} aria-labelledby="the-others">
      <div className={styles.heading}>
        <h2 id="the-others" className={styles.title}>
          {spectating ? m.dailyWord.everyone : m.dailyWord.others}
        </h2>
        <p className={styles.note}>{m.dailyWord.marksOnly}</p>
      </div>
      <div className={styles.boards}>
        {others.map((board) => (
          <RaceBoard
            key={board.playerId}
            name={board.username}
            status={raceStatus(board, m)}
            state={board.status}
            rows={board.rows}
          />
        ))}
      </div>
    </section>
  );
}

const raceStatus = (board: DailyWordBoard, m: Messages): string =>
  board.status === 'found'
    ? m.dailyWord.foundPoints(board.points)
    : board.status === 'out'
      ? m.dailyWord.outOfGuesses
      : board.rows.length === 0
        ? m.dailyWord.noGuesses
        : m.dailyWord.guessesCount(board.rows.length);

/**
 * DW09, DW10: a finished word's boards, with their letters, best first. On a
 * phone (DW15, DW16) they stand in a column, each a Row board, since two
 * Small boards do not fit across.
 */
function RoundResults({ state }: { state: DailyWordRoomState }) {
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  const result = state.lastRound;
  if (!result) return null;
  const round = state.isGameStarted
    ? state.round
    : (state.lastGame?.rounds ?? state.round);
  return (
    <BoardPanel>
      <section className={styles.results} aria-labelledby="word-results">
        <div className={styles.heading}>
          <h2 id="word-results" className={styles.title}>
            {m.dailyWord.wordResults(round)}
          </h2>
          {!state.isGameStarted && (
            <p className={styles.body}>
              {m.dailyWord.wordWas(result.word.toUpperCase())}
            </p>
          )}
        </div>
        <div className={styles.boards}>
          {result.boards.map((board) => (
            <RaceBoard
              key={board.playerId}
              name={board.username}
              status={
                board.status === 'found'
                  ? m.dailyWord.foundInPoints(board.rows.length, board.points)
                  : m.dailyWord.missed
              }
              state={board.status === 'found' ? 'found' : 'out'}
              board="small"
              layout={phone ? 'row' : 'column'}
              rows={board.rows}
            />
          ))}
        </div>
      </section>
    </BoardPanel>
  );
}

function turnBar(
  room: Room,
  seconds: number,
  mine: DailyWordBoard | undefined,
  m: Messages,
): TurnBarProps {
  const { state, playerId, reconnecting } = room;
  const clock = (label: string, waiting = false) =>
    reconnecting
      ? { seconds, label: m.dailyWord.paused, waiting: true }
      : { seconds, label, waiting };
  const label = m.dailyWord.wordOf(state.round, state.rounds);

  if (state.phase === 'reveal') {
    const result = state.lastRound;
    const me = result?.boards.find((board) => board.playerId === playerId);
    const finders = (result?.boards ?? [])
      .filter((board) => board.status === 'found')
      .map((board) => board.username);
    return {
      label: m.dailyWord.wordWasLabel,
      kind: 'status',
      main: result ? result.word.toUpperCase() : '',
      meta: room.spectating
        ? finders.length
          ? m.dailyWord.namesFound(listNames(finders, m))
          : m.dailyWord.nobodyFound
        : me?.status === 'found'
          ? m.dailyWord.youFound(me.rows.length, me.points)
          : m.dailyWord.youMissed,
      countdown: clock(
        state.round < state.rounds
          ? m.dailyWord.nextWord
          : m.dailyWord.finalScores,
        true,
      ),
    };
  }

  const waitingFor = state.boards
    .filter(
      (board) =>
        board.playerId !== playerId &&
        board.status === 'guessing' &&
        state.playerList[board.playerId]?.isConnected,
    )
    .map((board) => board.username);
  if (mine?.status === 'found') {
    return {
      label,
      kind: 'status',
      main: m.dailyWord.gotIt(mine.rows.length, mine.points),
      meta: waitingFor.length
        ? m.dailyWord.waitingFor(listNames(waitingFor, m))
        : m.dailyWord.everyoneDone,
      countdown: clock(m.dailyWord.toGuess),
    };
  }
  if (mine?.status === 'out') {
    return {
      label,
      kind: 'status',
      main: m.dailyWord.outOfGuesses,
      meta: waitingFor.length
        ? m.dailyWord.waitingFor(listNames(waitingFor, m))
        : m.dailyWord.everyoneDone,
      countdown: clock(m.dailyWord.toGuess),
    };
  }
  const finders = state.boards
    .filter((board) => board.status === 'found')
    .map((board) => board.username);
  return {
    label,
    kind: 'status',
    // The board counts the guesses; the bar keeps to the race (DW07, DW13).
    main: room.spectating ? m.dailyWord.everyoneGuessing : m.dailyWord.findWord,
    meta: finders.length
      ? m.dailyWord.namesFound(listNames(finders, m))
      : m.dailyWord.fewerScore,
    countdown: clock(m.dailyWord.toGuess, room.spectating),
  };
}

/** One player's line on the scoreboard. */
function playerLine(
  state: DailyWordRoomState,
  seat: Seat,
  m: Messages,
): PlayerLine {
  if (!seat.isConnected) {
    return {
      seat,
      status: m.dailyWord.away,
      statusIcon: 'away',
      state: 'away',
    };
  }
  if (!state.isGameStarted) return { seat, status: m.dailyWord.waiting };
  if (state.phase === 'reveal') {
    const board = state.lastRound?.boards.find(
      (b) => b.playerId === seat.playerId,
    );
    if (!board) return { seat, status: m.dailyWord.waiting };
    return board.status === 'found'
      ? {
          seat,
          status: m.dailyWord.foundItPoints(board.points),
          statusIcon: 'check',
        }
      : { seat, status: m.dailyWord.missed };
  }
  const board = state.boards.find((b) => b.playerId === seat.playerId);
  if (board?.status === 'found') {
    return {
      seat,
      status: m.dailyWord.foundItPoints(board.points),
      statusIcon: 'check',
      state: 'scored',
    };
  }
  if (board?.status === 'out')
    return { seat, status: m.dailyWord.outOfGuesses };
  return { seat, status: m.dailyWord.guessing };
}
