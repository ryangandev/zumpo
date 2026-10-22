import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
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
import { DrawingCanvas, PlaySheet, type Brush } from '../drawing/canvas';
import { playColumn } from '../shell/play-board';
import { cx } from '../ui/cx';
import { Picture } from '../drawing/picture';
import { listNames } from '../room/players';
import { TOUCH, useMediaQuery } from '../shell/use-media-query';
import type { Room as RoomOf } from '../room/room-context';
import { EntryDrawing, textOf } from './chain';
import styles from './task.module.css';

/**
 * The turn bar always gives its hint a line of its own, since its main line
 * is the last player's words (TurnBar's hintRowBelow).
 */
const HINT_ROW_BELOW = Infinity;

type Room = RoomOf<DoodleChainRoomState>;

/** How often, at most, the words being typed reach the server. */
const TEXT_EVERY_MS = 300;

/**
 * What the viewer is making that the server does not echo back, kept by the
 * room above the stage, which a change between phone and desktop remounts.
 */
export interface Desk {
  /** The words last written, and the step they were written in. */
  words: { step: number; draft: DoodleChainDraft } | null;
  colour: BrushName;
  size: BrushSize;
}

/** A desk at the start of a game. */
export const NEW_DESK: Desk = { words: null, colour: 'ink', size: 10 };

interface DeskProps {
  desk: Desk;
  onDesk: (change: Partial<Desk>) => void;
}

