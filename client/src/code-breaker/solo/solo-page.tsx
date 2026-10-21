import { useMessages, type Messages } from '../../i18n';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import {
  DISTRIBUTION_BARS,
  dailyCode,
  MAX_GUESSES,
  msUntilNextPuzzle,
  practiceCode,
  puzzleNumber,
  shareText,
} from '../../../../shared/code-breaker';
import { newSeed, SEED_PATTERN } from '../../../../shared/seed';
import {
  Button,
  Card,
  CodeBoard,
  CodeMarksBoard,
  StatList,
  TurnBar,
  type TurnBarProps,
} from '../../ui';
import { soloPath } from '../../games/catalog';
import { listNames } from '../../room/players';
import { PHONE, useMediaQuery } from '../../shell/use-media-query';
import { challengeLink } from '../../solo/challenge';
import { SoloLayout } from '../../solo/solo-layout';
import { SoloResult } from '../../solo/solo-result';
import { useClock } from '../../solo/use-clock';
import { CopyButton, Distribution, formatWait } from '../../solo/daily';
import { BoardPanel, PegLegend } from '../panel';
import { describeRow, PlayArea } from '../play';
import type { Notes } from '../draft';
import {
  deleteKey,
  guessesToCrack,
  isOver,
  newGame,
  rowsOf,
  settledDigits,
  submit,
  typeKey,
  type SoloGame,
} from './game';
import {
  readNotes,
  readRecords,
  recordGuesses,
  recordNotes,
  statsOf,
  type DailyStats,
} from './records';
import styles from './solo-page.module.css';

const isSeed = (value: string | null): value is string =>
  value !== null && SEED_PATTERN.test(value);

type Mode = { kind: 'daily' } | { kind: 'practice'; seed: string };

/**
 * CB02-CB08, CB16, CB17: Code Breaker on your own. Today's code first;
 * practice codes after it. `?seed=` is a challenge: a practice code somebody
 * else played, straight away. It all runs here: nothing reaches the server.
 */
export function CodeBreakerSolo() {
  const [params, setParams] = useSearchParams();
  const linked = params.get('seed');
  const [mode, setMode] = useState<Mode>(() =>
    isSeed(linked) ? { kind: 'practice', seed: linked } : { kind: 'daily' },
  );
  const [puzzle, setPuzzle] = useState(() => puzzleNumber(new Date()));
  const practice = () => setMode({ kind: 'practice', seed: newSeed() });
  const nextDay = useCallback(() => setPuzzle(puzzleNumber(new Date())), []);

  if (mode.kind === 'daily') {
    return (
      <DailyView
        key={puzzle}
        puzzle={puzzle}
        onPractice={practice}
        onNextDay={nextDay}
      />
    );
  }
  return (
    <PracticeView
      key={mode.seed}
      seed={mode.seed}
      challenge={mode.seed === linked}
      onAnother={practice}
      onToday={() => {
        // A challenge is played once; a refresh now goes to today's code.
        if (linked !== null) setParams({}, { replace: true });
        setPuzzle(puzzleNumber(new Date()));
        setMode({ kind: 'daily' });
      }}
    />
  );
}

/** The line under the board while a code is still open. */
function promptFor(guesses: number, m: Messages): string {
  return guesses === 0 ? m.codeBreaker.freshPrompt : m.codeBreaker.nextPrompt;
}

/** The typing a board takes, as one game changes into the next. */
function useSoloGame(
  start: () => SoloGame,
  onGuess?: (game: SoloGame) => void,
) {
  const [game, setGame] = useState(start);
  const typing = {
    onKey: (digit: string) => setGame(typeKey(game, digit)),
    onDelete: () => setGame(deleteKey(game)),
    onEnter: () => {
      const next = submit(game);
      setGame(next);
      if (next.guesses !== game.guesses) onGuess?.(next);
    },
  };
  return { game, typing };
}

