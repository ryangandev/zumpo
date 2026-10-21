import { useEffect, useState, type FormEvent } from 'react';
import {
  boardOf,
  lastStoneOf,
  otherColor,
  pointName,
} from '../../../../shared/gomoku';
import type { GomokuColor } from '../../../../shared/wire-types';
import {
  Button,
  ButtonLink,
  Card,
  SelectField,
  StatList,
  TurnBar,
  type Stat,
  type TurnBarProps,
} from '../../ui';
import { gameInfo } from '../../games/catalog';
import { useMessages, type Messages } from '../../i18n';
import { useSession } from '../../net/session';
import { initialsOf, toneOf } from '../../players/avatar';
import { FormPage } from '../../shell/form-page';
import { PHONE, useMediaQuery } from '../../shell/use-media-query';
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
  stonesOn,
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
 * GM02-GM06, GM17: Gomoku on your own, against the computer. It all runs
 * here: nothing reaches the server.
 */
export function GomokuSolo() {
  // Each game is a fresh mount, so nothing carries over from the last.
  const [playing, setPlaying] = useState<{
    picks: SoloPicks;
    game: number;
  } | null>(null);
  const start = (picks: SoloPicks, game: number) => {
    writePicks(picks);
    setPlaying({ picks, game });
  };
  if (playing === null) return <LevelPicker onStart={(p) => start(p, 0)} />;
  return (
    <SoloBoard
      key={playing.game}
      picks={playing.picks}
      // The colours swap, so the first move takes turns.
      onPlayAgain={() =>
        start(
          { ...playing.picks, color: otherColor(playing.picks.color) },
          playing.game + 1,
        )
      }
      onChangeLevel={() => setPlaying(null)}
    />
  );
}

/** GM02: a level, and your stones. */
function LevelPicker({ onStart }: { onStart: (picks: SoloPicks) => void }) {
  const game = gameInfo('gomoku');
  const m = useMessages();
  const text = m.games.of[game.type];
  const [picks, setPicks] = useState(readPicks);
  const description =
    recordLine(picks, readRecord()[picks.level], m) ??
    m.gomoku.solo.description;
  return (
    <FormPage
      heading={{
        eyebrow: m.solo.onYourOwn,
        title: text.name,
        subtitle: text.solo?.summary,
      }}
      phone={{ eyebrow: text.name, subtitle: description }}
      title={m.gomoku.solo.pickTitle}
      description={description}
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onStart(picks);
      }}
      actions={
        <>
          <Button type="submit">{m.gomoku.solo.start}</Button>
          <ButtonLink to="/" variant="secondary" icon="back">
            {m.shell.backToGames}
          </ButtonLink>
        </>
      }
    >
      <SelectField
        label={m.gomoku.solo.level}
        helper={m.gomoku.solo.levelHelp[picks.level]}
        options={LEVELS.map((level) => ({
          value: level,
          label: m.gomoku.solo.levels[level],
        }))}
        value={picks.level}
        onValueChange={(level) => setPicks({ ...picks, level })}
        name="level"
      />
      <SelectField
        label={m.gomoku.solo.stones}
        helper={m.gomoku.solo.stonesHelp}
        options={(['black', 'white'] as const).map((color) => ({
          value: color,
          label: m.gomoku.solo.stonesOf[color],
        }))}
        value={picks.color}
        onValueChange={(color: GomokuColor) => setPicks({ ...picks, color })}
        name="color"
      />
    </FormPage>
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
  onChangeLevel: () => void;
}) {
  const m = useMessages();
  const { name } = useSession();
  const phone = useMediaQuery(PHONE);
  const [game, setGame] = useState(() => newGame(picks));
  const [record, setRecord] = useState<LevelRecord | null>(null);
  // A first tap on a phone, good only on the move it was made on.
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
  const games = gamesOf(shown);
  const level = m.gomoku.solo.levels[game.level];
  const line = game.winLines?.[0];

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
        <>
          {game.over ? (
            <SoloResult
              title={
                youWon(game)
                  ? m.gomoku.solo.wonOn(game.moves.length)
                  : computerWon(game)
                    ? m.gomoku.solo.lostOn(game.moves.length)
                    : m.gomoku.solo.draw
              }
              body={
                line
                  ? m.gomoku.solo.five(
                      pointName(line[0] ?? 0),
                      pointName(line.at(-1) ?? 0),
                      otherColor(game.color),
                    )
                  : m.gomoku.solo.drawBody(otherColor(game.color))
              }
              stats={[
                { label: m.gomoku.solo.level, value: level },
                {
                  label: m.gomoku.solo.movesLabel,
                  value: String(game.moves.length),
                },
                {
                  label: m.gomoku.solo.gamesWonAt(level),
                  value: m.gomoku.solo.gamesWonCount(shown.wins, games),
                },
              ]}
              actions={
                <>
                  <Button onClick={onPlayAgain}>{m.room.playAgain}</Button>
                  <Button variant="secondary" onClick={onChangeLevel}>
                    {m.gomoku.solo.changeLevel}
                  </Button>
                </>
              }
            />
          ) : (
            <TurnBar {...turnBar(game, m)} />
          )}
          <GomokuTable
            phone={phone}
            board={{
              stones: boardOf(game.moves),
              last: lastStoneOf(game.moves),
              winLines: game.winLines,
              color: yours ? game.color : null,
              pending: previewing,
              disabled: !yours,
              onPlace: place,
              onPreview: phone
                ? (point) => setPreview({ point, at: game.moves.length })
                : undefined,
              label: m.gomoku.board,
            }}
            seats={seatsOf(game, name, m)}
            actions={
              yours && (
                <>
                  {previewing !== null && (
                    <Button onClick={() => place(previewing)}>
                      {m.gomoku.placeStone}
                    </Button>
                  )}
                  {canTakeBack(game) && (
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
                  )}
                  <p className={styles.hint}>
                    {phone ? m.gomoku.tapHint : m.gomoku.hoverHint}
                  </p>
                </>
              )
            }
          />
        </>
      }
      side={
        <>
          {!game.over && (
            <Card kind="panel" title={m.gomoku.solo.thisGame}>
              <StatList
                className={styles.stats}
                stats={[
                  { label: m.gomoku.solo.level, value: level },
                  {
                    label: m.gomoku.solo.youPlay,
                    value: m.gomoku.color(game.color),
                  },
                  {
                    label: m.gomoku.solo.stonesOnBoard,
                    value: String(stonesOn(game)),
                  },
                ]}
              />
            </Card>
          )}
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
        </>
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

/** GM03, GM04: whose turn, and the last stone; your turn has no clock. */
function turnBar(game: SoloGame, m: Messages): TurnBarProps {
  const last = lastStoneOf(game.moves);
  const lastWasYours = game.moves.at(-1)?.color === game.color;
  const meta =
    last === null
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
