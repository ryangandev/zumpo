import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DESCRIBE_SECONDS,
  kindOf,
  placeAt,
  SUGGESTION_COUNT,
  TEXT_MAX,
  WRITE_SECONDS,
} from '../../../shared/doodle-chain';
import type {
  Coordinate,
  DoodleChainDraft,
  DoodleChainRoomState,
  DoodleChainTask,
} from '../../../shared/wire-types';
import {
  brushes,
  Button,
  ChainComposer,
  DrawingToolbar,
  Notice,
  TurnBar,
  useFocusFollows,
  type BrushName,
  type BrushSize,
  type TurnBarProps,
} from '../ui';
import { useMessages, type Messages } from '../i18n';
import { useSecondsLeft } from '../net/use-seconds-left';
import { DrawingCanvas, type Brush } from '../drawing/canvas';
import { Picture } from '../drawing/picture';
import { listNames } from '../room/players';
import type { Room as RoomOf } from '../room/room-context';
import { EntryDrawing, textOf } from './chain';
import styles from './task.module.css';

type Room = RoomOf<DoodleChainRoomState>;

/** How often, at most, the words being typed reach the server. */
const TEXT_EVERY_MS = 300;

const DEFAULT_COLOUR: BrushName = 'ink';
const DEFAULT_SIZE: BrushSize = 10;

/** The name of whoever is at `place` in the order, counted round it. */
function nameAt(state: DoodleChainRoomState, place: number): string {
  const count = state.order.length;
  return state.order[((place % count) + count) % count]?.username ?? '';
}

/**
 * Who works on `task`'s chain next step: null after the last, and undefined
 * when they have left, so the chain skips them.
 */
function nextOn(
  state: DoodleChainRoomState,
  task: DoodleChainTask,
): string | null | undefined {
  if (state.step >= state.steps) return null;
  const next =
    state.order[placeAt(task.chain, state.step + 1, state.order.length)];
  return next && state.playerList[next.playerId] ? next.username : undefined;
}

/** The players this step still waits for, the viewer aside. */
function waitingFor(room: Room): string[] {
  const { state, playerId } = room;
  return state.order
    .filter(({ playerId: id }) => {
      const seat = state.table[id];
      return id !== playerId && seat && !seat.sitsOut && !seat.done;
    })
    .map(({ username }) => username);
}

/** DC05-DC11, DC15-DC18: a step, from the turn bar down. */
export function Step({ room }: { room: Room }) {
  const { state, receivedAt, reconnecting, canvas } = room;
  const seconds = useSecondsLeft(state.phaseEndsInMs, receivedAt, reconnecting);
  // What the viewer last wrote, to show while the chains move on.
  const [words, setWords] = useState('');

  // Every drawing starts on a blank sheet. A page that arrives mid-step is
  // sent its drawing so far instead, so only a step seen starting clears it.
  const seen = useRef(state.step);
  useEffect(() => {
    if (seen.current === state.step) return;
    seen.current = state.step;
    if (state.phase === 'draw') canvas.clear();
  }, [state.step, state.phase, canvas]);

  const m = useMessages();
  const task = room.spectating ? undefined : state.task;
  return (
    <>
      <TurnBar {...turnBar(room, task, seconds, m)} />
      {state.phase === 'draw' && task && !task.sitsOut ? (
        <Drawing room={room} />
      ) : (
        <section className={styles.panel}>
          {!task ? (
            <Watching room={room} />
          ) : state.phase === 'passing' ? (
            <Passing room={room} task={task} words={words} />
          ) : task.sitsOut ? (
            <SitOut room={room} task={task} />
          ) : (
            <Writing
              key={state.step}
              room={room}
              task={task}
              onWords={setWords}
            />
          )}
        </section>
      )}
    </>
  );
}

