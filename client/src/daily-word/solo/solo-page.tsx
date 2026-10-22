import { charAt } from '../../../../shared/list';
import { useMessages, type Messages } from '../../i18n';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import {
  dailyAnswer,
  MAX_GUESSES,
  msUntilNextPuzzle,
  practiceAnswer,
  puzzleNumber,
  shareText,
} from '../../../../shared/daily-word';
import { newSeed, SEED_PATTERN } from '../../../../shared/seed';
import {
  Button,
  Card,
  LetterTile,
  StatList,
  TurnBar,
  WordBoard,
  type TurnBarProps,
} from '../../ui';
import { soloPath } from '../../games/catalog';
import { listNames } from '../../room/players';
import type { Typing } from '../../shell/board-typing';
import { SHORT_WIDE, useMediaQuery } from '../../shell/use-media-query';
import { ChallengeCard, challengeLink } from '../../solo/challenge';
import { SoloLayout } from '../../solo/solo-layout';
import { SoloAnswer, SoloResult } from '../../solo/solo-result';
import { useClock } from '../../solo/use-clock';
import { BoardPanel, MarkLegend } from '../panel';
import { PlayArea } from '../play';
import { CopyButton, Distribution, formatWait } from '../../solo/daily';
import {
  deleteLetter,
  guessesToWin,
  isOver,
  newGame,
  rowsOf,
  submit,
  typeLetter,
  type SoloGame,
} from './game';
import {
  readRecords,
  recordGuesses,
  statsOf,
  type DailyStats,
} from './records';
import styles from './solo-page.module.css';

/**
 * The turn bar width under which its hints take a line of their own: the widest
 * of them, the five letters known so far at their longest, beside the word
 * found, in either language, needs this much beside its main line, with 4 px to
 * spare for a clock's digits and subpixel text (TurnBar's hintRowBelow).
 */
const HINT_ROW_BELOW = 569;

const isSeed = (value: string | null): value is string =>
  value !== null && SEED_PATTERN.test(value);

type Mode = { kind: 'daily' } | { kind: 'practice'; seed: string };

/**
 * DW01-DW06, DW12: Daily Word on your own. Today's word first; practice words
 * after it. `?seed=` is a challenge: a practice word somebody else played,
 * straight away. It all runs here: nothing reaches the server.
 */
export function DailyWordSolo() {
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
        // A challenge is played once; a refresh now goes to today's word.
        if (linked !== null) setParams({}, { replace: true });
        setPuzzle(puzzleNumber(new Date()));
        setMode({ kind: 'daily' });
      }}
    />
  );
}

/** The line under the board while a word is still open. */
function promptFor(guesses: number, m: Messages): string {
  return guesses === 0 ? m.dailyWord.freshPrompt : m.dailyWord.nextPrompt;
}

/** The typing a board takes, as one game changes into the next. */
function useSoloGame(
  start: () => SoloGame,
  onGuess?: (game: SoloGame) => void,
) {
  const [game, setGame] = useState(start);
  const typing = {
    onKey: (letter: string) => setGame(typeLetter(game, letter)),
    onDelete: () => setGame(deleteLetter(game)),
    onEnter: () => {
      const next = submit(game);
      setGame(next);
      if (next.guesses !== game.guesses) onGuess?.(next);
    },
  };
  return { game, setGame, typing };
}

/** A day's word, with the guesses this device has made at it. */
const dailyGame = (puzzle: number) =>
  newGame(dailyAnswer(puzzle), readRecords().get(puzzle) ?? []);

