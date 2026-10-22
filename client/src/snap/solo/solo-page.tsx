import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { newSeed, SEED_PATTERN } from '../../../../shared/seed';
import { SYMBOLS, type SymbolName } from '../../../../shared/snap';
import {
  Button,
  Card,
  SnapCard,
  StatList,
  TurnBar,
  type SnapSpotMark,
  type Stat,
  type TurnBarProps,
} from '../../ui';
import { soloPath } from '../../games/catalog';
import { useMessages, type Messages } from '../../i18n';
import { ChallengeCard, challengeLink } from '../../solo/challenge';
import {
  dayLabel,
  formatDuration,
  readBest,
  readDayBests,
  recordBest,
  recordDayBest,
} from '../../solo/device-store';
import { SoloLayout } from '../../solo/solo-layout';
import { SoloResult } from '../../solo/solo-result';
import { useClock } from '../../solo/use-clock';
import { useSoloTime } from '../../solo/solo-time';
import { SnapBoard } from '../board';
import {
  afterFlash,
  canTap,
  cardNumber,
  cardsLeft,
  flashMs,
  isOver,
  matchNow,
  middleOf,
  newRun,
  RUN_CARDS,
  runTime,
  summary,
  tap,
  WRONG_PENALTY_MS,
  type SoloRun,
} from './run';
import styles from './solo-page.module.css';

/**
 * The turn bar width under which its hints take a line of their own: the
 * widest of them, which card a symbol is on, beside a miss, with its clock,
 * in either language, needs this much beside its main line, with 4 px to
 * spare for a clock's digits and subpixel text (TurnBar's hintRowBelow).
 */
const HINT_ROW_BELOW = 609;

/** Where the best run and the best of each day are kept. */
const BEST_KEY = 'snap:thirty-cards';
/** How many days of bests a finished run lists. */
const DAYS_SHOWN = 3;

const isSeed = (value: string | null): value is string =>
  value !== null && SEED_PATTERN.test(value);

/**
 * SN02-SN04, SN11: Snap on your own, thirty cards against one clock, dealt
 * as the page opens, so nobody studies the first card before the clock runs.
 * `?seed=` is a challenge: the same deck somebody else played. It all runs
 * here: nothing reaches the server.
 */
export function SnapSolo() {
  const [params, setParams] = useSearchParams();
  // Each run is a fresh mount, so nothing carries over from the last.
  const [playing, setPlaying] = useState(() => {
    const linked = params.get('seed');
    return isSeed(linked)
      ? { seed: linked, challenge: true, run: 0 }
      : { seed: newSeed(), challenge: false, run: 0 };
  });
  return (
    <RunView
      key={playing.run}
      seed={playing.seed}
      challenge={playing.challenge}
      onPlayAgain={() => {
        // A challenge is played once; the next run is a new one.
        if (playing.challenge) setParams({}, { replace: true });
        setPlaying({ seed: newSeed(), challenge: false, run: playing.run + 1 });
      }}
    />
  );
}

const symbolsNamed = (...names: SymbolName[]) =>
  names.map((name) => SYMBOLS.indexOf(name));

/** SN01's two mini cards, which share the cloud. */
const EXAMPLE = [
  symbolsNamed('eye', 'cloud', 'hexagon', 'half', 'triangle', 'pill'),
  symbolsNamed('fish', 'circle', 'ring', 'tree', 'cloud', 'house'),
];
const EXAMPLE_MATCH = { [SYMBOLS.indexOf('cloud')]: 'match' } as const;

/** SN01's rule and two cards to learn from, beside the cards while they are played. */
function SnapExample() {
  const m = useMessages();
  return (
    <Card
      kind="panel"
      title={m.snap.solo.whatMakesMatch}
      description={m.snap.solo.rule}
    >
      <div className={styles.example}>
        <span className={styles.exampleCards}>
          {EXAMPLE.map((symbols) => (
            <SnapCard
              key={symbols.join()}
              symbols={symbols}
              size="mini"
              marks={EXAMPLE_MATCH}
            />
          ))}
        </span>
        <span className={styles.exampleText}>{m.snap.solo.example}</span>
      </div>
    </Card>
  );
}

