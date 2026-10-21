import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  Coordinate,
  DrawAndGuessRoomState,
} from '../../../shared/wire-types';
import {
  brushes,
  DrawingToolbar,
  Icon,
  Notice,
  PlayerRow,
  TurnBar,
  WordChoice,
  type BrushName,
  type BrushSize,
  type TurnBarProps,
} from '../ui';
import { useMessages, type Messages } from '../i18n';
import { initialsOf, toneOf } from '../players/avatar';
import { useSecondsLeft } from '../net/use-seconds-left';
import { playColumn } from '../shell/play-board';
import { focusQuietly } from '../shell/quiet-focus';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import { cx } from '../ui/cx';
import { EndedEarlyPanel, ResultsPanel, WaitingPanel } from '../room/panels';
import { rankedPlayers, type Seat } from '../room/players';
import { useRoomContext, type Room as RoomOf } from '../room/room-context';
import { useTurnTitle } from '../room/use-turn-title';
import { RoomLayout, type PlayerLine } from '../room/room-layout';
import { DrawingCanvas, PlaySheet, type Brush } from '../drawing/canvas';
import styles from './room.module.css';

type Room = RoomOf<DrawAndGuessRoomState>;

/** D01-D15: a Draw & Guess room, before, during and after a game. */
export function DrawAndGuessRoom() {
  const m = useMessages();
  const room = useRoomContext<DrawAndGuessRoomState>();
  const { state } = room;
  const players = rankedPlayers(state);
  const count = players.length;
  const inGame = state.isGameStarted;
  const drawing = inGame && state.phase === 'drawing';
  const isDrawer = inGame && state.currentDrawer === room.playerId;
  const scored = state.scoredThisTurn.includes(room.playerId);

  const between = !inGame;
  const ended = between && state.lastGame;
  // The drawer has a word to choose, then a clock to draw against.
  useTurnTitle(isDrawer && state.phase !== 'reveal');

  return (
    <RoomLayout
      phase={
        inGame
          ? {
              tone: 'blue',
              label: m.drawAndGuess.round(state.currentRound, state.rounds),
            }
          : ended && !ended.endedEarly
            ? { tone: 'lime', label: m.drawAndGuess.gameOver }
            : ended && count < 2
              ? { tone: 'peach', label: m.drawAndGuess.gameEnded }
              : { tone: 'blue', label: m.drawAndGuess.waitingRoom }
      }
      notice={<DrawerAway room={room} />}
      stage={inGame ? <Turn room={room} /> : <BetweenGames room={room} />}
      players={players.map((seat) => playerLine(state, seat, m))}
      chat={{
        placeholder:
          drawing && room.spectating
            ? m.drawAndGuess.spectatorPlaceholder
            : drawing && !isDrawer && !scored
              ? m.drawAndGuess.guessPlaceholder
              : m.drawAndGuess.messagePlaceholder,
        lockedReason: chatLock(state, isDrawer, scored, m),
        // A guesser's turn starts with the keyboard in the guess box.
        focusKey:
          drawing && !isDrawer && !scored && !room.spectating
            ? `${state.currentRound}.${state.turn}`
            : undefined,
      }}
      boardInput={
        inGame && !isDrawer && state.phase !== 'choosing'
          ? drawing && !scored && !room.spectating
            ? m.drawAndGuess.guess
            : m.drawAndGuess.message
          : undefined
      }
      recentChat={inGame}
    />
  );
}

/** D10: the drawer dropped; the turn waits a few seconds for them. */
function DrawerAway({ room }: { room: Room }) {
  const m = useMessages();
  const { state, receivedAt } = room;
  const seconds = useSecondsLeft(state.drawerHoldEndsInMs, receivedAt);
  if (!state.isGameStarted || state.drawerHoldEndsInMs <= 0) return null;
  const drawer =
    state.playerList[state.currentDrawer]?.username ?? m.drawAndGuess.drawer;
  return (
    <Notice tone="pending">
      {m.drawAndGuess.drawerAway(drawer, Math.max(1, seconds))}
    </Notice>
  );
}