function turnBar(
  room: Room,
  task: DoodleChainTask | undefined,
  seconds: number,
  m: Messages,
): TurnBarProps {
  const { state, playerId, reconnecting } = room;
  const label = m.doodleChain.stepOf(state.step, state.steps);
  const passing = state.phase === 'passing';
  const clock = (forWhat: string, waiting: boolean) =>
    reconnecting
      ? { seconds, label: m.doodleChain.paused, waiting: true }
      : { seconds, label: forWhat, waiting };
  const left = clock(m.doodleChain.left, false);
  const next =
    state.step < state.steps
      ? m.doodleChain.toStep(state.step + 1)
      : m.doodleChain.toReveal;

  if (!task) {
    return {
      label,
      kind: 'status',
      main: passing
        ? m.doodleChain.timesUp
        : m.doodleChain.everybody[kindNow(state)],
      meta: passing ? m.doodleChain.chainsMoveOn : m.doodleChain.secret,
      countdown: passing ? clock(next, true) : left,
    };
  }

  const nextName = nextOn(state, task);
  if (passing) {
    return {
      label,
      kind: 'status',
      main: m.doodleChain.timesUp,
      meta: task.sitsOut
        ? m.doodleChain.chainsMoveOn
        : nextName
          ? m.doodleChain.goesOn[task.kind](nextName)
          : nextName === null
            ? m.doodleChain.revealNext
            : m.doodleChain.chainsMoveOn,
      countdown: clock(next, true),
    };
  }
  if (task.sitsOut) {
    return {
      label,
      kind: 'status',
      main: m.doodleChain.sitOut,
      meta:
        state.step < state.steps
          ? m.doodleChain.backIn(state.step + 1)
          : m.doodleChain.revealNext,
      countdown: clock(m.doodleChain.left, true),
    };
  }

  const waiting = waitingFor(room);
  const done = state.table[playerId]?.done ?? false;
  const meta =
    done && waiting.length > 0
      ? m.doodleChain.waitingFor(listNames(waiting, m))
      : nextName === undefined
        ? m.doodleChain.secret
        : nextName === null
          ? m.doodleChain.lastStep
          : task.kind === 'prompt'
            ? m.doodleChain.drawsNext(nextName)
            : task.kind === 'drawing'
              ? m.doodleChain.describesNext(nextName)
              : m.doodleChain.drawsYoursNext(nextName);

  switch (task.kind) {
    case 'prompt':
      return {
        label,
        kind: 'status',
        main: m.doodleChain.writeFirst,
        meta,
        countdown: left,
      };
    case 'drawing':
      return {
        category: label,
        label: m.doodleChain.drawThis,
        kind: 'word',
        main: task.given ? textOf(task.given.content, m) : '',
        meta,
        countdown: left,
      };
    case 'description':
      return {
        label,
        kind: 'status',
        main: m.doodleChain.whatDoesItShow,
        meta,
        countdown: left,
      };
  }
}

/** What everybody is making this step. */
const kindNow = (state: DoodleChainRoomState) => kindOf(state.step);

/** "Done. Waiting for Leo and Sam.", or that nobody is left to wait for. */
function doneMessage(room: Room, m: Messages) {
  const waiting = waitingFor(room);
  return waiting.length > 0
    ? m.doodleChain.doneWaiting(listNames(waiting, m))
    : m.doodleChain.doneAll;
}

/**
 * Sends the latest words at most every `TEXT_EVERY_MS`, the first at once,
 * so the server always holds close to what is typed when the clock runs out.
 */
function useTextSender(room: Room) {
  const { socket, state } = room;
  const roomId = state.roomId;
  const pending = useRef<DoodleChainDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current) socket.emit('dc:text', roomId, pending.current);
    pending.current = null;
  }, [socket, roomId]);

  const send = useCallback(
    (draft: DoodleChainDraft) => {
      if (timer.current) {
        pending.current = draft;
        return;
      }
      socket.emit('dc:text', roomId, draft);
      const tick = () => {
        if (pending.current) {
          socket.emit('dc:text', roomId, pending.current);
          pending.current = null;
          timer.current = setTimeout(tick, TEXT_EVERY_MS);
        } else {
          timer.current = null;
        }
      };
      timer.current = setTimeout(tick, TEXT_EVERY_MS);
    },
    [socket, roomId],
  );

  // A step that ends takes its words as the server has them.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { send, flush };
}

