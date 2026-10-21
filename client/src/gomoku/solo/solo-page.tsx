import { useEffect, useState } from 'react';
import {
  boardOf,
  lastStoneOf,
  otherColor,
  pointName,
} from '../../../../shared/gomoku';
import type { GomokuColor } from '../../../../shared/wire-types';
import {
  Button,
  Card,
  ChipField,
  StatList,
  TurnBar,
  type Stat,
  type TurnBarProps,
} from '../../ui';
import { useMessages, type Messages } from '../../i18n';
import { useSession } from '../../net/session';
import { initialsOf, toneOf } from '../../players/avatar';
import { PHONE, TOUCH, useMediaQuery } from '../../shell/use-media-query';
import { ChangeSettings } from '../../solo/change-settings';
import { SoloLayout } from '../../solo/solo-layout';
import { SoloResult } from '../../solo/solo-result';
import { GomokuTable, type SeatView } from '../table';
import { LEVELS, THINKING_MS } from './computer';
import {
  canTakeBack,
  computerWon,
  isYourTurn,
  newGame,
  play,
  takeBack,
  toMove,
  youWon,
  type SoloGame,
  type SoloPicks,
} from './game';
import {
  gamesOf,
  readPicks,
  readRecord,
  recordGame,
  writePicks,
  type LevelRecord,
} from './record';
import { think } from './think';
import styles from './solo-page.module.css';

/** "At Medium you have won 4 of 9 games.", or nothing before the first. */
function recordLine(
  picks: SoloPicks,
  record: LevelRecord,
  m: Messages,
): string | null {
  const games = gamesOf(record);
  if (games === 0) return null;
  return m.gomoku.solo.record(
    m.gomoku.solo.levels[picks.level],
    record.wins,
    games,
    record.run,
  );
}

/**
 * GM03-GM06, GM17: Gomoku on your own, against the computer, straight away at
 * the level and with the stones picked last here. It all runs here: nothing
 * reaches the server.
 */
export function GomokuSolo() {
  // Each game is a fresh mount, so nothing carries over from the last.
  const [playing, setPlaying] = useState(() => ({
    picks: readPicks(),
    game: 0,
  }));
  const start = (picks: SoloPicks) => {
    writePicks(picks);
    setPlaying({ picks, game: playing.game + 1 });
  };
  return (
    <SoloBoard
      key={playing.game}
      picks={playing.picks}
      // The colours swap, so the first move takes turns.
      onPlayAgain={() =>
        start({ ...playing.picks, color: otherColor(playing.picks.color) })
      }
      onChangeLevel={start}
    />
  );
}

/** GM02, behind Change level: a level, and your stones. */
function ChangeLevel({
  picks,
  onPlay,
}: {
  picks: SoloPicks;
  onPlay: (picks: SoloPicks) => void;
}) {
  const m = useMessages();
  const record = readRecord();
  return (
    <ChangeSettings
      label={m.gomoku.solo.changeLevel}
      title={m.gomoku.solo.pickTitle}
      description={
        recordLine(picks, record[picks.level], m) ?? m.gomoku.solo.description
      }
      settings={picks}
      onPlay={onPlay}
    >
      {(picked, pick) => (
        <>
          <ChipField
            label={m.gomoku.solo.level}
            helper={m.gomoku.solo.levelHelp[picked.level]}
            options={LEVELS.map((level) => ({
              value: level,
              label: m.gomoku.solo.levels[level],
            }))}
            value={picked.level}
            onValueChange={(level) => pick({ ...picked, level })}
          />
          <ChipField
            label={m.gomoku.solo.stones}
            helper={m.gomoku.solo.stonesOf[picked.color]}
            options={(['black', 'white'] as const).map((color) => ({
              value: color,
              label: m.gomoku.color(color),
            }))}
            value={picked.color}
            onValueChange={(color: GomokuColor) => pick({ ...picked, color })}
          />
        </>
      )}
    </ChangeSettings>
  );
}