/** A day's code, with the guesses this device has made at it. */
const dailyGame = (puzzle: number) =>
  newGame(dailyCode(puzzle), readRecords().get(puzzle) ?? []);

/** The board, the line under it and the pad, while a code is open. */
function OpenBoard({
  game,
  typing,
  notes,
  onNotes,
}: {
  game: SoloGame;
  typing: ReturnType<typeof useSoloGame>['typing'];
  notes: Notes;
  onNotes: (notes: Notes) => void;
}) {
  const m = useMessages();
  const { problem } = game.draft;
  return (
    <BoardPanel>
      <PlayArea
        rows={rowsOf(game)}
        draft={game.draft}
        problem={
          problem === 'network' || problem === null
            ? null
            : m.codeBreaker.problem(problem)
        }
        prompt={promptFor(game.guesses.length, m)}
        typing={typing}
        notes={notes}
        onNotes={onNotes}
        pad
      />
    </BoardPanel>
  );
}

/** CB02-CB07, CB16, CB17: today's code, then how it went. */
function DailyView({
  puzzle,
  onPractice,
  onNextDay,
}: {
  puzzle: number;
  onPractice: () => void;
  /** Midnight came while the finished code was on screen. */
  onNextDay: () => void;
}) {
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  const [records, setRecords] = useState(readRecords);
  const [notes, setNotes] = useState(() => readNotes(puzzle));
  const { game, typing } = useSoloGame(
    () => dailyGame(puzzle),
    (next) => setRecords(recordGuesses(puzzle, next.guesses)),
  );
  const over = isOver(game);
  const now = useClock(over);

  // A finished code gives way to the next one at midnight; one being played
  // stays until it is done.
  useEffect(() => {
    if (!over) return;
    const timer = setTimeout(onNextDay, msUntilNextPuzzle(new Date()) + 1000);
    return () => clearTimeout(timer);
  }, [over, onNextDay]);

  const stats = statsOf(records, puzzle);
  const phase = {
    tone: 'blue' as const,
    label: m.codeBreaker.codeNumber(puzzle),
  };
  const title = m.codeBreaker.dailyNumber(puzzle);

  if (!over) {
    return (
      <SoloLayout
        gameType="code-breaker"
        phase={phase}
        stage={
          <>
            <TurnBar
              {...playingBar(game, title, m.codeBreaker.dailyFresh, phone, m)}
            />
            <OpenBoard
              game={game}
              typing={typing}
              notes={notes}
              onNotes={(next) => {
                setNotes(next);
                recordNotes(puzzle, next);
              }}
            />
          </>
        }
        side={
          <>
            <Card kind="panel" title={m.codeBreaker.readIt}>
              <PegLegend />
            </Card>
            <DeviceStats stats={stats} />
          </>
        }
      />
    );
  }

  const cracked = guessesToCrack(game);
  const share = shareText(
    m.codeBreaker.shareDaily(puzzle),
    rowsOf(game).map((row) => row.mark),
    `${window.location.origin}${soloPath('code-breaker')}`,
  );
  return (
    <FinishedLayout
      phase={phase}
      // A phone has no column for the stats, so a bar says how it went first.
      bar={{
        label: title,
        kind: 'status',
        main: cracked
          ? m.codeBreaker.crackedItIn(cracked)
          : m.codeBreaker.outOfGuesses,
        meta: m.codeBreaker.newCodeAtMidnight,
      }}
      result={
        <SoloResult
          title={
            cracked
              ? m.codeBreaker.crackedIn(cracked)
              : m.codeBreaker.notThisTime
          }
          body={
            cracked
              ? m.codeBreaker.dailyCracked(
                  game.code,
                  m.codeBreaker.streak(stats.currentStreak),
                )
              : m.codeBreaker.dailyMissed(game.code)
          }
          stats={[
            {
              label: m.codeBreaker.guesses,
              value: m.codeBreaker.guessesOf(game.guesses.length, MAX_GUESSES),
            },
            {
              label: m.codeBreaker.nextCodeIn,
              value: formatWait(msUntilNextPuzzle(new Date(now))),
            },
          ]}
          actions={
            <>
              <CopyButton
                text={share}
                label={m.codeBreaker.share}
                copiedLabel={m.codeBreaker.copied}
                icon="copy"
                primary
              />
              <Button variant="secondary" onClick={onPractice}>
                {m.codeBreaker.practiceCode}
              </Button>
            </>
          }
        />
      }
      game={game}
      side={
        <>
          <DeviceStats stats={stats} />
          <Card kind="panel" title={m.codeBreaker.guessesToCrack}>
            <Distribution
              bars={stats.distribution.map((count, bar) => {
                const guesses = barLabel(bar);
                return {
                  guesses,
                  count,
                  label: m.codeBreaker.distribution(count, guesses),
                };
              })}
              today={cracked === null ? null : barIndex(cracked)}
            />
          </Card>
        </>
      }
    />
  );
}

