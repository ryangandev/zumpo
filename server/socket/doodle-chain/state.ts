import type {
  CanvasStroke,
  DoodleChainContent,
  DoodleChainEntry,
  DoodleChainGameSummary,
  DoodleChainKind,
  DoodleChainLobbyRoomInfo,
  DoodleChainPhase,
  DoodleChainPlayer,
  DoodleChainRoomState,
  DoodleChainSeat,
  DoodleChainSettings,
  DoodleChainStepEnd,
  DoodleChainTask,
  RoomCanvas,
} from '../../models/types.js';
import { lobbyBasics, roomBasics, seatCount } from '../../libs/rooms/seats.js';
import type { Room } from '../../libs/rooms/types.js';
import { getRemainingPhaseMs } from '../../libs/utils.js';
import { kindOf, stepsFor } from '../../../shared/doodle-chain.js';

/** An entry as the server keeps it; its hearts are counted when it is sent. */
interface StoredEntry {
  chain: number;
  step: number;
  kind: DoodleChainKind;
  author: DoodleChainPlayer;
  content: DoodleChainContent;
}

/** A player's part in the step being played. */
interface StepTask {
  chain: number;
  sitsOut: boolean;
}

/**
 * What a player has made so far this step, kept as they make it, so that
 * whatever is there when the clock runs out is their entry.
 */
interface Work {
  text: string;
  /** A suggestion's number, until the words are their own. */
  suggestion: number | null;
  canvas: RoomCanvas;
}

/** Everything Doodle Chain knows that no other game would. */
interface DoodleChainState {
  /** The room's drawing time, as it was created. */
  drawingSeconds: number;
  phase: DoodleChainPhase;
  /** The step being played, from 1; 0 between games. */
  step: number;
  steps: number;
  /** Games started in this room, which keeps drawing ids apart between games. */
  game: number;
  /** The order of play, fixed when a game starts; those who leave stay in it. */
  order: DoodleChainPlayer[];
  /** Each chain's entries so far, by the place of the player who started it. */
  chains: StoredEntry[][];
  /**
   * Every finished drawing, by id. Never in a snapshot: each is sent once, by
   * `dc:drawing`, to whoever may see it.
   */
  drawings: Map<string, CanvasStroke[]>;
  /** This step's task for every player in the order, by player id. */
  tasks: Map<string, StepTask>;
  /** This step's work so far, by player id. */
  work: Map<string, Work>;
  /** Who has pressed Done this step. */
  done: Set<string>;
  /** Why the last step ended, said while the chains pass on. */
  stepEnd: DoodleChainStepEnd;
  /** While the reveal is on: the chain on show, and how many of its entries. */
  reveal: { chain: number; shown: number } | null;
  /** Each chain's hearts: by chain, the step each player hearted, by player id. */
  hearts: Map<number, Map<string, number>>;
  /** Too few were left to play every step; the album says so. */
  endedEarly: boolean;
  lastGame: DoodleChainGameSummary | null;
}

const createState = ({
  drawingSeconds,
}: DoodleChainSettings): DoodleChainState => ({
  drawingSeconds,
  phase: 'waiting',
  step: 0,
  steps: 0,
  game: 0,
  order: [],
  chains: [],
  drawings: new Map(),
  tasks: new Map(),
  work: new Map(),
  done: new Set(),
  stepEnd: 'time',
  reveal: null,
  hearts: new Map(),
  endedEarly: false,
  lastGame: null,
});

const createWork = (): Work => ({
  text: '',
  suggestion: null,
  canvas: { strokes: [], pointCount: 0 },
});

/** Whether `work` holds nothing yet for a step of `kind`. */
const isBlank = (work: Work, kind: DoodleChainKind) =>
  kind === 'drawing'
    ? work.canvas.strokes.length === 0
    : work.suggestion === null && !work.text;

/** The phases a step is being played in, when every player has a task. */
const IN_STEP: ReadonlySet<DoodleChainPhase> = new Set([
  'write',
  'draw',
  'describe',
]);

const isEmpty = (entry: StoredEntry) => entry.content.type === 'empty';

/** What a chain is played from: its last entry that is not empty. */
const lastMade = (entries: readonly StoredEntry[]) =>
  entries.findLast((entry) => !isEmpty(entry));

/** How many hearts the entry made at `step` of `chain` was given. */
const heartsFor = (game: DoodleChainState, chain: number, step: number) => {
  let count = 0;
  for (const hearted of game.hearts.get(chain)?.values() ?? []) {
    if (hearted === step) count += 1;
  }
  return count;
};