/** GM03-GM06: one game, from the first stone to a five or a full board. */
function SoloBoard({
  picks,
  onPlayAgain,
  onChangeLevel,
}: {
  picks: SoloPicks;
  onPlayAgain: () => void;
  onChangeLevel: (picks: SoloPicks) => void;
}) {
  const m = useMessages();
  const { name } = useSession();
  const phone = useMediaQuery(PHONE);
  // A tap shows the stone first, and a second places it, wherever there is
  // no hover to show it: on a phone, or a touch screen such as one on its
  // side.
  const tapTwice = useMediaQuery(TOUCH) || phone;
  const [game, setGame] = useState(() => newGame(picks));
  const [record, setRecord] = useState<LevelRecord | null>(null);
  // A first tap, good only on the move it was made on.
  const [preview, setPreview] = useState<{ point: number; at: number } | null>(
    null,
  );
  const yours = isYourTurn(game);
  const previewing =
    yours && preview?.at === game.moves.length ? preview.point : null;

  /** Moves the game on, counting it on this device once it is over. */
  const advance = (next: SoloGame) => {
    setGame(next);
    if (next.over && !game.over) setRecord(countGame(next));
  };

  // The computer takes half a second at least, so its stone is seen landing.
  // A game left mid-thought, for the next one or the picks, stops its search.
  useEffect(() => {
    if (game.over || isYourTurn(game)) return;
    const thinking = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    void think(game.moves, toMove(game), game.level, thinking.signal).then(
      (point) => {
        // Worked out here, the move can land after the game was left.
        if (thinking.signal.aborted) return;
        timer = setTimeout(
          () => {
            const next = play(game, point);
            setGame(next);
            if (next.over) setRecord(countGame(next));
          },
          Math.max(0, THINKING_MS - (Date.now() - started)),
        );
      },
      (error: unknown) => {
        if (!thinking.signal.aborted) throw error;
      },
    );
    return () => {
      thinking.abort();
      clearTimeout(timer);
    };
  }, [game]);

  const place = (point: number) => {
    if (!isYourTurn(game)) return;
    setPreview(null);
    advance(play(game, point));
  };

  const shown = record ?? readRecord()[game.level];
  const level = m.gomoku.solo.levels[game.level];

  const takeBackButton = (
    <Button
      variant="secondary"
      icon="undo"
      onClick={() => {
        setPreview(null);
        setGame(takeBack(game));
      }}
    >
      {m.gomoku.solo.takeBack}
    </Button>
  );
  return (
    <SoloLayout
      gameType="gomoku"
      phase={
        !game.over
          ? { tone: 'blue', label: m.gomoku.solo.move(game.moves.length + 1) }
          : youWon(game)
            ? { tone: 'lime', label: m.gomoku.solo.youWon }
            : computerWon(game)
              ? { tone: 'peach', label: m.gomoku.solo.computerWon }
              : { tone: 'sand', label: m.gomoku.solo.drawTag }
      }
      stage={
        <GomokuTable
          phone={phone}
          fill={phone && !game.over}
          fitHeight
          turn={<TurnBar {...turnBar(game, previewing !== null, m)} />}
          board={{
            stones: boardOf(game.moves),
            last: lastStoneOf(game.moves),
            winLines: game.winLines,
            color: yours ? game.color : null,
            pending: previewing,
            disabled: !yours,
            onPlace: place,
            onPreview: tapTwice
              ? (point) => setPreview({ point, at: game.moves.length })
              : undefined,
            label: m.gomoku.board,
          }}
          seats={seatsOf(game, name, m)}
          actions={
            tapTwice
              ? // Place stone is always there in a game, live once a faint
                // stone is down, so nothing moves when one is; the turn bar
                // says to tap again.
                !game.over && (
                  <>
                    <Button
                      disabled={previewing === null}
                      onClick={() => {
                        if (previewing !== null) place(previewing);
                      }}
                    >
                      {m.gomoku.placeStone}
                    </Button>
                    {yours && canTakeBack(game) && takeBackButton}
                  </>
                )
              : yours && (
                  <>
                    {canTakeBack(game) && takeBackButton}
                    <p className={styles.hint}>{m.gomoku.hoverHint}</p>
                  </>
                )
          }
        />
      }
      result={
        game.over && (
          <SoloResult
            title={
              youWon(game)
                ? m.gomoku.solo.wonOn(game.moves.length)
                : computerWon(game)
                  ? m.gomoku.solo.lostOn(game.moves.length)
                  : m.gomoku.solo.draw
            }
            body={m.gomoku.solo.nextGame(otherColor(game.color))}
            actions={
              <>
                <Button onClick={onPlayAgain}>{m.room.playAgain}</Button>
                <ChangeLevel picks={picks} onPlay={onChangeLevel} />
              </>
            }
          />
        )
      }
      side={
        <Card kind="panel" title={m.gomoku.solo.onDevice}>
          <StatList
            className={styles.stats}
            stats={deviceStats(
              shown,
              level,
              record !== null && youWon(game),
              m,
            )}
          />
        </Card>
      }
    />
  );
}

