import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import type { MinesweeperDifficulty } from '../../../../shared/wire-types';
import { BOARD_SIZES, DIFFICULTIES } from '../../../../shared/minesweeper';
import {
  Button,
  ButtonLink,
  Card,
  ChoiceList,
  StatList,
  TurnBar,
  type MineCellState,
  type TurnBarProps,
} from '../../ui';
import { gameInfo } from '../../games/catalog';
import { useMessages, type Messages } from '../../i18n';
import { FormPage } from '../../shell/form-page';
import { playColumn } from '../../shell/play-board';
import { PHONE, useMediaQuery } from '../../shell/use-media-query';
import { cx } from '../../ui/cx';
import {
  formatDuration,
  readBest,
  readStored,
  recordBest,
  writeStored,
} from '../../solo/device-store';
import { SoloLayout } from '../../solo/solo-layout';
import { SoloResult } from '../../solo/solo-result';
import { useClock } from '../../solo/use-clock';
import { useSoloTime } from '../../solo/solo-time';
import { MineGrid } from '../board';
import {
  cellAt,
  chord,
  elapsed,
  minesLeft,
  clearedCells,
  safeCells,
  newGame,
  reveal,
  toggleFlag,
  type SoloGame,
} from './game';
import styles from './solo-page.module.css';

const LAST_BOARD = 'minesweeper:board';
const bestKey = (difficulty: MinesweeperDifficulty) =>
  `minesweeper:${difficulty}`;

const isDifficulty = (value: string | null): value is MinesweeperDifficulty =>
  DIFFICULTIES.includes(value as MinesweeperDifficulty);

/**
 * MS01-MS05: Minesweeper on your own. Without a board in the address it asks
 * for one; `?board=Medium` plays one. It all runs here: nothing reaches the
 * server.
 */
export function MinesweeperSolo() {
  const [params, setParams] = useSearchParams();
  const board = params.get('board');
  // Each new game is a fresh mount, so nothing carries over from the last.
  const [run, setRun] = useState(0);

  if (!isDifficulty(board)) {
    return (
      <BoardPicker
        onStart={(difficulty) => {
          writeStored(LAST_BOARD, difficulty);
          setParams({ board: difficulty });
        }}
      />
    );
  }
  return (
    <SoloGameView
      key={`${board}:${run}`}
      difficulty={board}
      onPlayAgain={() => setRun((count) => count + 1)}
      onChangeBoard={() => setParams({})}
    />
  );
}

/** MS01: the three boards, each with its best on this device. */
function BoardPicker({
  onStart,
}: {
  onStart: (difficulty: MinesweeperDifficulty) => void;
}) {
  const m = useMessages();
  const game = gameInfo('minesweeper');
  const text = m.games.of[game.type];
  const [difficulty, setDifficulty] = useState<MinesweeperDifficulty>(() => {
    const last = readStored(LAST_BOARD);
    return isDifficulty(last) ? last : 'Small';
  });
  const description = m.minesweeper.solo.description;

  return (
    <FormPage
      heading={{
        eyebrow: m.minesweeper.solo.onYourOwn,
        title: text.name,
        subtitle: text.solo?.summary,
      }}
      phone={{ eyebrow: text.name, subtitle: description }}
      title={m.minesweeper.solo.pickBoard}
      description={description}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onStart(difficulty);
      }}
      actions={
        <>
          <Button type="submit">{m.minesweeper.solo.start}</Button>
          <ButtonLink to="/" variant="secondary" icon="back">
            {m.minesweeper.solo.backToGames}
          </ButtonLink>
        </>
      }
    >
      <ChoiceList
        label={m.minesweeper.solo.board}
        options={DIFFICULTIES.map((board) => {
          const best = readBest(bestKey(board));
          return {
            value: board,
            label: m.minesweeper.boardLabel(board),
            detail: m.minesweeper.solo.boardOption(
              BOARD_SIZES[board].mines,
              best === null
                ? m.minesweeper.solo.noBest
                : m.minesweeper.solo.best(formatDuration(best)),
            ),
          };
        })}
        value={difficulty}
        onValueChange={setDifficulty}
      />
    </FormPage>
  );
}

/** How a won game compares with the best before it. */
type Finish = { time: number; previous: number | null; isBest: boolean };

