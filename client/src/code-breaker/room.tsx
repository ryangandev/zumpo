import { useState } from 'react';
import type {
  CodeBreakerBoard,
  CodeBreakerRoomState,
} from '../../../shared/wire-types';
import { checkGuess } from '../../../shared/code-breaker';
import { CodeRaceBoard, TurnBar, type TurnBarProps } from '../ui';
import { useMessages, type Messages } from '../i18n';
import { REQUEST_TIMEOUT_MS } from '../net/socket';
import { useSecondsLeft } from '../net/use-seconds-left';
import { EndedEarlyPanel, ResultsPanel, WaitingPanel } from '../room/panels';
import { listNames, rankedPlayers, type Seat } from '../room/players';
import { useRoomContext, type Room as RoomOf } from '../room/room-context';
import { RoomLayout, type PlayerLine } from '../room/room-layout';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import {
  deleteDigit,
  EMPTY_DRAFT,
  typeDigit,
  type Draft,
  type Notes,
} from './draft';
import { BoardPanel, PegLegend } from './panel';
import { describeRow, PlayArea } from './play';
import styles from './room.module.css';

type Room = RoomOf<CodeBreakerRoomState>;

/**
 * The row being typed and the notes on the pad, for one code. They live
 * above the board, which a phone unmounts on the Players and Chat tabs, and
 * a new code starts with neither.
 */
interface Desk {
  round: number;
  draft: Draft;
  notes: Notes;
}

const freshDesk = (round: number): Desk => ({
  round,
  draft: EMPTY_DRAFT,
  notes: {},
});