/** DW01-DW05, DW12: today's word, then how it went. */
function DailyView({
  puzzle,
  onPractice,
  onNextDay,
}: {
  puzzle: number;
  onPractice: () => void;
  /** Midnight came while the finished word was on screen. */
  onNextDay: () => void;
}) {
  const m = useMessages();
  const [records, setRecords] = useState(readRecords);
  const { game, typing } = useSoloGame(
    () => dailyGame(puzzle),
    (next) => setRecords(recordGuesses(puzzle, next.guesses)),
  );
  const over = isOver(game);
  const now = useClock(over);

  // A finished word gives way to the next one at midnight; one being played
  // stays until it is done.
  useEffect(() => {
    if (!over) return;
    const timer = setTimeout(onNextDay, msUntilNextPuzzle(new Date()) + 1000);
    return () => clearTimeout(timer);
  }, [over, onNextDay]);

  const stats = statsOf(records, puzzle);
  const phase = {
    tone: 'blue' as const,
    label: m.dailyWord.wordNumber(puzzle),
  };
  const title = m.dailyWord.today;

  const found = guessesToWin(game);
  const word = game.answer.toUpperCase();
  return (
    <SoloStage
      phase={phase}
      bar={
        over
          ? endBar(game, title, m.dailyWord.newWordAtMidnight, m)
          : playingBar(game, title, m.dailyWord.dailyFresh, m)
      }
      game={game}
      typing={typing}
      result={
        over && (
          <SoloResult
            title={found ? m.dailyWord.foundIn(found) : m.dailyWord.notThisTime}
            answer={!found && <WordAnswer word={word} />}
            body={
              found
                ? m.dailyWord.dailyFound(
                    word,
                    m.dailyWord.streak(stats.currentStreak),
                  )
                : m.dailyWord.dailyMissed
            }
            stats={[
              {
                label: m.dailyWord.nextWordIn,
                value: formatWait(msUntilNextPuzzle(new Date(now))),
              },
            ]}
            actions={
              <>
                <CopyButton
                  text={shareText(
                    m.dailyWord.shareDaily(puzzle),
                    rowsOf(game).map((row) => row.marks),
                    `${window.location.origin}${soloPath('daily-word')}`,
                  )}
                  label={m.dailyWord.share}
                  copiedLabel={m.dailyWord.copied}
                  icon="copy"
                  primary
                />
                <Button variant="secondary" onClick={onPractice}>
                  {m.dailyWord.practiceWord}
                </Button>
              </>
            }
          />
        )
      }
      side={
        over ? (
          <>
            <DeviceStats stats={stats} />
            <Card kind="panel" title={m.dailyWord.guessesToFind}>
              <Distribution
                bars={stats.distribution.map((count, index) => ({
                  guesses: String(index + 1),
                  count,
                  label: m.dailyWord.distribution(count, index + 1),
                }))}
                today={found === null ? null : found - 1}
              />
            </Card>
          </>
        ) : (
          <>
            <Card kind="panel" title={m.dailyWord.readIt}>
              <MarkLegend />
            </Card>
            <DeviceStats stats={stats} />
          </>
        )
      }
    />
  );
}

/** DW06: a practice word, and how it went. */
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
  const { game, typing } = useSoloGame(() => newGame(practiceAnswer(seed)));
  const phase = {
    tone: 'blue' as const,
    label: challenge ? m.dailyWord.challenge : m.dailyWord.practice,
  };

  const over = isOver(game);
  const found = guessesToWin(game);
  const marks = rowsOf(game).map((row) => row.marks);
  const label = challenge ? m.dailyWord.friendWord : m.dailyWord.practiceWord;
  return (
    <SoloStage
      phase={phase}
      bar={
        over
          ? endBar(game, label, undefined, m)
          : playingBar(
              game,
              label,
              challenge
                ? m.dailyWord.challengeFresh
                : m.dailyWord.practiceFresh,
              m,
            )
      }
      game={game}
      typing={typing}
      result={
        over && (
          <SoloResult
            title={found ? m.dailyWord.foundIn(found) : m.dailyWord.notThisTime}
            answer={!found && <WordAnswer word={game.answer.toUpperCase()} />}
            body={
              found
                ? m.dailyWord.practiceResult(game.answer.toUpperCase())
                : m.dailyWord.practiceMissed
            }
            actions={
              <>
                <Button onClick={onAnother}>{m.dailyWord.anotherWord}</Button>
                <Button variant="quiet" icon="back" onClick={onToday}>
                  {m.dailyWord.todayWord}
                </Button>
              </>
            }
          />
        )
      }
      side={
        over ? (
          <ChallengeCard
            description={
              found ? m.dailyWord.friendFewer(found) : m.dailyWord.friendSame
            }
            text={shareText(
              m.dailyWord.sharePractice,
              marks,
              challengeLink(soloPath('daily-word'), { seed }),
            )}
          >
            <WordBoard
              rows={marks.map((rowMarks) => ({ word: null, marks: rowMarks }))}
              size="mini"
              label={m.dailyWord.yourMarks}
            />
          </ChallengeCard>
        ) : (
          <Card kind="panel" title={m.dailyWord.readIt}>
            <MarkLegend />
          </Card>
        )
      }
    />
  );
}

/**
 * DW01-DW06: one word from the first guess to how it went. The board is
 * played and finished in the same panel, so it keeps its size, and its
 * place unless the keyboard was beside it: the keyboard goes, the bar says how
 * it ended, and the result leads the cards beside it.
 */
