import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { newSeed, SEED_PATTERN } from '../../../../shared/seed';
import {
  Button,
  Card,
  StatList,
  TurnBar,
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
import { Fit } from '../../shell/fit';
import { SoloLayout } from '../../solo/solo-layout';
import { SoloResult } from '../../solo/solo-result';
import { useClock } from '../../solo/use-clock';
import { useSoloTime } from '../../solo/solo-time';
import {
  MiniTrio,
  TablePanel,
  TableTools,
  TriosTable,
  type PlaceView,
} from '../table';
import { whyNotATrio } from '../words';
import {
  afterFlash,
  canPick,
  FLASH_MS,
  hint,
  hintedPlaces,
  HINT_PENALTY_MS,
  isOver,
  MAX_HINTS,
  newRun,
  pick,
  RUN_TRIOS,
  runTime,
  summary,
  trioNumber,
  WRONG_PENALTY_MS,
  type SoloRun,
  type TrioResult,
} from './run';
import styles from './solo-page.module.css';

/** Where the best run and the best of each day are kept. */
const BEST_KEY = 'trios:ten-trios';
/** How many days of bests a finished run lists. */
const DAYS_SHOWN = 3;
/**
 * TS01's example: one coral circle, two striped coral triangles, three
 * outlined coral squares. One colour and everything else different, so a
 * trio is not only "all different".
 */
const EXAMPLE = [0, 13, 26];

const isSeed = (value: string | null): value is string =>
  value !== null && SEED_PATTERN.test(value);

/**
 * TS02-TS04, TS11: Trios on your own, a run of ten trios against one clock,
 * dealt as the page opens. `?seed=` is a challenge: the same first table and
 * deck somebody else played. It all runs here: nothing reaches the server.
 */
export function TriosSolo() {
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

/** TS01's rule and a trio to learn from, beside the table while it is played. */
function TrioExample() {
  const m = useMessages();
  return (
    <Card
      kind="panel"
      title={m.trios.solo.whatMakesTrio}
      description={m.trios.solo.rule}
    >
      <div className={styles.example}>
        <MiniTrio cards={EXAMPLE} />
        <span className={styles.exampleText}>{m.trios.solo.example}</span>
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

/** TS02-TS04, TS11: the run, from the first table to its results. */
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
  const now = useClock(run.trioStartedAt !== null && !clock.paused, clock.now);

  // Three cards just judged stay up for a moment, then the run goes on.
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
    }, FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash, run, clock]);

  if (finish) {
    const { timeMs, wrongPicks, hints, fastestMs } = summary(run);
    const time = formatDuration(timeMs);
    return (
      <SoloLayout
        gameType="trios"
        phase={{ tone: 'lime', label: m.trios.solo.complete }}
        stage={
          <>
            <TurnBar
              label={m.trios.solo.progress(RUN_TRIOS, RUN_TRIOS)}
              kind="status"
              main={m.trios.solo.allFound(RUN_TRIOS)}
              countdown={{
                seconds: Math.floor(timeMs / 1000),
                label: m.trios.solo.runTime,
                waiting: true,
              }}
            />
            <TablePanel>
              <EveryTrio results={run.results} />
            </TablePanel>
          </>
        }
        result={
          <SoloResult
            celebrate={finish.isBest}
            title={m.trios.solo.resultTitle(RUN_TRIOS, time)}
            body={finishBody(finish, m)}
            stats={[
              {
                label: m.trios.solo.wrongPicks,
                value: costOf(wrongPicks, WRONG_PENALTY_MS, m),
              },
              {
                label: m.trios.solo.hints,
                value: costOf(hints, HINT_PENALTY_MS, m),
              },
              {
                label: m.trios.solo.fastest,
                value:
                  fastestMs === null
                    ? m.trios.solo.none
                    : formatDuration(fastestMs),
              },
            ]}
            actions={<Button onClick={onPlayAgain}>{m.room.playAgain}</Button>}
          />
        }
        side={
          <>
            <Card kind="panel" title={m.trios.solo.best}>
              <StatList
                className={styles.stats}
                stats={dayBests(finish, timeMs, m)}
              />
            </Card>
            <ChallengeCard
              description={m.trios.solo.challenge(time)}
              text={challengeLink(soloPath('trios'), { seed })}
            />
          </>
        }
      />
    );
  }

  const best = readBest(BEST_KEY);
  const { wrongPicks, hints } = summary(run);
  const label = m.trios.solo.progress(trioNumber(run), RUN_TRIOS);
  return (
    <SoloLayout
      gameType="trios"
      time={clock}
      phase={{
        tone: 'blue',
        label: challenge ? m.solo.challenge : m.trios.solo.tenTrios,
      }}
      leaveWarning={run.results.length > 0 ? m.trios.solo.leaveWarning : null}
      stage={
        <>
          <TurnBar {...turnBar(run, now, label, m)} />
          <TablePanel>
            <TriosTable
              cards={run.deal.table}
              places={placesOf(run, m)}
              onPick={
                canPick(run)
                  ? (place) => setRun(pick(run, place, clock.now()))
                  : undefined
              }
            />
            {/* Offered until a trio's two hints are given; then it keeps
                its place, so the table panel never changes height. */}
            <TableTools hidden={run.hints >= MAX_HINTS}>
              <Button variant="quiet" onClick={() => setRun(hint(run))}>
                {m.trios.solo.hintButton}
              </Button>
            </TableTools>
          </TablePanel>
        </>
      }
      side={
        <>
          <Card kind="panel" title={m.trios.solo.thisRun}>
            <StatList
              className={styles.stats}
              stats={[
                {
                  label: m.trios.solo.wrongPicks,
                  value: costOf(wrongPicks, WRONG_PENALTY_MS, m),
                },
                {
                  label: m.trios.solo.hints,
                  value: costOf(hints, HINT_PENALTY_MS, m),
                },
              ]}
            />
          </Card>
          <TrioExample />
          <Card kind="panel" title={m.trios.solo.best}>
            <StatList
              className={styles.stats}
              stats={[
                {
                  label: m.trios.solo.tenTrios,
                  value:
                    best === null ? m.trios.solo.notYet : formatDuration(best),
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

/** "1, +0:05". */
const costOf = (count: number, each: number, m: Messages) =>
  m.trios.solo.cost(count, formatDuration(count * each));

/** What each place shows: the picks, three just judged, and the hints. */
function placesOf(run: SoloRun, m: Messages): Record<number, PlaceView> {
  const places: Record<number, PlaceView> = {};
  for (const place of hintedPlaces(run)) {
    places[place] = {
      state: 'hinted',
      badge: m.trios.hint,
      badgeLabel: m.trios.hintBadge,
    };
  }
  for (const place of run.picked) {
    places[place] = { ...places[place], state: 'selected' };
  }
  if (run.flash) {
    for (const place of run.flash.places) {
      places[place] = {
        ...places[place],
        state: run.flash.found ? 'found' : 'wrong',
      };
    }
  }
  return places;
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
      label: m.trios.solo.runTime,
      waiting: true,
    },
  };
  const flash = run.flash;
  if (flash?.found) {
    const last = run.results.at(-1)!;
    return {
      ...base,
      main: m.trios.solo.trio,
      meta: m.trios.solo.foundIn(formatDuration(last.ms)),
    };
  }
  // Why three were not a trio stays until the next pick, long after they
  // go back, so it can be read.
  if (run.miss) {
    return {
      ...base,
      main: m.trios.solo.wrong,
      meta: whyNotATrio(run.miss, m) ?? undefined,
    };
  }
  // As in a room: what the hints marked, and what is left to find.
  return {
    ...base,
    main:
      run.picked.length === 2
        ? m.trios.pickThird
        : run.picked.length === 1
          ? m.trios.pickTwo
          : run.hints === 1
            ? m.trios.oneMarked
            : run.hints === 2
              ? m.trios.twoMarked
              : m.trios.findTrio,
    meta:
      run.hints === 1
        ? m.trios.findTwo
        : run.hints === 2
          ? m.trios.findThird
          : m.trios.solo.features,
  };
}

function finishBody({ previous, isBest }: Finish, m: Messages): string {
  if (previous === null) return m.trios.solo.firstRun;
  return isBest
    ? m.trios.solo.newBest(formatDuration(previous))
    : m.trios.solo.previousBest(formatDuration(previous));
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

/** "1 wrong pick", "2 hints", or both. */
function trioNote({ wrongPicks, hints }: TrioResult, m: Messages): string {
  return m.trios.solo.note(wrongPicks, hints);
}

/** TS04: every trio of the run, and how long it took. */
function EveryTrio({ results }: { results: readonly TrioResult[] }) {
  const m = useMessages();
  return (
    <section className={styles.trios} aria-labelledby="every-trio">
      <h2 id="every-trio" className={styles.heading}>
        {m.trios.solo.everyTrio}
      </h2>
      <ol className={styles.list}>
        {results.map((result, index) => (
          <li key={index} className={styles.trio}>
            <span className={styles.number}>{index + 1}</span>
            {/* A 360 px phone leaves the three cards less than they need. */}
            <Fit align="start">
              <MiniTrio cards={result.cards} />
            </Fit>
            <span className={styles.note}>{trioNote(result, m)}</span>
            <span className={styles.time}>{formatDuration(result.ms)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