function BetweenGames({ room }: { room: Room }) {
  const m = useMessages();
  const { state, startGame, starting } = room;
  const count = Object.keys(state.playerList).length;
  const summary = state.lastGame;

  if (summary && !summary.endedEarly) {
    return (
      <ResultsPanel
        summary={summary}
        detail={m.drawAndGuess.resultsDetail(
          summary.rounds,
          summary.wordCategory,
          summary.turns,
        )}
        onPlayAgain={startGame}
        starting={starting}
      />
    );
  }
  if (summary?.endedEarly && count < 2) return <EndedEarlyPanel />;
  return (
    <WaitingPanel
      aloneTitle={m.drawAndGuess.aloneTitle}
      setup={m.drawAndGuess.setup(count, state.rounds)}
      guestSetup={m.drawAndGuess.guestSetup(count, state.rounds)}
      onStart={startGame}
      starting={starting}
    />
  );
}

/** One player's line on the scoreboard. */
function playerLine(
  state: DrawAndGuessRoomState,
  seat: Seat,
  m: Messages,
): PlayerLine {
  if (!seat.isConnected) {
    return {
      seat,
      status: m.drawAndGuess.away,
      statusIcon: 'away',
      state: 'away',
    };
  }
  if (!state.isGameStarted) return { seat, status: m.drawAndGuess.waiting };

  const isDrawer = seat.playerId === state.currentDrawer;
  const gained = state.turnPoints[seat.playerId] ?? 0;
  const scored = state.scoredThisTurn.includes(seat.playerId);

  switch (state.phase) {
    case 'choosing':
      return isDrawer
        ? {
            seat,
            status: m.drawAndGuess.choosing,
            statusIcon: 'brush',
            state: 'highlight',
          }
        : { seat, status: m.drawAndGuess.waiting };
    case 'drawing':
      if (isDrawer) {
        return {
          seat,
          status: m.drawAndGuess.drawing,
          statusIcon: 'brush',
          state: 'highlight',
        };
      }
      return scored
        ? {
            seat,
            status: m.drawAndGuess.guessed,
            statusIcon: 'check',
            state: 'scored',
          }
        : { seat, status: m.drawAndGuess.guessing };
    case 'reveal':
      if (isDrawer) {
        return {
          seat,
          status: m.drawAndGuess.drewPoints(gained),
          statusIcon: 'brush',
        };
      }
      return scored
        ? {
            seat,
            status: m.drawAndGuess.guessedPoints(gained),
            statusIcon: 'check',
            state: 'scored',
          }
        : { seat, status: m.drawAndGuess.missed };
    default:
      return { seat, status: m.drawAndGuess.waiting };
  }
}

const DEFAULT_COLOUR: BrushName = 'ink';
const DEFAULT_SIZE: BrushSize = 10;

/**
 * Whether the viewer is busy elsewhere and keeps the focus: in a dialog, or
 * part way through a line in the chat. An empty guess box gives it up.
 */
function busy(): boolean {
  const active = document.activeElement;
  const field =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  return (
    (field && active.value !== '') || active?.closest('[role="dialog"]') != null
  );
}

