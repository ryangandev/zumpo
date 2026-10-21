import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import type { PairsBoard } from '../../../../shared/wire-types';
import { PAIRS_BOARDS } from '../../../../shared/pairs';
import { newSeed, SEED_PATTERN } from '../../../../shared/seed';
import {
  Button,
  ButtonLink,
  Card,
  ChoiceList,
  StatList,
  TurnBar,
  type Stat,
  type TurnBarProps,
} from '../../ui';
import { gameInfo, soloPath } from '../../games/catalog';
import { useMessages, type Messages } from '../../i18n';
import { FormPage } from '../../shell/form-page';
import { PHONE, useMediaQuery } from '../../shell/use-media-query';
import {
  ChallengeButton,
  ChallengeCard,
  challengeLink,
} from '../../solo/challenge';
import {
  formatDuration,
  readStored,
  writeStored,
} from '../../solo/device-store';
import { SoloLayout } from '../../solo/solo-layout';
import { SoloResult } from '../../solo/solo-result';
import { useClock } from '../../solo/use-clock';
import { useSoloTime } from '../../solo/solo-time';
import { BoardPanel, PairsGrid } from '../board';
import { BOARDS } from '../boards';
import { readPairsBest, recordPairsBest, type PairsBest } from './best';
import {
  cardsOf,
  elapsed,
  flip,
  isOver,
  isShowingMiss,
  lastTurn,
  MISS_SHOWN_MS,
  newGame,
  pairsFound,
  summary,
  turnBack,
  type SoloGame,
} from './game';
import styles from './solo-page.module.css';

const LAST_BOARD = 'pairs:board';

const isBoard = (value: string | null): value is PairsBoard =>
  BOARDS.includes(value as PairsBoard);
const isSeed = (value: string | null): value is string =>
  value !== null && SEED_PATTERN.test(value);

/** "31 turns". */
const turnsLabel = (best: PairsBest, m: Messages) =>
  m.pairs.solo.turnsCount(best.turns);

/**
 * PR01-PR04, PR09: Pairs on your own. `?board=Large&seed=k3f9x2` is a
 * challenge: the same deck somebody else played. It all runs here: nothing
 * reaches the server.
 */
export function PairsSolo() {
  const [params, setParams] = useSearchParams();
  const linkedBoard = params.get('board');
  const linkedSeed = params.get('seed');
  const challenge =
    isBoard(linkedBoard) && isSeed(linkedSeed)
      ? { board: linkedBoard, seed: linkedSeed }
      : null;
  // Each game is a fresh mount, so nothing carries over from the last.
  const [playing, setPlaying] = useState<{
    board: PairsBoard;
    seed: string;
    game: number;
  } | null>(null);

  if (playing === null) {
    return (
      <BoardPicker
        challenge={challenge?.board ?? null}
        onStart={(board) => {
          writeStored(LAST_BOARD, board);
          setPlaying({
            board,
            seed: challenge?.seed ?? newSeed(),
            game: 0,
          });
        }}
      />
    );
  }
  return (
    <SoloGameView
      key={playing.game}
      board={playing.board}
      seed={playing.seed}
      onPlayAgain={() => {
        // A challenge is played once; the next game is a new deck.
        if (challenge) setParams({}, { replace: true });
        setPlaying({ ...playing, seed: newSeed(), game: playing.game + 1 });
      }}
    />
  );
}

/** PR01: the two boards, each with its best on this device. */
function BoardPicker({
  challenge,
  onStart,
}: {
  /** The board a challenge link deals, the only one to play. */
  challenge: PairsBoard | null;
  onStart: (board: PairsBoard) => void;
}) {
  const m = useMessages();
  const game = gameInfo('pairs');
  const text = m.games.of[game.type];
  const [board, setBoard] = useState<PairsBoard>(() => {
    if (challenge) return challenge;
    const last = readStored(LAST_BOARD);
    return isBoard(last) ? last : 'Small';
  });
  const description = m.pairs.solo.description(challenge !== null);

  return (
    <FormPage
      heading={{
        eyebrow: m.pairs.solo.onYourOwn,
        title: text.name,
        subtitle: text.solo?.summary,
      }}
      phone={{ eyebrow: text.name, subtitle: description }}
      title={m.pairs.solo.pickBoard}
      description={description}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onStart(board);
      }}
      actions={
        <>
          <Button type="submit">{m.pairs.solo.start}</Button>
          <ButtonLink to="/" variant="secondary" icon="back">
            {m.pairs.solo.backToGames}
          </ButtonLink>
        </>
      }
    >
      <ChoiceList
        label={m.pairs.solo.board}
        options={(challenge ? [challenge] : BOARDS).map((option) => {
          const best = readPairsBest(option);
          return {
            value: option,
            label: m.pairs.boardLabel(option),
            detail: m.pairs.solo.boardOption(
              PAIRS_BOARDS[option].pairs,
              best === null
                ? m.pairs.solo.noBest
                : m.pairs.solo.best(turnsLabel(best, m)),
            ),
          };
        })}
        value={board}
        onValueChange={setBoard}
      />
    </FormPage>
  );
}

/** How a cleared board compares with the best before it. */
interface Finish {
  previous: PairsBest | null;
  isBest: boolean;
}