/** The first bar holds 1 to 4 guesses; each after it, one more. */
const FIRST_BAR = MAX_GUESSES - DISTRIBUTION_BARS + 1;
const barIndex = (guesses: number) => Math.max(0, guesses - FIRST_BAR);
const barLabel = (bar: number) =>
  bar === 0 ? `1–${FIRST_BAR}` : String(bar + FIRST_BAR);

/** CB08: a practice code, and how it went. */
function PracticeView({
  seed,
  challenge,
  onAnother,
  onToday,
}: {
  seed: string;
  /** Opened from somebody else's link. */
  challenge: boolean;
  onAnother: () => void;
  onToday: () => void;
}) {
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  const [notes, setNotes] = useState<Notes>({});
  const { game, typing } = useSoloGame(() => newGame(practiceCode(seed)));
  const phase = {
    tone: 'blue' as const,
    label: challenge ? m.codeBreaker.challenge : m.codeBreaker.practice,
  };

  if (!isOver(game)) {
    return (
      <SoloLayout
        gameType="code-breaker"
        phase={phase}
        stage={
          <>
            <TurnBar
              {...playingBar(
                game,
                challenge
                  ? m.codeBreaker.friendCode
                  : m.codeBreaker.practiceCode,
                challenge
                  ? m.codeBreaker.challengeFresh
                  : m.codeBreaker.practiceFresh,
                phone,
                m,
              )}
            />
            <OpenBoard
              game={game}
              typing={typing}
              notes={notes}
              onNotes={setNotes}
            />
          </>
        }
        side={
          <Card kind="panel" title={m.codeBreaker.readIt}>
            <PegLegend />
          </Card>
        }
      />
    );
  }

  const cracked = guessesToCrack(game);
  const marks = rowsOf(game).map((row) => row.mark);
  const share = shareText(
    m.codeBreaker.sharePractice,
    marks,
    challengeLink(soloPath('code-breaker'), { seed }),
  );
  return (
    <FinishedLayout
      phase={phase}
      result={
        <SoloResult
          title={
            cracked
              ? m.codeBreaker.crackedIn(cracked)
              : m.codeBreaker.notThisTime
          }
          body={m.codeBreaker.practiceResult(game.code)}
          actions={
            <>
              <Button onClick={onAnother}>{m.codeBreaker.anotherCode}</Button>
              <CopyButton
                text={share}
                label={m.codeBreaker.challengeFriend}
                copiedLabel={m.codeBreaker.copied}
                icon="link"
              />
              <Button variant="quiet" icon="back" onClick={onToday}>
                {m.codeBreaker.todayCode}
              </Button>
            </>
          }
        />
      }
      game={game}
      side={
        <Card
          kind="panel"
          title={m.codeBreaker.challengeFriend}
          description={
            cracked
              ? m.codeBreaker.friendFewer(cracked)
              : m.codeBreaker.friendSame
          }
        >
          <CodeMarksBoard marks={marks} label={m.codeBreaker.yourPegs} />
          <CopyButton
            text={share}
            label={m.codeBreaker.copyChallenge}
            copiedLabel={m.codeBreaker.copied}
            icon="link"
            className={styles.copy}
          />
        </Card>
      }
    />
  );
}