/** D04-D12: the turn bar, then the canvas or the word choices. */
function Turn({ room }: { room: Room }) {
  const m = useMessages();
  const { state, receivedAt, reconnecting, playerId, socket, canvas } = room;
  const phone = useMediaQuery(PHONE);
  const seconds = useSecondsLeft(state.phaseEndsInMs, receivedAt, reconnecting);
  const isDrawer = state.currentDrawer === playerId;
  const drawerName =
    state.playerList[state.currentDrawer]?.username ?? m.drawAndGuess.drawer;
  const [colour, setColour] = useState<BrushName>(DEFAULT_COLOUR);
  const [size, setSize] = useState<BrushSize>(DEFAULT_SIZE);
  const roomId = state.roomId;

  // Every turn starts on a blank sheet, as its drawer begins choosing.
  const choosingTurn = state.phase === 'choosing' ? state.turn : null;
  useEffect(() => {
    if (choosingTurn !== null) canvas.clear();
  }, [choosingTurn, canvas]);

  const canDraw = isDrawer && state.phase === 'drawing' && !reconnecting;
  const brush: Brush | undefined = canDraw
    ? {
        color:
          brushes.find((b) => b.name === colour)?.color ?? brushes[0].color,
        size,
      }
    : undefined;

  const start = useCallback(
    (point: Coordinate, { color, size: width }: Brush) => {
      canvas.start(point, color, width);
      socket.emit('dg:draw:start', roomId, point, color, width);
    },
    [canvas, socket, roomId],
  );
  const move = useCallback(
    (point: Coordinate) => {
      canvas.move(point);
      socket.emit('dg:draw:move', roomId, point);
    },
    [canvas, socket, roomId],
  );
  const end = useCallback(() => {
    canvas.end();
    socket.emit('dg:draw:end', roomId);
  }, [canvas, socket, roomId]);

  const choose = (word: string) => socket.emit('dg:select-word', roomId, word);

  // The drawer's turn begins on the choices: the first takes the focus, so
  // the keyboard and a screen reader start there, even from the guess box of
  // the turn before, unless the drawer is busy elsewhere.
  const choicesBox = useRef<HTMLDivElement>(null);
  const choosing = isDrawer && state.phase === 'choosing';
  const choosingNow = choosing && state.wordChoices ? state.turn : null;
  useEffect(() => {
    if (choosingNow === null) return;
    const first = choicesBox.current?.querySelector('button');
    if (first && !busy()) focusQuietly(first);
  }, [choosingNow]);
  // The choice pressed, or picked when time ran out, goes with the choices:
  // the turn, which now says the word, takes the focus they had.
  const drawingNow = isDrawer && state.phase === 'drawing' ? state.turn : null;
  useEffect(() => {
    if (drawingNow === null) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const turn = document.querySelector<HTMLElement>('[data-start-fallback]');
    if (turn) focusQuietly(turn);
  }, [drawingNow]);

  const choices =
    choosing && state.wordChoices ? (
      <div ref={choicesBox} className={styles.choices}>
        {state.wordChoices.map((word) => (
          <WordChoice key={word} word={word} onChoose={() => choose(word)} />
        ))}
      </div>
    ) : null;

  return (
    <>
      <TurnBar {...turnBar(room, seconds, drawerName, phone, m)} />
      {canDraw && (
        <DrawingToolbar
          colour={colour}
          onColourChange={setColour}
          size={size}
          onSizeChange={setSize}
          onUndo={() => {
            canvas.undo();
            socket.emit('dg:draw:undo', roomId);
          }}
          onClear={() => {
            canvas.clear();
            socket.emit('dg:draw:clear', roomId);
          }}
        />
      )}
      {/* The sheet, and the round that just ended over its foot, where it
          is seen without a scroll and moves nothing; the drawer choosing a
          word sees the choices instead. On a phone the sheet is as large
          as the screen leaves it. */}
      <div className={cx(styles.board, playColumn)}>
        <PlaySheet>
          {choices && phone ? (
            choices
          ) : (
            <DrawingCanvas
              stream={canvas}
              brush={brush}
              onStart={start}
              onMove={move}
              onEnd={end}
              overlay={
                choices ??
                (state.phase === 'choosing' ? (
                  <p className={styles.waiting}>
                    <Icon glyph="brush" size={32} />
                    {m.drawAndGuess.drawingAppears(drawerName)}
                  </p>
                ) : null)
              }
            />
          )}
        </PlaySheet>
        {state.lastRound && !choices && <RoundResults room={room} />}
      </div>
    </>
  );
}

/**
 * What the round that just ended came to, best first, from its last reveal
 * until the next round's first word is chosen.
 */