/** How a finished run compares with the bests before it. */
interface Finish {
  previous: number | null;
  isBest: boolean;
  isDayBest: boolean;
  at: Date;
}

/** SN02-SN04, SN11: the run, from the first card to its results. */
function RunView({
  seed,
  challenge,
  onPlayAgain,
}: {
  seed: string;
  /** Dealt from somebody else's link. */
  challenge: boolean;
  onPlayAgain: () => void;
}) {
  const m = useMessages();
  const clock = useSoloTime();
  const [run, setRun] = useState(() => newRun(seed, clock.now()));
  const [finish, setFinish] = useState<Finish | null>(null);
  const now = useClock(run.cardStartedAt !== null && !clock.paused, clock.now);

  // A tap just judged stays up for a moment, then the run goes on.
  const flash = run.flash;
  useEffect(() => {
    if (!flash || clock.paused) return;
    const timer = setTimeout(() => {
      const next = afterFlash(run, clock.now());
      setRun(next);
      if (isOver(next)) {
        const { timeMs } = summary(next);
        const at = new Date();
        setFinish({
          ...recordBest(BEST_KEY, timeMs),
          ...recordDayBest(BEST_KEY, timeMs, at),
          at,
        });
      }
    }, flashMs(flash));
    return () => clearTimeout(timer);
  }, [flash, run, clock]);

  const { middleMarks, myMarks } = marksOf(run);
  // The last two cards stay as the run ended, their match marked.
  const board = (
    <SnapBoard
      middle={{
        symbols: middleOf(run),
        label: m.snap.middleCard,
        tag: finish ? undefined : m.snap.left(cardsLeft(run)),
        marks: middleMarks,
      }}
      mine={{ symbols: run.mine, label: m.snap.yourCard, marks: myMarks }}
      onTap={(symbol) => setRun(tap(run, symbol, clock.now()))}
      disabled={!canTap(run)}
      inPlay={!finish}
      fitHeight
    />
  );

  if (finish) {
    const { timeMs, wrongTaps, fastestMs, slowestMs } = summary(run);
    const time = formatDuration(timeMs);
    const timeOf = (ms: number | null) =>
      ms === null ? m.snap.solo.none : formatDuration(ms);
    return (
      <SoloLayout
        gameType="snap"
        phase={{ tone: 'lime', label: m.snap.solo.complete }}
        stage={
          <>
            <TurnBar
              hintRowBelow={HINT_ROW_BELOW}
              label={m.snap.solo.progress(RUN_CARDS, RUN_CARDS)}
              kind="status"
              main={m.snap.solo.allTaken(RUN_CARDS)}
              countdown={{
                seconds: Math.floor(timeMs / 1000),
                label: m.snap.solo.runTime,
                deadline: false,
              }}
            />
            {board}
          </>
        }
        result={
          <SoloResult
            celebrate={finish.isBest}
            title={m.snap.solo.resultTitle(RUN_CARDS, time)}
            body={finishBody(finish, m)}
            stats={[
              { label: m.snap.solo.wrongTaps, value: costOf(wrongTaps, m) },
              { label: m.snap.solo.fastest, value: timeOf(fastestMs) },
              { label: m.snap.solo.slowest, value: timeOf(slowestMs) },
            ]}
            actions={<Button onClick={onPlayAgain}>{m.room.playAgain}</Button>}
          />
        }
        side={
          <>
            <Card kind="panel" title={m.snap.solo.best}>
              <StatList
                className={styles.stats}
                stats={dayBests(finish, timeMs, m)}
              />
            </Card>
            <ChallengeCard
              description={m.snap.solo.challenge(time)}
              text={challengeLink(soloPath('snap'), { seed })}
            />
          </>
        }
      />
    );
  }

  const best = readBest(BEST_KEY);
  const { wrongTaps, fastestMs } = summary(run);
  const label = m.snap.solo.progress(cardNumber(run), RUN_CARDS);
  return (
    <SoloLayout
      gameType="snap"
      time={clock}
      phase={{
        tone: 'blue',
        label: challenge ? m.solo.challenge : m.snap.solo.thirtyCards,
      }}
      stage={
        <>
          <TurnBar
            {...turnBar(run, now, label, m)}
            hintRowBelow={HINT_ROW_BELOW}
          />
          {board}
        </>
      }
      side={
        <>
          <Card kind="panel" title={m.snap.solo.thisRun}>
            <StatList
              className={styles.stats}
              stats={[
                {
                  label: m.snap.solo.wrongTaps,
                  value: costOf(wrongTaps, m),
                },
                {
                  label: m.snap.solo.fastest,
                  value:
                    fastestMs === null
                      ? m.snap.solo.none
                      : formatDuration(fastestMs),
                  tone: fastestMs === null ? 'muted' : undefined,
                },
              ]}
            />
          </Card>
          <SnapExample />
          <Card kind="panel" title={m.snap.solo.best}>
            <StatList
              className={styles.stats}
              stats={[
                {
                  label: m.snap.solo.thirtyCards,
                  value:
                    best === null ? m.snap.solo.notYet : formatDuration(best),
                  tone: best === null ? 'muted' : undefined,
                },
              ]}
            />
          </Card>
        </>
      }
    />
  );
}