function SoloStage({
  phase,
  bar,
  game,
  typing,
  result,
  side,
}: {
  phase: { tone: 'blue'; label: string };
  bar: TurnBarProps;
  game: SoloGame;
  typing: Typing;
  result: ReactNode;
  side: ReactNode;
}) {
  const m = useMessages();
  const over = isOver(game);
  const beside = useMediaQuery(SHORT_WIDE);
  return (
    <SoloLayout
      gameType="daily-word"
      phase={phase}
      stage={
        <>
          <TurnBar
            {...bar}
            labelOnPhone={false}
            hintRowBelow={HINT_ROW_BELOW}
          />
          {/* Keyed on the window's layout, not on whether the keys are
              beside the board now, so the board grows back when the window
              makes room, but not when the keys go at the end. */}
          <BoardPanel fitHeight layout={beside}>
            <PlayArea
              rows={rowsOf(game)}
              typed={game.typed}
              problem={game.problem && m.dailyWord.problem(game.problem)}
              prompt={over ? undefined : promptFor(game.guesses.length, m)}
              typing={typing}
              keyboard={!over}
              beside={beside && !over}
            />
          </BoardPanel>
        </>
      }
      result={result}
      side={side}
    />
  );
}

function DeviceStats({ stats }: { stats: DailyStats }) {
  const m = useMessages();
  return (
    <Card kind="panel" title={m.dailyWord.onDevice}>
      <StatList
        className={styles.stats}
        stats={[
          { label: m.dailyWord.stats.played, value: String(stats.played) },
          { label: m.dailyWord.stats.found, value: `${stats.foundPercent}%` },
          {
            label: m.dailyWord.stats.currentStreak,
            value: String(stats.currentStreak),
          },
          {
            label: m.dailyWord.stats.bestStreak,
            value: String(stats.bestStreak),
          },
        ]}
      />
    </Card>
  );
}

/** The turn bar while a word is played: which guess, and what is known. */
function playingBar(
  game: SoloGame,
  label: string,
  fresh: string,
  m: Messages,
): TurnBarProps {
  if (game.guesses.length === 0) {
    return { label, kind: 'status', main: m.dailyWord.findWord, meta: fresh };
  }
  return {
    label,
    kind: 'status',
    main: m.dailyWord.guessNumber(game.guesses.length + 1, MAX_GUESSES),
    meta: game.problem ? m.dailyWord.fixRow : known(game, m),
  };
}

/** The turn bar over a finished word: found or not, and what comes next. */
function endBar(
  game: SoloGame,
  label: string,
  meta: string | undefined,
  m: Messages,
): TurnBarProps {
  return {
    label,
    kind: 'status',
    main:
      guessesToWin(game) === null
        ? m.dailyWord.outOfGuesses
        : m.dailyWord.youFoundWord(game.answer.toUpperCase()),
    meta,
  };
}

/** "A, L and T". */
const listLetters = (letters: Set<string>, m: Messages) =>
  listNames([...letters], m);

/** "A and L are in place, T is somewhere else". */
export function known(game: SoloGame, m: Messages): string {
  const placed = new Set<string>();
  const elsewhere = new Set<string>();
  for (const { word, marks } of rowsOf(game)) {
    marks.forEach((mark, index) => {
      if (mark === 'correct') placed.add(charAt(word, index).toUpperCase());
    });
  }
  for (const { word, marks } of rowsOf(game)) {
    marks.forEach((mark, index) => {
      const letter = charAt(word, index).toUpperCase();
      if (mark === 'present' && !placed.has(letter)) elsewhere.add(letter);
    });
  }
  const parts: string[] = [];
  if (placed.size)
    parts.push(m.dailyWord.lettersPlaced(listLetters(placed, m), placed.size));
  if (elsewhere.size)
    parts.push(
      m.dailyWord.lettersElsewhere(listLetters(elsewhere, m), elsewhere.size),
    );
  return m.dailyWord.known(parts);
}

/** DW05: a missed word, spelled out in tiles under the result. */
function WordAnswer({ word }: { word: string }) {
  const m = useMessages();
  return (
    <SoloAnswer label={m.dailyWord.wordWas(word)}>
      {[...word].map((letter, index) => (
        <LetterTile
          key={index}
          letter={letter}
          state="correct"
          size="small"
          decorative
        />
      ))}
    </SoloAnswer>
  );
}
