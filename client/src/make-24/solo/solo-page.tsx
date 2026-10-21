import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import {
  formatExpression,
  formatFraction,
  isTarget,
  lastCard,
} from '../../../../shared/make-24';
import { newSeed, SEED_PATTERN } from '../../../../shared/seed';
import {
  Button,
  ButtonLink,
  Card,
  StatList,
  TurnBar,
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
import { useSoloTime } from '../../solo/solo-time';
import { cardsAfter, FinalCard, HandTable, TablePanel } from '../table';
import {
  deal,
  isBetweenHands,
  isOver,
  lastResult,
  newRun,
  nextHand,
  RUN_HANDS,
  runTime,
  skip,
  SKIP_PENALTY_MS,
  SOLVED_PAUSE_MS,
  startOver,
  summary,
  takeStep,
  undo,
  type HandResult,
  type SoloRun,
} from './run';
import styles from './solo-page.module.css';

/** Where the best run and the best of each day are kept. */
const BEST_KEY = 'make-24:ten-hands';
/** How many days of bests a finished run lists. */
const DAYS_SHOWN = 3;

const isSeed = (value: string | null): value is string =>
  value !== null && SEED_PATTERN.test(value);

/**
 * T01-T05, T11: Make 24 on your own, a run of ten hands against one clock.
 * `?seed=` is a challenge: the same ten hands somebody else played. It all
 * runs here: nothing reaches the server.
 */
export function Make24Solo() {
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

/** T01: what a run is, and the best on this device. */
function RunPicker({
  challenge,
  onStart,
}: {
  challenge: boolean;
  onStart: () => void;
}) {
  const m = useMessages();
  const game = gameInfo('make-24');
  const text = m.games.of[game.type];
  const best = readBest(BEST_KEY);
  const description = m.make24.solo.description(challenge);

  return (
    <FormPage
      heading={{
        eyebrow: m.make24.solo.onYourOwn,
        title: text.name,
        subtitle: text.solo?.summary,
      }}
      phone={{ eyebrow: text.name, subtitle: description }}
      title={m.make24.solo.tenHandsClock}
      description={description}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onStart();
      }}
      actions={
        <>
          <Button type="submit">{m.make24.solo.start}</Button>
          <ButtonLink to="/" variant="secondary" icon="back">
            {m.make24.solo.backToGames}
          </ButtonLink>
        </>
      }
    >
      <StatList
        className={styles.stats}
        stats={[
          { label: m.make24.solo.hands, value: String(RUN_HANDS) },
          {
            label: m.make24.solo.yourBestOnDevice,
            value: best === null ? m.make24.solo.notYet : formatDuration(best),
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

/** T02-T05, T11: the run, from the first hand to its results. */
function RunView({
  seed,
  onPlayAgain,
}: {
  seed: string;
  onPlayAgain: () => void;
}) {
  const m = useMessages();
  const clock = useSoloTime();
  const [run, setRun] = useState(() => newRun(seed, clock.now()));
  const [finish, setFinish] = useState<Finish | null>(null);
  const now = useClock(run.handStartedAt !== null && !clock.paused, clock.now);
  const between = isBetweenHands(run);

  // A solved hand stays up for a moment. A skipped one stays until Next hand,
  // to read the way it could have gone; the clock is stopped either way.
  const skippedUp = between && lastResult(run)!.skipped;
  useEffect(() => {
    if (!between || skippedUp || clock.paused) return;
    const timer = setTimeout(
      () => setRun((current) => nextHand(current, clock.now())),
      SOLVED_PAUSE_MS,
    );
    return () => clearTimeout(timer);
  }, [between, skippedUp, clock]);

  const play = (next: SoloRun) => {
    if (next === run) return;
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
  };

  const link = challengeLink(soloPath('make-24'), { seed });

  if (finish) {
    const { timeMs, solved, skipped, fastestMs } = summary(run);
    const time = formatDuration(timeMs);
    return (
      <SoloLayout
        gameType="make-24"
        phase={{ tone: 'lime', label: m.make24.solo.runComplete }}
        stage={
          <>
            <SoloResult
              title={m.make24.solo.finishedIn(RUN_HANDS, time)}
              body={finishBody(finish, m)}
              stats={[
                { label: m.make24.solved, value: String(solved) },
                {
                  label: m.make24.solo.skipped,
                  value: skipped
                    ? m.make24.solo.skippedPenalty(
                        skipped,
                        formatDuration(skipped * SKIP_PENALTY_MS),
                      )
                    : '0',
                },
                {
                  label: m.make24.solo.fastestHand,
                  value:
                    fastestMs === null
                      ? m.make24.solo.none
                      : formatDuration(fastestMs),
                  tone: fastestMs === null ? 'muted' : undefined,
                },
              ]}
              actions={
                <>
                  <Button onClick={onPlayAgain}>
                    {m.make24.solo.playAgain}
                  </Button>
                  <ChallengeButton link={link} />
                </>
              }
            />
            <TablePanel>
              <EveryHand results={run.results} />
            </TablePanel>
          </>
        }
        side={
          <>
            <Card kind="panel" title={m.make24.solo.bestOnDevice}>
              <StatList
                className={styles.stats}
                stats={dayBests(finish, timeMs, m)}
              />
            </Card>
            <ChallengeCard
              description={m.make24.solo.challengeDescription(time)}
              link={link}
            />
          </>
        }
      />
    );
  }

  const last = between ? lastResult(run)! : null;
  const best = readBest(BEST_KEY);
  return (
    <SoloLayout
      gameType="make-24"
      time={clock}
      phase={{ tone: 'blue', label: m.make24.hand(run.hand + 1, RUN_HANDS) }}
      stage={
        <>
          <TurnBar {...turnBar(run, now, last, m)} />
          <TablePanel>
            {last?.skipped ? (
              <FinalCard
                value="24"
                formula={formatExpression(last.expression)}
                state="made"
                prompt={m.make24.solo.skippedPrompt}
                action={
                  // Next hand takes the focus the gone Skip had, so Enter
                  // or Space moves on.
                  <Button
                    autoFocus
                    onClick={() => setRun(nextHand(run, clock.now()))}
                  >
                    {m.make24.solo.nextHand}
                  </Button>
                }
              />
            ) : (
              <HandTable
                deal={deal(run)}
                steps={run.steps}
                onStep={(step) => play(takeStep(run, step, clock.now()))}
                onUndo={() => play(undo(run))}
                onStartOver={() => play(startOver(run))}
                done={last ? m.make24.solo.nextHandPrompt : undefined}
                extraTool={
                  <Button
                    variant="quiet"
                    onClick={() => play(skip(run, clock.now()))}
                  >
                    {m.make24.solo.skip}
                  </Button>
                }
              />
            )}
          </TablePanel>
        </>
      }
      side={
        <>
          <Card kind="panel" title={m.make24.solo.thisRun}>
            <StatList
              className={styles.stats}
              stats={[
                {
                  label: m.make24.solo.hand,
                  value: m.make24.solo.handProgress(run.hand + 1, RUN_HANDS),
                },
                { label: m.make24.solved, value: String(summary(run).solved) },
                {
                  label: m.make24.solo.skipped,
                  value: String(summary(run).skipped),
                },
              ]}
            />
          </Card>
          <Card kind="panel" title={m.make24.solo.bestOnDevice}>
            <StatList
              className={styles.stats}
              stats={[
                {
                  label: m.make24.solo.tenHands,
                  value:
                    best === null ? m.make24.solo.notYet : formatDuration(best),
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

function turnBar(
  run: SoloRun,
  now: number,
  last: HandResult | null,
  m: Messages,
): TurnBarProps {
  const base = {
    label: m.make24.hand(run.hand + 1, RUN_HANDS),
    kind: 'status' as const,
    countdown: {
      seconds: Math.floor(runTime(run, now) / 1000),
      label: m.make24.solo.runTime,
      waiting: true,
    },
  };
  if (last?.skipped) {
    return {
      ...base,
      main: m.make24.solo.skipped,
      meta: m.make24.solo.skipPenalty,
    };
  }
  if (last) {
    return {
      ...base,
      main: m.make24.solo.nice,
      meta: m.make24.solo.solvedIn(formatDuration(last.ms)),
    };
  }
  const left = lastCard(cardsAfter(deal(run), run.steps));
  if (left && !isTarget(left.value)) {
    return {
      ...base,
      main: m.make24.makes(formatFraction(left.value)),
      meta: m.make24.undoPrompt,
    };
  }
  return {
    ...base,
    main: m.games.of['make-24'].name,
    meta: m.make24.useEachNumber,
  };
}

function finishBody({ previous, isBest }: Finish, m: Messages): string {
  if (previous === null) return m.make24.solo.firstRun;
  return isBest
    ? m.make24.solo.newBest(formatDuration(previous))
    : m.make24.solo.previousBest(formatDuration(previous));
}

/** The best of the last few days played, today's in green if this run set it. */
function dayBests(finish: Finish, timeMs: number, m: Messages): Stat[] {
  const days = readDayBests(BEST_KEY).slice(0, DAYS_SHOWN);
  // Storage may keep nothing; this run is still today's.
  if (days.length === 0) {
    return [
      {
        label: m.make24.solo.today,
        value: formatDuration(timeMs),
        tone: 'green',
      },
    ];
  }
  return days.map(({ day, result }, index) => ({
    label: dayLabel(day, finish.at, m),
    value: formatDuration(result),
    tone: index === 0 && finish.isDayBest ? 'green' : undefined,
  }));
}

/** T05: every hand of the run, how it went and how long it took. */
function EveryHand({ results }: { results: readonly HandResult[] }) {
  const m = useMessages();
  return (
    <section className={styles.hands} aria-labelledby="every-hand">
      <h2 id="every-hand" className={styles.heading}>
        {m.make24.solo.everyHand}
      </h2>
      <ol className={styles.list}>
        {results.map((result, index) => (
          <li key={index} className={styles.hand}>
            <span className={styles.number}>{index + 1}</span>
            <span className={styles.deal}>{result.deal.join(' ')}</span>
            <span
              className={result.skipped ? styles.skipped : styles.expression}
            >
              {result.skipped
                ? m.make24.solo.skippedExpression(
                    formatExpression(result.expression),
                  )
                : formatExpression(result.expression)}
            </span>
            <span className={styles.time}>{formatDuration(result.ms)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