/** DC05, DC06, DC08: writing the first line, or what a drawing shows. */
function Writing({
  room,
  task,
  onWords,
}: {
  room: Room;
  task: DoodleChainTask;
  onWords: (words: string) => void;
}) {
  const m = useMessages();
  const { state, playerId, socket } = room;
  const roomId = state.roomId;
  // The server's draft is where a page that arrives mid-step starts from;
  // after that, the field is the viewer's.
  const [draft, setDraft] = useState<DoodleChainDraft>(
    () => state.draft ?? { text: '' },
  );
  const text =
    'text' in draft
      ? draft.text
      : (m.doodleChain.suggestions[draft.suggestion] ?? '');
  const done = state.table[playerId]?.done ?? false;
  const { send, flush } = useTextSender(room);
  const prompt = task.kind === 'prompt';

  useEffect(() => onWords(text), [text, onWords]);

  const change = (next: string) => {
    const words = Array.from(next).slice(0, TEXT_MAX).join('');
    setDraft({ text: words });
    send({ text: words });
  };
  const suggest = () => {
    const current = 'suggestion' in draft ? draft.suggestion : -1;
    let pick = Math.floor(Math.random() * (SUGGESTION_COUNT - 1));
    if (pick >= current && current >= 0) pick += 1;
    setDraft({ suggestion: pick });
    send({ suggestion: pick });
  };

  return (
    <>
      {task.given?.content.type === 'drawing' && (
        <div className={styles.frame}>
          <EntryDrawing
            drawing={task.given.content.drawing}
            label={m.doodleChain.givenDrawing}
          />
        </div>
      )}
      <ChainComposer
        className={styles.composer}
        label={prompt ? m.doodleChain.firstLine : m.doodleChain.yourDescription}
        helper={
          prompt
            ? m.doodleChain.promptHelper(Array.from(text).length, TEXT_MAX)
            : m.doodleChain.descriptionHelper(Array.from(text).length, TEXT_MAX)
        }
        value={text}
        onValueChange={change}
        done={done}
        doneMessage={doneMessage(room, m)}
        onDone={() => {
          flush();
          socket.emit('dc:done', roomId, true);
        }}
        onKeepEditing={() => socket.emit('dc:done', roomId, false)}
        onSuggest={prompt ? suggest : undefined}
      />
    </>
  );
}