function RoundResults({ room }: { room: Room }) {
  const m = useMessages();
  const headingId = useId();
  const { state, playerId } = room;
  // Somebody who has left since is not in the room to rank.
  const standings = (state.lastRound?.standings ?? []).filter(
    (standing) => state.playerList[standing.playerId],
  );
  if (!state.lastRound || !standings.length) return null;
  return (
    <section className={styles.roundResults} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.roundResultsTitle}>
        {m.drawAndGuess.roundResults(state.lastRound.round)}
      </h2>
      <ul className={styles.roundResultsList}>
        {standings.map((standing) => (
          <PlayerRow
            key={standing.playerId}
            name={standing.username}
            initials={initialsOf(standing.username)}
            tone={toneOf(standing.username)}
            status={m.drawAndGuess.inAll(
              state.playerList[standing.playerId]!.points,
            )}
            score={standing.points}
            you={standing.playerId === playerId}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * What the turn bar says, for this player, in this phase. On a phone the
 * guess box sits right under the board, so the hint needs no pointer to it.
 */
function turnBar(
  room: Room,
  seconds: number,
  drawerName: string,
  phone: boolean,
  m: Messages,
): TurnBarProps {
  const { state, playerId, reconnecting } = room;
  const isDrawer = state.currentDrawer === playerId;
  const scored = state.scoredThisTurn.includes(playerId);
  const category = m.drawAndGuess.category(state.wordCategory);
  const letters = state.hint.replaceAll(' ', '').length;
  const clock = (label: string, waiting = false) =>
    reconnecting
      ? { seconds, label: m.drawAndGuess.paused, waiting: true }
      : { seconds, label, waiting };

  switch (state.phase) {
    case 'choosing':
      return isDrawer
        ? {
            category,
            label: m.drawAndGuess.yourTurn,
            kind: 'status',
            main: m.drawAndGuess.pickWord,
            meta: m.drawAndGuess.privateChoices,
            countdown: clock(m.drawAndGuess.toChoose),
          }
        : {
            category,
            label: m.drawAndGuess.nextUp,
            kind: 'status',
            main: m.drawAndGuess.choosingWord(drawerName),
            meta: room.spectating
              ? m.room.spectatingTitle
              : m.drawAndGuess.readyToGuess,
            countdown: clock(m.drawAndGuess.toChoose, true),
          };
    case 'drawing':
      if (isDrawer) {
        return {
          category,
          label: state.wordAutoPicked
            ? m.drawAndGuess.autoPicked
            : m.drawAndGuess.drawThis,
          kind: 'word',
          main: state.word ?? '',
          meta: m.drawAndGuess.privateWord,
          countdown: clock(m.drawAndGuess.left),
        };
      }
      return scored
        ? {
            category,
            label: m.drawAndGuess.youGotIt(state.turnPoints[playerId] ?? 0),
            kind: 'hint',
            main: state.hint,
            meta: m.drawAndGuess.waitingOthers,
            countdown: clock(m.drawAndGuess.left),
          }
        : {
            category,
            label: room.spectating
              ? m.room.spectator
              : m.drawAndGuess.guessWord,
            kind: 'hint',
            main: state.hint,
            // A spectator's guess would score nothing, so they are not asked.
            meta: m.drawAndGuess.letters(letters, phone || room.spectating),
            countdown: clock(m.drawAndGuess.left, room.spectating),
          };
    default:
      return {
        category,
        label: m.drawAndGuess.wordWas,
        kind: 'status',
        main: state.word ?? '',
        meta: turnPointsLine(state, m),
        countdown: clock(m.drawAndGuess.nextTurn, true),
      };
  }
}

/** "Maya +74 · Sam +112 · Ryan +72": the drawer, then each guesser. */
function turnPointsLine(state: DrawAndGuessRoomState, m: Messages): string {
  const drawer = state.currentDrawer;
  const scorers = state.scoredThisTurn.filter((id) => id !== drawer);
  if (!scorers.length) return m.drawAndGuess.nobodyGuessed;
  return [drawer, ...scorers]
    .map((id) => {
      const name = state.playerList[id]?.username;
      const points = state.turnPoints[id] ?? 0;
      return name ? m.drawAndGuess.playerPoints(name, points) : null;
    })
    .filter(Boolean)
    .join(' · ');
}

/**
 * Why the viewer cannot talk: anyone who knows the word while it is in play.
 * A scorer stays silent through the review too, as the server enforces.
 */
function chatLock(
  state: DrawAndGuessRoomState,
  isDrawer: boolean,
  scored: boolean,
  m: Messages,
): string | undefined {
  if (isDrawer && state.phase !== 'reveal') {
    return m.drawAndGuess.drawingChatLocked;
  }
  if (scored && state.isGameStarted) return m.drawAndGuess.guessedChatLocked;
  return undefined;
}
