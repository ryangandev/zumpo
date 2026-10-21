import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { newSeed, SEED_PATTERN } from '../../../../shared/seed';
import {
  Button,
  ButtonLink,
  Card,
  StatList,
  type Stat,
  type TurnBarProps,
} from '../../ui';
import { gameInfo, soloPath } from '../../games/catalog';
import { useMessages, type Messages } from '../../i18n';
import { FormPage } from '../../shell/form-page';
import {
  ChallengeButton,
  ChallengeCard,
  challengeLink,
} from '../../solo/challenge';
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
import {
  MiniTrio,
  TablePanel,
  TableTools,
  TriosTable,
  TriosTurnBar,
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
 * TS01-TS04, TS11: Trios on your own, a run of ten trios against one clock.
 * `?seed=` is a challenge: the same first table and deck somebody else
 * played. It all runs here: nothing reaches the server.
 */
export function TriosSolo() {
  const [params, setParams] = useSearchParams();
  const linked = params.get('seed');
  // Each run is a fresh mount, so nothing carries over from the last.
  const [playing, setPlaying] = useState<{ seed: string; run: number } | null>(
    null,
  );

  if (playing === null) {
    return (
      <RunPicker
        challenge={isSeed(linked)}
        onStart={() =>
          setPlaying({ seed: isSeed(linked) ? linked : newSeed(), run: 0 })
        }
      />
    );
  }
  return (
    <RunView
      key={playing.run}
      seed={playing.seed}
      onPlayAgain={() => {
        // A challenge is played once; the next run is a new one.
        if (linked !== null) setParams({}, { replace: true });
        setPlaying({ seed: newSeed(), run: playing.run + 1 });
      }}
    />
  );
}

/** TS01: what a run is, a trio to learn from, and the best on this device. */
function RunPicker({
  challenge,
  onStart,
}: {
  challenge: boolean;
  onStart: () => void;
}) {
  const game = gameInfo('trios');
  const m = useMessages();
  const text = m.games.of[game.type];
  const best = readBest(BEST_KEY);
  const rule = m.trios.solo.rule;
  const description = challenge
    ? m.trios.solo.challengeDescription(rule)
    : rule;

  return (
    <FormPage
      heading={{
        eyebrow: m.solo.onYourOwn,
        title: text.name,
        subtitle: text.solo?.summary,
      }}
      phone={{ eyebrow: text.name, subtitle: description }}
      title={m.trios.solo.title}
      description={description}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onStart();
      }}
      actions={
        <>
          <Button type="submit">{m.trios.solo.start}</Button>
          <ButtonLink to="/" variant="secondary" icon="back">
            {m.shell.backToGames}
          </ButtonLink>
        </>
      }
    >
      <div className={styles.example}>
        <MiniTrio cards={EXAMPLE} />
        <span className={styles.exampleText}>{m.trios.solo.example}</span>
      </div>
      <StatList
        className={styles.stats}
        stats={[
          { label: m.trios.solo.trios, value: String(RUN_TRIOS) },
          {
            label: m.trios.solo.yourBest,
            value: best === null ? m.trios.solo.notYet : formatDuration(best),
            tone: best === null ? 'muted' : undefined,
          },
        ]}
      />
    </FormPage>
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
  onPlayAgain,
}: {
  seed: string;
  onPlayAgain: () => void;
}) {
  const m = useMessages();
  const [run, setRun] = useState(() => newRun(seed, Date.now()));
  const [finish, setFinish] = useState<Finish | null>(null);
  const now = useClock(run.trioStartedAt !== null);

  // Three cards just judged stay up for a moment, then the run goes on.
  const flash = run.flash;
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => {
      const next = afterFlash(run, Date.now());
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
  }, [flash, run]);

  const link = challengeLink(soloPath('trios'), { seed });

  if (finish) {
    const { timeMs, wrongPicks, hints, fastestMs } = summary(run);
    const time = formatDuration(timeMs);
    return (
      <SoloLayout
        gameType="trios"
        phase={{ tone: 'lime', label: m.trios.solo.complete }}
        stage={
          <>
            <SoloResult
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
              actions={
                <>
                  <Button onClick={onPlayAgain}>{m.room.playAgain}</Button>
                  <ChallengeButton link={link} />
                </>
              }
            />
            <TablePanel>
              <EveryTrio results={run.results} />
            </TablePanel>
          </>
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
              link={link}
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
      phase={{ tone: 'blue', label }}
      leaveWarning={run.results.length > 0 ? m.trios.solo.leaveWarning : null}
      stage={
        <>
          <TriosTurnBar lines={1} {...turnBar(run, now, label, m)} />
          <TablePanel>
            <TriosTable
              cards={run.deal.table}
              places={placesOf(run, m)}
              onPick={
                canPick(run)
                  ? (place) => setRun(pick(run, place, Date.now()))
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
                  label: m.trios.solo.found,
                  value: String(run.results.length),
                },
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
            <MiniTrio cards={result.cards} />
            <span className={styles.note}>{trioNote(result, m)}</span>
            <span className={styles.time}>{formatDuration(result.ms)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