/** The words `draft` holds; a suggestion in the viewer's language. */
const wordsOf = (draft: DoodleChainDraft, m: Messages) =>
  'text' in draft
    ? draft.text
    : (m.doodleChain.suggestions[draft.suggestion] ?? '');

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
export function Step({ room, desk, onDesk }: { room: Room } & DeskProps) {
  const { state, receivedAt, reconnecting, canvas } = room;
  const seconds = useSecondsLeft(state.phaseEndsInMs, receivedAt, reconnecting);
  // What the viewer wrote this step, to show while the chains move on.
  const written =
    desk.words?.step === state.step ? desk.words.draft : (state.draft ?? null);

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
      <TurnBar
        {...turnBar(room, task, seconds, m)}
        wordLine
        hintRowBelow={HINT_ROW_BELOW}
      />
      {state.phase === 'draw' && task && !task.sitsOut ? (
        <Drawing room={room} desk={desk} onDesk={onDesk} />
      ) : (
        <section className={cx(styles.panel, playColumn)}>
          {!task ? (
            <Watching room={room} />
          ) : state.phase === 'passing' ? (
            <Passing
              room={room}
              task={task}
              words={written ? wordsOf(written, m) : ''}
            />
          ) : task.sitsOut ? (
            <SitOut room={room} task={task} />
          ) : (
            <Writing
              key={state.step}
              room={room}
              task={task}
              draft={written ?? { text: '' }}
              onDraft={(draft) =>
                onDesk({ words: { step: state.step, draft } })
              }
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

  const skipped = passing && state.stepEnd === 'skipped';
  if (!task) {
    return {
      label,
      kind: 'status',
      main: passing
        ? stepEndLine(state, m)
        : m.doodleChain.everybody[kindNow(state)],
      meta: skipped
        ? m.doodleChain.skippedWhy[kindNow(state)]
        : passing
          ? m.doodleChain.chainsMoveOn
          : m.doodleChain.secret,
      countdown: passing ? clock(next, true) : left,
    };
  }

  const nextName = nextOn(state, task);
  if (passing) {
    return {
      label,
      kind: 'status',
      main: stepEndLine(state, m),
      meta: skipped
        ? m.doodleChain.skippedWhy[task.kind]
        : task.sitsOut
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
      ? m.doodleChain.endsWhenAllDone
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
      // DC07: the header's tag says the step, so the bar has no category.
      return {
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

/**
 * Why the step before the passing ended: its clock ran out, everybody was
 * done early, or nobody had anything to do in it. A step everybody playing
 * left ends plainly, neither done nor out of time.
 */
function stepEndLine(state: DoodleChainRoomState, m: Messages): string {
  switch (state.stepEnd) {
    case 'done':
      return m.doodleChain.everyoneDone;
    case 'skipped':
      return m.doodleChain.stepSkipped;
    case 'left':
      return m.doodleChain.stepOver;
    default:
      return m.doodleChain.timesUp;
  }
}

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
  draft,
  onDraft: setDraft,
}: {
  room: Room;
  task: DoodleChainTask;
  /** The server's draft for a page that arrives mid-step, then the viewer's. */
  draft: DoodleChainDraft;
  onDraft: (draft: DoodleChainDraft) => void;
}) {
  const m = useMessages();
  const { state, playerId, socket } = room;
  const roomId = state.roomId;
  const text = wordsOf(draft, m);
  const done = state.table[playerId]?.done ?? false;
  const { send, flush } = useTextSender(room);
  const prompt = task.kind === 'prompt';
  // A step's field takes the keyboard as the step starts, except under a
  // finger, whose keyboard would cover the drawing being described.
  const touch = useMediaQuery(TOUCH);

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
        <PlaySheet shown>
          <div className={styles.frame}>
            <EntryDrawing
              drawing={task.given.content.drawing}
              label={m.doodleChain.givenDrawing}
            />
          </div>
        </PlaySheet>
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
        autoFocus={!touch}
      />
    </>
  );
}

/** Whether the drawing in progress has no strokes, kept current as it changes. */
function useBlankCanvas(canvas: Room['canvas']): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => canvas.subscribe(onChange),
    [canvas],
  );
  return useSyncExternalStore(subscribe, () => canvas.snapshot().length === 0);
}

/** DC07: drawing the words given, on Draw & Guess's canvas and toolbar. */
function Drawing({ room, desk, onDesk }: { room: Room } & DeskProps) {
  const m = useMessages();
  const { state, playerId, socket, canvas, reconnecting } = room;
  const roomId = state.roomId;
  const { colour, size } = desk;
  const done = state.table[playerId]?.done ?? false;
  const canDraw = !done && !reconnecting;
  // An empty drawing is never Done. Done stays pressable, and pressing it on
  // a blank canvas says why nothing happened, until there is a stroke.
  const blank = useBlankCanvas(canvas);
  const [triedBlank, setTriedBlank] = useState(false);
  if (triedBlank && !blank) setTriedBlank(false);
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
      {/* Out of reach once Done, and kept for its room, so the sheet stays
          where it is. */}
      <div
        className={cx(styles.toolbar, !canDraw && styles.held)}
        aria-hidden={canDraw ? undefined : true}
      >
        <DrawingToolbar
          colour={colour}
          onColourChange={(next) => onDesk({ colour: next })}
          size={size}
          onSizeChange={(next) => onDesk({ size: next })}
          onUndo={() => {
            canvas.undo();
            socket.emit('dc:draw:undo', roomId);
          }}
          onClear={() => {
            canvas.clear();
            socket.emit('dc:draw:clear', roomId);
          }}
        />
      </div>
      <PlaySheet>
        <DrawingCanvas
          stream={canvas}
          brush={brush}
          onStart={start}
          onMove={move}
          onEnd={end}
        />
      </PlaySheet>
      {/* Both rows share one place and the taller one's height, so Done and
          Keep editing never move the sheet above them. */}
      <div ref={actions} className={styles.swap}>
        <div
          className={cx(styles.actions, !done && styles.held)}
          aria-hidden={done ? undefined : true}
        >
          <Notice tone="success" className={styles.grow}>
            {/* Its words arrive with Done, so the status is announced; until
                then they only hold the row's height, out of sight. */}
            {done ? (
              doneMessage(room, m)
            ) : (
              <span aria-hidden="true">{doneMessage(room, m)}</span>
            )}
          </Notice>
          <Button
            ref={keepEditing}
            variant="secondary"
            icon="edit"
            disabled={!done}
            onClick={() => socket.emit('dc:done', roomId, false)}
          >
            {m.ui.chain.keepEditing}
          </Button>
        </div>
        <div
          className={cx(styles.actions, done && styles.held)}
          aria-hidden={done ? true : undefined}
        >
          {/* Done stays pressable: on a blank canvas it says why it sent
              nothing, in this live row only, never in the held copy. */}
          <p
            className={cx(styles.hint, triedBlank && styles.hintError)}
            role="status"
          >
            {triedBlank ? m.doodleChain.drawFirst : m.doodleChain.asItIs}
          </p>
          {!reconnecting && (
            <Button
              ref={doneButton}
              icon="check"
              disabled={done}
              onClick={() =>
                blank
                  ? setTriedBlank(true)
                  : socket.emit('dc:done', roomId, true)
              }
            >
              {m.ui.chain.done}
            </Button>
          )}
        </div>
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
