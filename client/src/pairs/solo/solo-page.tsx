import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { PairsBoard } from '../../../../shared/wire-types';
import { PAIRS_BOARDS } from '../../../../shared/pairs';
import { newSeed, SEED_PATTERN } from '../../../../shared/seed';
import {
  Button,
  Card,
  ChoiceList,
  StatList,
  TurnBar,
  type Stat,
  type TurnBarProps,
} from '../../ui';
import { soloPath } from '../../games/catalog';
import { useMessages, type Messages } from '../../i18n';
import { PHONE, useMediaQuery } from '../../shell/use-media-query';
import { ChangeSettings } from '../../solo/change-settings';
import { ChallengeCard, challengeLink } from '../../solo/challenge';
import {
  formatDuration,
  readStored,
  writeStored,
} from '../../solo/device-store';
import { SoloLayout } from '../../solo/solo-layout';
import { SoloResult } from '../../solo/solo-result';
import { useClock } from '../../solo/use-clock';
import { useSoloTime } from '../../solo/solo-time';
import { finishEnd, useSoloSounds } from '../../solo/sounds';
import { BoardPanel, PairsGrid } from '../board';
import { BOARDS } from '../boards';
import { derivePairsSolo, PAIRS_SOLO_BANK } from '../sounds';
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

/**
 * The turn bar width under which its hints take a line of their own: the widest
 * of them, that the clock starts with the first card, with a ten-minute run's
 * clock, in either language, needs this much beside its main line, with 4 px to
 * spare for a clock's digits and subpixel text (TurnBar's hintRowBelow).
 */
const HINT_ROW_BELOW = 578;

const LAST_BOARD = 'pairs:board';

const isBoard = (value: string | null): value is PairsBoard =>
  BOARDS.includes(value as PairsBoard);
const isSeed = (value: string | null): value is string =>
  value !== null && SEED_PATTERN.test(value);

/** The board played last on this device, or Small on a first visit. */
function lastBoard(): PairsBoard {
  const last = readStored(LAST_BOARD);
  return isBoard(last) ? last : 'Small';
}

/** "31 turns". */
const turnsLabel = (best: PairsBest, m: Messages) =>
  m.pairs.solo.turnsCount(best.turns);

/**
 * PR02-PR04, PR09: Pairs on your own, straight away on the board played last
 * here. `?board=Large&seed=k3f9x2` is a challenge: the same deck somebody
 * else played. It all runs here: nothing reaches the server.
 */
export function PairsSolo() {
  const [params, setParams] = useSearchParams();
  // Each game is a fresh mount, so nothing carries over from the last.
  const [playing, setPlaying] = useState(() => {
    const board = params.get('board');
    const seed = params.get('seed');
    return isBoard(board) && isSeed(seed)
      ? { board, seed, challenge: true, game: 0 }
      : { board: lastBoard(), seed: newSeed(), challenge: false, game: 0 };
  });
  const next = (board: PairsBoard) => {
    // A challenge is played once; the next game is a new deck.
    if (playing.challenge) setParams({}, { replace: true });
    setPlaying({
      board,
      seed: newSeed(),
      challenge: false,
      game: playing.game + 1,
    });
  };

  return (
    <SoloGameView
      key={playing.game}
      board={playing.board}
      seed={playing.seed}
      challenge={playing.challenge}
      onPlayAgain={() => next(playing.board)}
      onChangeBoard={(board) => {
        writeStored(LAST_BOARD, board);
        next(board);
      }}
    />
  );
}

/** PR01, behind Change board: the boards, each with its best. */
function ChangeBoard({
  board,
  onPlay,
}: {
  board: PairsBoard;
  onPlay: (board: PairsBoard) => void;
}) {
  const m = useMessages();
  return (
    <ChangeSettings
      label={m.pairs.solo.changeBoard}
      title={m.pairs.solo.pickBoard}
      description={m.pairs.solo.description}
      settings={board}
      onPlay={onPlay}
    >
      {(picked, pick) => (
        <ChoiceList
          label={m.pairs.solo.board}
          options={BOARDS.map((option) => {
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
          value={picked}
          onValueChange={pick}
        />
      )}
    </ChangeSettings>
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
  challenge,
  onPlayAgain,
  onChangeBoard,
}: {
  board: PairsBoard;
  seed: string;
  /** Dealt from somebody else's link. */
  challenge: boolean;
  onPlayAgain: () => void;
  onChangeBoard: (board: PairsBoard) => void;
}) {
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  const clock = useSoloTime();
  const [game, setGame] = useState(() => newGame(board, seed));
  const [finish, setFinish] = useState<Finish | null>(null);
  useSoloSounds(game, finish && finishEnd(finish), {
    bank: PAIRS_SOLO_BANK,
    derive: derivePairsSolo,
  });
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
  const bestCard = (
    <Card kind="panel" title={m.pairs.solo.bestOnDevice}>
      <StatList className={styles.stats} stats={bests} />
    </Card>
  );

  return (
    <SoloLayout
      gameType="pairs"
      time={finish ? undefined : clock}
      phase={
        finish
          ? { tone: 'lime', label: m.pairs.solo.boardCleared }
          : {
              tone: 'blue',
              label: challenge ? m.solo.challenge : m.pairs.boardLabel(board),
            }
      }
      stage={
        <>
          <TurnBar
            {...turnBar(game, now, phone, m)}
            hintRowBelow={HINT_ROW_BELOW}
          />
          <BoardPanel fitHeight>
            <PairsGrid
              cards={cardsOf(game)}
              onFlip={finish ? undefined : play}
              inPlay={!finish}
            />
          </BoardPanel>
        </>
      }
      result={
        finish && (
          <SoloResult
            celebrate={finish.isBest}
            title={m.pairs.solo.finishedIn(pairs, turns)}
            body={finishBody(board, turns, finish, m)}
            stats={[
              { label: m.pairs.solo.time, value: formatDuration(timeMs) },
              {
                label: m.pairs.solo.longestStreak,
                value: m.pairs.solo.streak(streak),
              },
            ]}
            actions={
              <>
                <Button onClick={onPlayAgain}>{m.pairs.solo.playAgain}</Button>
                <ChangeBoard board={board} onPlay={onChangeBoard} />
              </>
            }
          />
        )
      }
      side={
        finish ? (
          <>
            {bestCard}
            <ChallengeCard
              description={m.pairs.solo.challengeDescription(turns)}
              text={challengeLink(soloPath('pairs'), { board, seed })}
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
                ]}
              />
            </Card>
            {bestCard}
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
      deadline: false,
    },
  };
  // The last pair: the board stays as it was cleared, under its last turn.
  if (isOver(game)) {
    return { ...base, main: m.pairs.solo.allPairs(pairs) };
  }
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