/** CB09-CB13, CB18-CB21: a Code Breaker room, before, during and after a game. */
export function CodeBreakerRoom() {
  const m = useMessages();
  const room = useRoomContext<CodeBreakerRoomState>();
  const { state, playerId } = room;
  const phone = useMediaQuery(PHONE);
  const players = rankedPlayers(state);
  const inGame = state.isGameStarted;
  const ended = !inGame ? state.lastGame : null;
  const mine = state.boards.find((board) => board.playerId === playerId);
  const guessing = state.phase === 'guessing';
  const [desk, setDesk] = useState<Desk>(() => freshDesk(0));
  return (
    <RoomLayout
      phase={
        inGame
          ? {
              tone: 'blue',
              label: m.codeBreaker.codeOf(state.round, state.rounds),
            }
          : ended && !ended.endedEarly
            ? { tone: 'lime', label: m.codeBreaker.gameOver }
            : ended && players.length < 2
              ? { tone: 'peach', label: m.codeBreaker.gameEnded }
              : { tone: 'blue', label: m.codeBreaker.waitingRoom }
      }
      stage={
        inGame ? (
          <Round
            key={state.round}
            room={room}
            desk={desk.round === state.round ? desk : freshDesk(state.round)}
            onDesk={setDesk}
          />
        ) : (
          <BetweenGames room={room} />
        )
      }
      players={players.map((seat) => playerLine(state, seat, m))}
      chat={{
        placeholder: m.codeBreaker.chatPlaceholder,
        lockedReason:
          guessing && mine?.status === 'cracked'
            ? m.codeBreaker.crackedChat
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

export default CodeBreakerRoom;

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
          detail={m.codeBreaker.codesDetail(summary.rounds)}
          standingDetail={(id) =>
            m.codeBreaker.codesCracked(summary.cracked[id] ?? 0)
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
      aloneTitle={m.codeBreaker.alone}
      setup={m.codeBreaker.setup(count, state.rounds)}
      guestSetup={m.codeBreaker.guestSetup(count, state.rounds)}
      onStart={startGame}
      starting={starting}
    />
  );
}

/** CB09-CB12, CB18: one code: the turn bar, then your board or the reveal. */
function Round({
  room,
  desk,
  onDesk,
}: {
  room: Room;
  desk: Desk;
  onDesk: (desk: Desk) => void;
}) {
  const m = useMessages();
  const { state, receivedAt, reconnecting, socket, playerId } = room;
  const seconds = useSecondsLeft(state.phaseEndsInMs, receivedAt, reconnecting);
  const phone = useMediaQuery(PHONE);
  const [sending, setSending] = useState(false);
  const mine = state.boards.find((board) => board.playerId === playerId);
  const { draft } = desk;
  const setDraft = (next: Draft) => onDesk({ ...desk, draft: next });

  // A spectator has no board of their own: everybody's is theirs to watch.
  if (state.phase === 'guessing' && room.spectating) {
    return (
      <>
        <TurnBar {...turnBar(room, seconds, mine, phone, m)} />
        <BoardPanel>
          <Side room={room} />
        </BoardPanel>
      </>
    );
  }
  if (state.phase === 'reveal' || !mine) {
    return (
      <>
        <TurnBar {...turnBar(room, seconds, mine, phone, m)} />
        <RoundResults state={state} />
      </>
    );
  }

  const rows = mine.rows.map((row) => ({
    guess: row.guess ?? '',
    mark: row.mark,
  }));
  const guesses = rows.map((row) => row.guess);
  const done = mine.status !== 'guessing';
  const typing = {
    onKey: (digit: string) => setDraft(typeDigit(draft, digit)),
    onDelete: () => setDraft(deleteDigit(draft)),
    onEnter: async () => {
      if (sending) return;
      // The rules are here too, so a refusal needs no round trip; the server
      // checks again and marks the guess.
      const local = checkGuess(draft.typed, guesses);
      if (local) {
        setDraft({ ...draft, problem: local });
        return;
      }
      setSending(true);
      try {
        const answer = await socket
          .timeout(REQUEST_TIMEOUT_MS)
          .emitWithAck('cb:guess', state.roomId, draft.typed);
        setDraft(
          answer.ok
            ? EMPTY_DRAFT
            : {
                ...draft,
                problem: checkGuess(draft.typed, guesses) ?? 'network',
              },
        );
      } catch {
        setDraft({ ...draft, problem: 'network' });
      }
      setSending(false);
    },
  };
  const problem = done
    ? null
    : draft.problem === 'network'
      ? m.codeBreaker.guessFailed
      : draft.problem
        ? m.codeBreaker.problem(draft.problem)
        : null;
  const play = (
    <PlayArea
      rows={rows}
      draft={done ? EMPTY_DRAFT : draft}
      problem={problem}
      prompt={
        done
          ? mine.status === 'cracked'
            ? m.codeBreaker.crackedWatch
            : m.codeBreaker.outWatch
          : undefined
      }
      typing={typing}
      notes={desk.notes}
      onNotes={(notes) => onDesk({ ...desk, notes })}
      pad={!done}
      disabled={reconnecting || sending}
      className={done ? styles.mine : undefined}
    >
      {/* CB09: the others beside your board, the pad under both. */}
      {!done && !phone && <Side room={room} />}
    </PlayArea>
  );

  return (
    <>
      <TurnBar {...turnBar(room, seconds, mine, phone, m)} />
      <BoardPanel>
        {done ? (
          // CB10, CB11: the pad gone, your board and the others side by side.
          <div className={styles.table}>
            {play}
            {!phone && <Side room={room} />}
          </div>
        ) : (
          play
        )}
      </BoardPanel>
    </>
  );
}

/**
 * CB09-CB11: beside your board, the others' and how to read the pegs, for a
 * friend who meets them here before ever playing on their own. A phone has
 * no room beside the board; its turn bar says how to read them (CB18).
 */
function Side({ room }: { room: Room }) {
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  return (
    <div className={styles.side}>
      <Others room={room} />
      {!phone && (
        <section className={styles.legend} aria-labelledby="read-the-pegs">
          <h2 id="read-the-pegs" className={styles.title}>
            {m.codeBreaker.readIt}
          </h2>
          <PegLegend />
        </section>
      )}
    </div>
  );
}

/** CB09-CB11, CB19: everybody else's board, pegs only. */
function Others({ room }: { room: Room }) {
  const m = useMessages();
  const { state, playerId, spectating } = room;
  const others = state.boards.filter((board) => board.playerId !== playerId);
  if (others.length === 0) return null;
  return (
    <section className={styles.others} aria-labelledby="the-others">
      <div className={styles.heading}>
        <h2 id="the-others" className={styles.title}>
          {spectating ? m.codeBreaker.everyone : m.codeBreaker.others}
        </h2>
        <p className={styles.note}>{m.codeBreaker.pegsOnly}</p>
      </div>
      <div className={styles.boards}>
        {others.map((board) => (
          <CodeRaceBoard
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

const raceStatus = (board: CodeBreakerBoard, m: Messages): string =>
  board.status === 'cracked'
    ? m.codeBreaker.crackedPoints(board.points)
    : board.status === 'out'
      ? m.codeBreaker.outOfGuesses
      : board.rows.length === 0
        ? m.codeBreaker.noGuesses
        : m.codeBreaker.guessesCount(board.rows.length);

/**
 * CB12, CB13: a finished code's boards, with their digits, best first. On a
 * phone (CB20, CB21) they stand in a column, each a Row board, since two
 * Small boards do not fit across.
 */
function RoundResults({ state }: { state: CodeBreakerRoomState }) {
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  const result = state.lastRound;
  if (!result) return null;
  const round = state.isGameStarted
    ? state.round
    : (state.lastGame?.rounds ?? state.round);
  return (
    <BoardPanel>
      <section className={styles.results} aria-labelledby="code-results">
        <div className={styles.heading}>
          <h2 id="code-results" className={styles.title}>
            {m.codeBreaker.codeResults(round)}
          </h2>
          {!state.isGameStarted && (
            <p className={styles.body}>{m.codeBreaker.codeWas(result.code)}</p>
          )}
        </div>
        <div className={styles.boards}>
          {result.boards.map((board) => (
            <CodeRaceBoard
              key={board.playerId}
              name={board.username}
              status={
                board.status === 'cracked'
                  ? m.codeBreaker.crackedInPoints(
                      board.rows.length,
                      board.points,
                    )
                  : m.codeBreaker.missed
              }
              state={board.status === 'cracked' ? 'cracked' : 'out'}
              layout={phone ? 'row' : 'column'}
              rows={board.rows}
              describe={(row) => describeRow(row, m)}
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
  mine: CodeBreakerBoard | undefined,
  phone: boolean,
  m: Messages,
): TurnBarProps {
  const { state, playerId, reconnecting } = room;
  const clock = (label: string, waiting = false) =>
    reconnecting
      ? { seconds, label: m.codeBreaker.paused, waiting: true }
      : { seconds, label, waiting };
  const label = m.codeBreaker.codeOf(state.round, state.rounds);

  if (state.phase === 'reveal') {
    const result = state.lastRound;
    const me = result?.boards.find((board) => board.playerId === playerId);
    const crackers = (result?.boards ?? [])
      .filter((board) => board.status === 'cracked')
      .map((board) => board.username);
    return {
      label: m.codeBreaker.codeWasLabel,
      kind: 'status',
      main: result?.code ?? '',
      meta: room.spectating
        ? crackers.length
          ? m.codeBreaker.namesCracked(listNames(crackers, m))
          : m.codeBreaker.nobodyCracked
        : me?.status === 'cracked'
          ? m.codeBreaker.youCracked(me.rows.length, me.points)
          : m.codeBreaker.youMissed,
      countdown: clock(
        state.round < state.rounds
          ? m.codeBreaker.nextCode
          : m.codeBreaker.finalScores,
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
  const waiting = waitingFor.length
    ? m.codeBreaker.waitingFor(listNames(waitingFor, m))
    : m.codeBreaker.everyoneDone;
  if (mine?.status === 'cracked') {
    return {
      label,
      kind: 'status',
      main: m.codeBreaker.gotIt(mine.rows.length, mine.points),
      meta: waiting,
      countdown: clock(m.codeBreaker.toGuess),
    };
  }
  if (mine?.status === 'out') {
    return {
      label,
      kind: 'status',
      main: m.codeBreaker.outOfGuesses,
      meta: waiting,
      countdown: clock(m.codeBreaker.toGuess),
    };
  }
  const crackers = state.boards
    .filter((board) => board.status === 'cracked')
    .map((board) => board.username);
  return {
    label,
    kind: 'status',
    // The board counts the guesses; the bar keeps to the race (CB09, CB18).
    main: room.spectating
      ? m.codeBreaker.everyoneGuessing
      : m.codeBreaker.crackCode,
    // Until somebody cracks it, a phone, with no legend beside the board,
    // says how to read the pegs (CB18).
    meta: crackers.length
      ? m.codeBreaker.namesCracked(listNames(crackers, m))
      : phone
        ? m.codeBreaker.legendLine
        : m.codeBreaker.fewerScore,
    countdown: clock(m.codeBreaker.toGuess, room.spectating),
  };
}

/** One player's line on the scoreboard. */
function playerLine(
  state: CodeBreakerRoomState,
  seat: Seat,
  m: Messages,
): PlayerLine {
  if (!seat.isConnected) {
    return {
      seat,
      status: m.codeBreaker.away,
      statusIcon: 'away',
      state: 'away',
    };
  }
  if (!state.isGameStarted) return { seat, status: m.codeBreaker.waiting };
  if (state.phase === 'reveal') {
    const board = state.lastRound?.boards.find(
      (b) => b.playerId === seat.playerId,
    );
    if (!board) return { seat, status: m.codeBreaker.waiting };
    return board.status === 'cracked'
      ? {
          seat,
          status: m.codeBreaker.crackedItPoints(board.points),
          statusIcon: 'check',
        }
      : { seat, status: m.codeBreaker.missed };
  }
  const board = state.boards.find((b) => b.playerId === seat.playerId);
  if (board?.status === 'cracked') {
    return {
      seat,
      status: m.codeBreaker.crackedItPoints(board.points),
      statusIcon: 'check',
      state: 'scored',
    };
  }
  if (board?.status === 'out') {
    return { seat, status: m.codeBreaker.outOfGuesses };
  }
  return { seat, status: m.codeBreaker.guessing };
}