/** Counts a finished game on this device, and returns its level's record. */
const countGame = (game: SoloGame): LevelRecord =>
  recordGame(
    game.level,
    youWon(game) ? 'won' : computerWon(game) ? 'lost' : 'draw',
  );

/** Your record at this level: games won, and the run of wins. */
function deviceStats(
  record: LevelRecord,
  level: string,
  justWon: boolean,
  m: Messages,
): Stat[] {
  const games = gamesOf(record);
  const none = { value: m.gomoku.solo.notYet, tone: 'muted' as const };
  return [
    {
      label: m.gomoku.solo.gamesWonAt(level),
      ...(games === 0
        ? none
        : { value: m.gomoku.solo.gamesWonCount(record.wins, games) }),
    },
    {
      label: m.gomoku.solo.currentRun,
      ...(games === 0
        ? none
        : {
            value: m.gomoku.solo.wins(record.run),
            tone: justWon ? ('green' as const) : undefined,
          }),
    },
  ];
}

/** You and the computer, Black's seat first. */
function seatsOf(game: SoloGame, yourName: string, m: Messages): SeatView[] {
  const turn = game.over ? null : toMove(game);
  const computer = m.gomoku.solo.computer;
  const you: SeatView = {
    key: 'you',
    name: yourName,
    avatar: { initials: initialsOf(yourName), tone: toneOf(yourName) },
    color: game.color,
    detail: m.gomoku.seat(
      game.color,
      turn === game.color
        ? m.gomoku.notes.yourTurn
        : youWon(game)
          ? m.gomoku.notes.five
          : undefined,
    ),
    state: turn === game.color ? 'turn' : youWon(game) ? 'won' : 'default',
    you: true,
  };
  const theirs = otherColor(game.color);
  const them: SeatView = {
    key: 'computer',
    name: computer,
    avatar: { initials: initialsOf(computer), tone: 'coral' },
    color: theirs,
    detail: m.gomoku.seat(
      theirs,
      turn === theirs
        ? m.gomoku.solo.thinking
        : computerWon(game)
          ? m.gomoku.notes.five
          : m.gomoku.solo.levels[game.level],
    ),
    state: turn === theirs ? 'turn' : computerWon(game) ? 'won' : 'default',
  };
  return game.color === 'black' ? [you, them] : [them, you];
}

/**
 * GM03-GM06: whose turn, and the last stone; your turn has no clock. A
 * finished game says who made five, and where, over the board that shows it.
 */
function turnBar(
  game: SoloGame,
  previewing: boolean,
  m: Messages,
): TurnBarProps {
  if (game.over) {
    const line = game.winLines?.[0];
    return {
      label: m.gomoku.gameOver,
      kind: 'status',
      main: youWon(game)
        ? m.gomoku.solo.youMadeFive
        : computerWon(game)
          ? m.gomoku.solo.computerMadeFive
          : m.gomoku.solo.noFive,
      meta: line
        ? m.gomoku.solo.fromTo(
            pointName(line[0] ?? 0),
            pointName(line.at(-1) ?? 0),
          )
        : undefined,
    };
  }
  const last = lastStoneOf(game.moves);
  const lastWasYours = game.moves.at(-1)?.color === game.color;
  const meta = previewing
    ? m.gomoku.tapAgain
    : last === null
      ? m.gomoku.firstMove
      : lastWasYours
        ? m.gomoku.youPlayed(pointName(last))
        : m.gomoku.solo.computerPlayed(pointName(last));
  return isYourTurn(game)
    ? {
        label: m.gomoku.yourTurn,
        kind: 'status',
        main: m.gomoku.place(game.color),
        meta,
      }
    : {
        label: m.gomoku.solo.computersTurn,
        kind: 'status',
        main: m.gomoku.solo.computerThinking,
        meta,
      };
}