/** DC07: drawing the words given, on Draw & Guess's canvas and toolbar. */
function Drawing({ room }: { room: Room }) {
  const m = useMessages();
  const { state, playerId, socket, canvas, reconnecting } = room;
  const roomId = state.roomId;
  const [colour, setColour] = useState<BrushName>(DEFAULT_COLOUR);
  const [size, setSize] = useState<BrushSize>(DEFAULT_SIZE);
  const done = state.table[playerId]?.done ?? false;
  const canDraw = !done && !reconnecting;
  const actions = useRef<HTMLDivElement>(null);
  const doneButton = useRef<HTMLButtonElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  // The canvas takes no focus, so Keep editing hands it back to Done.
  useFocusFollows(done, actions, keepEditing, doneButton);
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
      socket.emit('dc:draw:start', roomId, point, color, width);
    },
    [canvas, socket, roomId],
  );
  const move = useCallback(
    (point: Coordinate) => {
      canvas.move(point);
      socket.emit('dc:draw:move', roomId, point);
    },
    [canvas, socket, roomId],
  );
  const end = useCallback(() => {
    canvas.end();
    socket.emit('dc:draw:end', roomId);
  }, [canvas, socket, roomId]);

  return (
    <>
      {canDraw && (
        <DrawingToolbar
          colour={colour}
          onColourChange={setColour}
          size={size}
          onSizeChange={setSize}
          onUndo={() => {
            canvas.undo();
            socket.emit('dc:draw:undo', roomId);
          }}
          onClear={() => {
            canvas.clear();
            socket.emit('dc:draw:clear', roomId);
          }}
        />
      )}
      <DrawingCanvas
        stream={canvas}
        brush={brush}
        onStart={start}
        onMove={move}
        onEnd={end}
      />
      <div ref={actions} className={styles.actions}>
        {done ? (
          <>
            <Notice tone="success" className={styles.grow}>
              {doneMessage(room, m)}
            </Notice>
            <Button
              ref={keepEditing}
              variant="secondary"
              icon="edit"
              onClick={() => socket.emit('dc:done', roomId, false)}
            >
              {m.ui.chain.keepEditing}
            </Button>
          </>
        ) : (
          <>
            <p className={styles.hint}>{m.doodleChain.asItIs}</p>
            {!reconnecting && (
              <Button
                ref={doneButton}
                icon="check"
                onClick={() => socket.emit('dc:done', roomId, true)}
              >
                {m.ui.chain.done}
              </Button>
            )}
          </>
        )}
      </div>
    </>
  );
}

/** DC09: time is up; what the viewer made goes on as it is. */
function Passing({
  room,
  task,
  words,
}: {
  room: Room;
  task: DoodleChainTask;
  words: string;
}) {
  const m = useMessages();
  const { state, canvas } = room;
  const strokes = canvas.snapshot();
  const last = state.step >= state.steps;
  return (
    <>
      {!task.sitsOut &&
        (task.kind === 'drawing'
          ? strokes.length > 0 && (
              <div className={styles.frame}>
                <Picture strokes={strokes} label={m.doodleChain.yourDrawing} />
              </div>
            )
          : words.trim() && <p className={styles.words}>{words.trim()}</p>)}
      <Notice tone="pending" className={styles.notice}>
        {last
          ? m.doodleChain.passingToReveal
          : m.doodleChain.passing[kindOf(state.step + 1)]}
      </Notice>
    </>
  );
}

/** DC10: the entry before came back empty, so this chain skips a step. */
function SitOut({ room, task }: { room: Room; task: DoodleChainTask }) {
  const m = useMessages();
  const { state } = room;
  const kind = task.kind === 'drawing' ? 'drawing' : 'description';
  const skipped = task.skipped;
  const owner = nameAt(state, task.chain);
  return (
    <>
      <div className={styles.nothing}>
        <p className={styles.nothingTitle}>{m.doodleChain.nothingTo[kind]}</p>
        <p className={styles.nothingDetail}>
          {m.doodleChain.cameBackEmpty[kind]}
        </p>
      </div>
      {skipped?.content.type === 'empty' && (
        <Notice className={styles.notice}>
          {m.doodleChain.skipped(
            skipped.author.username,
            skipped.content.reason,
            owner,
            nextOn(state, task),
          )}
        </Notice>
      )}
    </>
  );
}

/** DC11: a spectator sees how far the step is, and nothing of any chain. */
function Watching({ room }: { room: Room }) {
  const m = useMessages();
  const { state } = room;
  const seats = Object.values(state.table).filter((seat) => !seat.sitsOut);
  const done = seats.filter((seat) => seat.done).length;
  const kind = kindNow(state);
  const seconds =
    kind === 'prompt'
      ? WRITE_SECONDS
      : kind === 'drawing'
        ? state.drawingSeconds
        : DESCRIBE_SECONDS;
  return (
    <p className={styles.progress}>
      <span className={styles.progressTitle}>
        {m.doodleChain.doneOf(done, seats.length)}
      </span>
      <span className={styles.progressDetail}>
        {m.doodleChain.stepKind[kind](seconds)}
      </span>
    </p>
  );
}