/** PR02-PR04, PR09: one deck, from the first card to the last pair. */
function SoloGameView({
  board,
  seed,
  onPlayAgain,
}: {
  board: PairsBoard;
  seed: string;
  onPlayAgain: () => void;
}) {
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  const clock = useSoloTime();
  const [game, setGame] = useState(() => newGame(board, seed));
  const [finish, setFinish] = useState<Finish | null>(null);
  const now = useClock(
    game.startedAt !== null && !isOver(game) && !clock.paused,
    clock.now,
  );
  // Each miss is its own pair of places, so the next one starts its own wait.
  const miss = isShowingMiss(game) ? game.up : null;

  // Two cards that do not match stay up a moment, unless another is flipped,
  // and a moment of the clock: How to play holds them up until it closes.
  useEffect(() => {
    if (!miss || clock.paused) return;
    const timer = setTimeout(
      () =>
        setGame((current) =>
          current.up === miss ? turnBack(current) : current,
        ),
      MISS_SHOWN_MS,
    );
    return () => clearTimeout(timer);
  }, [miss, clock.paused]);

  const play = (index: number) => {
    const next = flip(game, index, clock.now());
    if (next === game) return;
    setGame(next);
    if (isOver(next)) {
      const { turns, timeMs } = summary(next, clock.now());
      setFinish(recordPairsBest(board, { turns, ms: timeMs }));
    }
  };

  const link = challengeLink(soloPath('pairs'), { board, seed });
  const { pairs, turns, timeMs, streak } = summary(game, now);

  const bests: Stat[] = BOARDS.map((option) => {
    const best = readPairsBest(option);
    return {
      label: m.pairs.boardLabel(option),
      value: best === null ? m.pairs.solo.notYet : turnsLabel(best, m),
      tone:
        best === null
          ? 'muted'
          : option === board && finish?.isBest
            ? 'green'
            : undefined,
    };
  });

  return (
    <SoloLayout
      gameType="pairs"
      time={finish ? undefined : clock}
      phase={
        finish
          ? { tone: 'lime', label: m.pairs.solo.boardCleared }
          : { tone: 'blue', label: m.pairs.boardLabel(board) }
      }
      stage={
        <>
          {finish ? (
            <SoloResult
              title={m.pairs.solo.finishedIn(pairs, turns)}
              body={finishBody(board, turns, finish, m)}
              stats={[
                { label: m.pairs.solo.time, value: formatDuration(timeMs) },
                { label: m.pairs.solo.turns, value: String(turns) },
                {
                  label: m.pairs.solo.longestStreak,
                  value: m.pairs.solo.streak(streak),
                },
              ]}
              actions={
                <>
                  <Button onClick={onPlayAgain}>
                    {m.pairs.solo.playAgain}
                  </Button>
                  <ChallengeButton link={link} />
                </>
              }
            />
          ) : (
            <TurnBar {...turnBar(game, now, phone, m)} />
          )}
          <BoardPanel>
            <PairsGrid
              cards={cardsOf(game)}
              onFlip={finish ? undefined : play}
              inPlay={!finish}
            />
          </BoardPanel>
        </>
      }
      side={
        finish ? (
          <>
            <Card kind="panel" title={m.pairs.solo.bestOnDevice}>
              <StatList className={styles.stats} stats={bests} />
            </Card>
            <ChallengeCard
              description={m.pairs.solo.challengeDescription(turns)}
              link={link}
            />
          </>
        ) : (
          <>
            <Card kind="panel" title={m.pairs.solo.thisGame}>
              <StatList
                className={styles.stats}
                stats={[
                  {
                    label: m.pairs.solo.pairs,
                    value: m.pairs.solo.pairProgress(pairsFound(game), pairs),
                  },
                  { label: m.pairs.solo.turns, value: String(turns) },
                ]}
              />
            </Card>
            <Card kind="panel" title={m.pairs.solo.bestOnDevice}>
              <StatList className={styles.stats} stats={bests} />
            </Card>
          </>
        )
      }
    />
  );
}

function finishBody(
  board: PairsBoard,
  turns: number,
  finish: Finish,
  m: Messages,
): string {
  const { previous, isBest } = finish;
  if (previous === null) {
    return m.pairs.solo.firstClear(board);
  }
  // The same turns as the best is told apart by the time.
  const best =
    previous.turns === turns
      ? m.pairs.solo.turnsInTime(
          turnsLabel(previous, m),
          formatDuration(previous.ms),
        )
      : turnsLabel(previous, m);
  return isBest
    ? m.pairs.solo.newBest(best)
    : m.pairs.solo.previousBest(board, best);
}

function turnBar(
  game: SoloGame,
  now: number,
  phone: boolean,
  m: Messages,
): TurnBarProps {
  const turns = game.turns.length;
  const flipping = game.up.length === 1;
  const last = lastTurn(game);
  // A finished turn stays up, with its number, until the next card is
  // flipped: a pair, or a miss until it turns back.
  const finished =
    isShowingMiss(game) || (last === 'pair' && game.up.length === 0);
  const number = finished ? turns : turns + 1;
  const pairs = PAIRS_BOARDS[game.board].pairs;
  const base = {
    label: m.pairs.solo.turn(number),
    kind: 'status' as const,
    countdown: {
      seconds: Math.floor(elapsed(game, now) / 1000),
      label: m.pairs.solo.runTime,
      waiting: true,
    },
  };
  // A phone has no side cards, so the pairs found are on the turn bar.
  const progress = m.pairs.progress(pairsFound(game), pairs);
  if (flipping) {
    return {
      ...base,
      main: m.pairs.solo.findPair,
      meta: phone ? progress : m.pairs.solo.whereSeen,
    };
  }
  if (isShowingMiss(game)) {
    return {
      ...base,
      main: m.pairs.notPair,
      meta: phone ? progress : m.pairs.solo.flipBackSoon,
    };
  }
  if (finished) {
    return {
      ...base,
      main: m.pairs.solo.aPair,
      meta: phone ? progress : m.pairs.solo.flipAnother,
    };
  }
  return {
    ...base,
    main: m.pairs.flipCard,
    meta: phone
      ? progress
      : game.startedAt === null
        ? m.pairs.solo.clockStarts
        : m.pairs.solo.thenFindPair,
  };
}