const toEntry = (
  game: DoodleChainState,
  entry: StoredEntry,
): DoodleChainEntry => ({
  chain: entry.chain,
  step: entry.step,
  kind: entry.kind,
  author: { ...entry.author },
  content: { ...entry.content },
  hearts: heartsFor(game, entry.chain, entry.step),
});

/** How many entries the reveal has shown in all, which Next names. */
const revealTotal = (game: DoodleChainState): number => {
  if (!game.reveal) return 0;
  const before = game.chains
    .slice(0, game.reveal.chain)
    .reduce((sum, entries) => sum + entries.length, 0);
  return before + game.reveal.shown;
};

/** Whether the reveal has shown the entry at `index` of `chain`. */
const isShown = (game: DoodleChainState, chain: number, index: number) =>
  game.reveal !== null &&
  (chain < game.reveal.chain ||
    (chain === game.reveal.chain && index < game.reveal.shown));

const toLobbyInfo = (
  room: Room<DoodleChainState>,
): DoodleChainLobbyRoomInfo => ({
  gameType: 'doodle-chain',
  ...lobbyBasics(room),
  drawingSeconds: room.game.drawingSeconds,
});

/**
 * The viewer's own task: what the step asks of them, and what they work from
 * while it is on. Once a step ends they cannot look back at either.
 */
const taskFor = (
  game: DoodleChainState,
  viewerId: string,
): DoodleChainTask | undefined => {
  const task = game.tasks.get(viewerId);
  if (!task) return undefined;
  const entries = game.chains[task.chain] ?? [];
  const view: DoodleChainTask = {
    kind: kindOf(game.step),
    chain: task.chain,
    sitsOut: task.sitsOut,
  };
  if (task.sitsOut) {
    const skipped = entries.at(-1);
    if (skipped) view.skipped = toEntry(game, skipped);
  } else if (IN_STEP.has(game.phase)) {
    const given = lastMade(entries);
    if (given) view.given = toEntry(game, given);
  }
  return view;
};

/**
 * The room as `viewerId` may see it: their own task and words, and no chain
 * at all until the reveal shows it, entry by entry.
 */
const toRoomState = (
  room: Room<DoodleChainState>,
  viewerId: string,
): DoodleChainRoomState => {
  const game = room.game;
  const playing = room.isGameStarted && game.phase !== 'reveal';
  const seated = Boolean(room.playerList[viewerId]);

  const table: Record<string, DoodleChainSeat> = Object.fromEntries(
    Object.keys(room.playerList).map((playerId) => [
      playerId,
      {
        done: playing && game.done.has(playerId),
        sitsOut: playing && (game.tasks.get(playerId)?.sitsOut ?? false),
      },
    ]),
  );

  const state: DoodleChainRoomState = {
    ...toLobbyInfo(room),
    ...roomBasics(room),
    phaseEndsInMs: playing ? getRemainingPhaseMs(room) : 0,
    phase: game.phase,
    step: game.step,
    steps: room.isGameStarted ? game.steps : stepsFor(seatCount(room)),
    drawingSeconds: game.drawingSeconds,
    order: game.order.map((player) => ({ ...player })),
    table,
    lastGame: game.lastGame,
  };

  if (playing && seated) {
    const task = taskFor(game, viewerId);
    if (task) state.task = task;
    const work = game.work.get(viewerId);
    const writing = game.phase === 'write' || game.phase === 'describe';
    if (writing && work && task && !task.sitsOut) {
      state.draft =
        work.suggestion === null
          ? { text: work.text }
          : { suggestion: work.suggestion };
    }
  }

  if (room.isGameStarted && game.phase === 'passing') {
    state.stepEnd = game.stepEnd;
  }

  if (room.isGameStarted && game.phase === 'reveal' && game.reveal) {
    const { chain, shown } = game.reveal;
    state.reveal = {
      chain,
      shown,
      total: revealTotal(game),
      chains: game.chains.map((entries, index) => ({
        owner: { ...game.order[index]! },
        length: entries.length,
      })),
      entries: game.chains
        .slice(0, chain + 1)
        .map((entries, index) =>
          (index < chain ? entries : entries.slice(0, shown)).map((entry) =>
            toEntry(game, entry),
          ),
        ),
      hearts: seated
        ? Object.fromEntries(
            [...game.hearts]
              .filter(([, given]) => given.has(viewerId))
              .map(([index, given]) => [index, given.get(viewerId)!]),
          )
        : {},
    };
  }

  return state;
};

export {
  createState,
  createWork,
  heartsFor,
  IN_STEP,
  isBlank,
  isEmpty,
  isShown,
  lastMade,
  revealTotal,
  toEntry,
  toLobbyInfo,
  toRoomState,
};
export type { DoodleChainState, StepTask, StoredEntry, Work };