/** "2, +0:06". */
const costOf = (count: number, m: Messages) =>
  m.snap.solo.cost(count, formatDuration(count * WRONG_PENALTY_MS));

/**
 * What the spots show: a match on both cards, or a wrong tap on the card the
 * symbol is on. A finished run keeps its last match marked.
 */
function marksOf(run: SoloRun) {
  const middleMarks: Partial<Record<number, SnapSpotMark>> = {};
  const myMarks: Partial<Record<number, SnapSpotMark>> = {};
  const flash = run.flash;
  if (flash && !flash.match) {
    (flash.on === 'mine' ? myMarks : middleMarks)[flash.symbol] = 'miss';
    return { middleMarks, myMarks };
  }
  const match = flash?.match
    ? flash.symbol
    : isOver(run)
      ? matchNow(run)
      : null;
  if (match !== null) {
    middleMarks[match] = 'match';
    myMarks[match] = 'match';
  }
  return { middleMarks, myMarks };
}

function turnBar(
  run: SoloRun,
  now: number,
  label: string,
  m: Messages,
): TurnBarProps {
  const base = {
    label,
    kind: 'status' as const,
    countdown: {
      seconds: Math.floor(runTime(run, now) / 1000),
      label: m.snap.solo.runTime,
      deadline: false,
    },
  };
  const flash = run.flash;
  if (flash?.match) {
    const last = run.results.at(-1);
    return {
      ...base,
      main: m.snap.solo.match,
      meta: last ? m.snap.solo.foundIn(formatDuration(last.ms)) : undefined,
    };
  }
  // Which card a wrong symbol is on stays until the next tap, long after its
  // mark goes, so it can be read.
  if (run.miss) {
    return {
      ...base,
      main: m.snap.solo.wrong,
      meta: m.snap.onlyOn(run.miss.symbol, run.miss.on),
    };
  }
  return { ...base, main: m.snap.spot, meta: m.snap.solo.tapBoth };
}

function finishBody({ previous, isBest }: Finish, m: Messages): string {
  if (previous === null) return m.snap.solo.firstRun;
  return isBest
    ? m.snap.solo.newBest(formatDuration(previous))
    : m.snap.solo.previousBest(formatDuration(previous));
}

/** The best of the last few days played, today's in green if this run set it. */
function dayBests(finish: Finish, timeMs: number, m: Messages): Stat[] {
  const days = readDayBests(BEST_KEY).slice(0, DAYS_SHOWN);
  // Storage may keep nothing; this run is still today's.
  if (days.length === 0) {
    return [
      { label: m.solo.today, value: formatDuration(timeMs), tone: 'green' },
    ];
  }
  return days.map(({ day, result }, index) => ({
    label: dayLabel(day, finish.at, m),
    value: formatDuration(result),
    tone: index === 0 && finish.isDayBest ? 'green' : undefined,
  }));
}