/**
 * CB06-CB08, CB17: the result over the finished board, and cards beside it;
 * on a phone, a turn bar over them all when there is one.
 */
function FinishedLayout({
  phase,
  bar,
  result,
  game,
  side,
}: {
  phase: { tone: 'blue'; label: string };
  bar?: TurnBarProps;
  result: ReactNode;
  game: SoloGame;
  side: ReactNode;
}) {
  const phone = useMediaQuery(PHONE);
  return (
    <SoloLayout
      gameType="code-breaker"
      phase={phase}
      stage={
        phone ? (
          // CB17: the board first, under the bar, then how it went.
          <>
            {bar && <TurnBar {...bar} />}
            <BoardPanel>
              <FinishedBoard game={game} />
            </BoardPanel>
            {result}
            {side}
          </>
        ) : (
          <>
            {result}
            <BoardPanel>
              <FinishedBoard game={game} />
            </BoardPanel>
          </>
        )
      }
      side={side}
    />
  );
}

function FinishedBoard({ game }: { game: SoloGame }) {
  const m = useMessages();
  return (
    <CodeBoard
      rows={rowsOf(game)}
      size="compact"
      label={m.codeBreaker.yourGuesses}
      describe={(row) => describeRow(row, m)}
    />
  );
}

function DeviceStats({ stats }: { stats: DailyStats }) {
  const m = useMessages();
  return (
    <Card kind="panel" title={m.codeBreaker.onDevice}>
      <StatList
        className={styles.stats}
        stats={[
          { label: m.codeBreaker.stats.played, value: String(stats.played) },
          {
            label: m.codeBreaker.stats.cracked,
            value: `${stats.crackedPercent}%`,
          },
          {
            label: m.codeBreaker.stats.currentStreak,
            value: String(stats.currentStreak),
          },
          {
            label: m.codeBreaker.stats.bestStreak,
            value: String(stats.bestStreak),
          },
        ]}
      />
    </Card>
  );
}

/**
 * The turn bar while a code is played: which guess, and what the marks
 * settle. A phone has no legend beside the board, so its bar says how to
 * read the pegs instead (CB16).
 */
function playingBar(
  game: SoloGame,
  label: string,
  fresh: string,
  phone: boolean,
  m: Messages,
): TurnBarProps {
  const problem = game.draft.problem !== null;
  if (game.guesses.length === 0) {
    return {
      label,
      kind: 'status',
      main: m.codeBreaker.crackCode,
      meta: problem
        ? m.codeBreaker.fixRow
        : phone
          ? m.codeBreaker.legendLine
          : fresh,
    };
  }
  return {
    label,
    kind: 'status',
    main: m.codeBreaker.guessNumber(game.guesses.length + 1, MAX_GUESSES),
    meta: problem
      ? m.codeBreaker.fixRow
      : phone
        ? m.codeBreaker.legendLine
        : known(game, m),
  };
}

/** "Three guesses in. 5, 6 and 8 are out." */
export function known(game: SoloGame, m: Messages): string {
  const settled = settledDigits(rowsOf(game));
  const parts: string[] = [];
  if (settled.in.length) {
    parts.push(
      m.codeBreaker.digitsIn(listNames(settled.in, m), settled.in.length),
    );
  }
  if (settled.out.length) {
    parts.push(
      m.codeBreaker.digitsOut(listNames(settled.out, m), settled.out.length),
    );
  }
  return m.codeBreaker.known(game.guesses.length, parts);
}