/** MS02-MS05: one board, from the first click to a win or a mine. */
function SoloGameView({
  difficulty,
  onPlayAgain,
  onChangeBoard,
}: {
  difficulty: MinesweeperDifficulty;
  onPlayAgain: () => void;
  onChangeBoard: () => void;
}) {
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  const [game, setGame] = useState(() => newGame(difficulty));
  const [flagMode, setFlagMode] = useState(false);
  const [finish, setFinish] = useState<Finish | null>(null);
  const clock = useSoloTime();
  const now = useClock(game.status === 'playing' && !clock.paused, clock.now);
  const over = game.status === 'won' || game.status === 'lost';

  const play = (next: SoloGame) => {
    if (next === game) return;
    setGame(next);
    if (next.status === 'won') {
      const time = elapsed(next, clock.now());
      setFinish({ time, ...recordBest(bestKey(difficulty), time) });
    }
  };

  const cell = (index: number) => {
    const shown = cellAt(game, index);
    const state = cellState(shown);
    if (over) return { state };
    const flag = () => play(toggleFlag(game, index));
    if (shown === 'hidden' || shown === 'flag') {
      return {
        state,
        // A flag is lifted, never opened, by a plain click.
        onPick: flagMode
          ? flag
          : shown === 'hidden'
            ? () => play(reveal(game, index, clock.now()))
            : undefined,
        onMark: flag,
      };
    }
    if (typeof shown === 'number' && shown > 0) {
      return { state, onPick: () => play(chord(game, index, clock.now())) };
    }
    return { state };
  };

  const tryAgain = (
    <>
      <Button onClick={onPlayAgain}>{m.minesweeper.solo.tryAgain}</Button>
      <Button variant="secondary" onClick={onChangeBoard}>
        {m.minesweeper.solo.changeBoard}
      </Button>
    </>
  );

  const stage = (
    <>
      {finish ? (
        <SoloResult
          title={m.minesweeper.solo.clearedIn(formatDuration(finish.time))}
          body={finishBody(difficulty, finish, m)}
          stats={[
            {
              label: m.minesweeper.solo.time,
              value: formatDuration(finish.time),
            },
            {
              label: m.minesweeper.solo.board,
              value: m.minesweeper.boardLabel(difficulty),
            },
            { label: m.minesweeper.solo.mines, value: String(game.mines) },
          ]}
          actions={
            <>
              <Button onClick={onPlayAgain}>
                {m.minesweeper.solo.playAgain}
              </Button>
              <Button variant="secondary" onClick={onChangeBoard}>
                {m.minesweeper.solo.changeBoard}
              </Button>
            </>
          }
        />
      ) : (
        <TurnBar {...turnBar(game, now, flagMode, phone, m)} />
      )}
      <div className={cx(styles.boardPanel, playColumn)}>
        <MineGrid
          width={game.width}
          height={game.height}
          cell={cell}
          inPlay={!finish}
        />
        {!over && (
          <div
            className={styles.mode}
            role="group"
            aria-label={m.minesweeper.solo.click}
          >
            <Button
              variant={flagMode ? 'secondary' : 'primary'}
              aria-pressed={!flagMode}
              onClick={() => setFlagMode(false)}
            >
              {m.minesweeper.solo.reveal}
            </Button>
            <Button
              variant={flagMode ? 'primary' : 'secondary'}
              icon="flag"
              aria-pressed={flagMode}
              onClick={() => setFlagMode(true)}
            >
              {m.minesweeper.solo.flag}
            </Button>
          </div>
        )}
        {phone && game.status === 'lost' && (
          <div className={styles.mode}>{tryAgain}</div>
        )}
      </div>
    </>
  );

  return (
    <SoloLayout
      gameType="minesweeper"
      time={over ? undefined : clock}
      phase={
        game.status === 'won'
          ? { tone: 'lime', label: m.minesweeper.solo.boardCleared }
          : { tone: 'blue', label: m.minesweeper.boardLabel(difficulty) }
      }
      stage={stage}
      side={
        <>
          {game.status === 'lost' ? (
            <Card
              kind="panel"
              title={m.minesweeper.solo.tryAgainTitle}
              description={m.minesweeper.solo.newBoard(difficulty)}
              actions={tryAgain}
            />
          ) : (
            game.status !== 'won' && (
              <Card kind="panel" title={m.minesweeper.solo.thisGame}>
                <StatList
                  className={styles.stats}
                  stats={[
                    {
                      label: m.minesweeper.solo.mines,
                      value: String(game.mines),
                    },
                    {
                      label: m.minesweeper.solo.flags,
                      value: String(game.flags.filter(Boolean).length),
                    },
                    {
                      label: m.minesweeper.solo.safeCellsLeft,
                      value: String(safeCells(game) - clearedCells(game)),
                    },
                  ]}
                />
              </Card>
            )
          )}
          <Card kind="panel" title={m.minesweeper.solo.bestOnDevice}>
            <StatList
              className={styles.stats}
              stats={DIFFICULTIES.map((board) => {
                const best = readBest(bestKey(board));
                return {
                  label: m.minesweeper.boardLabel(board),
                  value:
                    best === null
                      ? m.minesweeper.solo.notYet
                      : formatDuration(best),
                  tone:
                    best === null
                      ? 'muted'
                      : board === difficulty && finish?.isBest
                        ? 'green'
                        : undefined,
                };
              })}
            />
          </Card>
        </>
      }
    />
  );
}

function cellState(shown: ReturnType<typeof cellAt>): MineCellState {
  return typeof shown === 'number'
    ? { kind: 'open', adjacent: shown }
    : { kind: shown };
}

function finishBody(
  difficulty: MinesweeperDifficulty,
  finish: Finish,
  m: Messages,
): string {
  if (finish.previous === null) {
    return m.minesweeper.solo.firstClear(difficulty);
  }
  return finish.isBest
    ? m.minesweeper.solo.newBest(difficulty, formatDuration(finish.previous))
    : m.minesweeper.solo.previousBest(
        difficulty,
        formatDuration(finish.previous),
      );
}

function turnBar(
  game: SoloGame,
  now: number,
  flagMode: boolean,
  phone: boolean,
  m: Messages,
): TurnBarProps {
  const countdown = {
    seconds: Math.floor(elapsed(game, now) / 1000),
    label: m.minesweeper.solo.runTime,
    waiting: true,
  };
  if (game.status === 'lost') {
    return {
      label: m.minesweeper.gameOver,
      kind: 'status',
      main: m.minesweeper.solo.hitMine,
      meta: m.minesweeper.solo.cleared(clearedCells(game), safeCells(game)),
      countdown,
    };
  }
  return {
    label: m.minesweeper.solo.clearBoard,
    kind: 'status',
    main: m.minesweeper.solo.minesLeft(minesLeft(game)),
    meta: flagMode
      ? m.minesweeper.solo.flagMode(phone)
      : game.status === 'ready'
        ? m.minesweeper.solo.firstClickSafe
        : phone
          ? m.minesweeper.solo.longPressFlag
          : m.minesweeper.solo.rightClickFlag,
    countdown,
  };
}
