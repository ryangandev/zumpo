import type {
  Coordinate,
  DoodleChainContent,
  DoodleChainDraft,
} from '../../models/types.js';
import { seatCount } from '../../libs/rooms/seats.js';
import type { GameContext, Room } from '../../libs/rooms/types.js';
import {
  emitToPlayer,
  emitToRoom,
  emitToSocket,
  type IoSocket,
} from '../../libs/rooms/emit.js';
import { resetPoints } from '../../libs/utils.js';
import {
  beginStroke,
  clearCanvas,
  extendStroke,
  undoStroke,
} from '../../libs/drawing/canvas.js';
import {
  doodleChainDurationsInSeconds as defaultDurations,
  type DoodleChainDurationsInSeconds,
} from '../../libs/game-clock.js';
import {
  canFollow,
  chainAt,
  cleanText,
  kindOf,
  stepsFor,
  SUGGESTION_COUNT,
} from '../../../shared/doodle-chain.js';
import {
  createWork,
  heartsFor,
  IN_STEP,
  isBlank,
  isEmpty,
  isShown,
  lastMade,
  revealTotal,
  type DoodleChainState,
  type StepTask,
  type StoredEntry,
} from './state.js';

type DoodleChainRoom = Room<DoodleChainState>;

/** Below this many players a game stops playing steps and shows what was made. */
const FEWEST_TO_PLAY_ON = 2;

/** A drawing's id: unique in the room, since `game` counts its games. */
const drawingId = (game: DoodleChainState, chain: number, step: number) =>
  `${game.game}.${chain}.${step}`;

/** Seated players with something to do this step: only they can end it early. */
const workers = (room: DoodleChainRoom) =>
  Object.keys(room.playerList).filter((playerId) => {
    const task = room.game.tasks.get(playerId);
    return task !== undefined && !task.sitsOut;
  });

/** A step in play, and `playerId` at the table with something to do in it. */
const workOf = (room: DoodleChainRoom, playerId: string) => {
  const game = room.game;
  if (!room.isGameStarted || !IN_STEP.has(game.phase)) return null;
  if (!room.playerList[playerId]) return null;
  const task = game.tasks.get(playerId);
  if (!task || task.sitsOut) return null;
  const work = game.work.get(playerId);
  return work ? { task, work } : null;
};

/** Every player's points: the hearts their entries were given. */
const countHearts = (room: DoodleChainRoom) => {
  const game = room.game;
  for (const [playerId, player] of Object.entries(room.playerList)) {
    player.points = game.chains
      .flat()
      .filter((entry) => entry.author.playerId === playerId)
      .reduce(
        (sum, entry) => sum + heartsFor(game, entry.chain, entry.step),
        0,
      );
  }
};

/**
 * Owns the steps and the reveal. Everybody plays every step at once, each on
 * a different chain, on the room's one clock; the reveal has no clock, since
 * the host sets its pace.
 */
const createDoodleChainGameEngine = (
  ctx: GameContext,
  durations: DoodleChainDurationsInSeconds = defaultDurations,
  random: () => number = Math.random,
) => {
  const roomOf = (roomId: string): DoodleChainRoom | undefined =>
    ctx.rooms.ofType<DoodleChainState>(roomId, 'doodle-chain');

  const secondsFor = (room: DoodleChainRoom) => {
    switch (room.game.phase) {
      case 'write':
        return durations.write;
      case 'describe':
        return durations.describe;
      default:
        return durations.draw ?? room.game.drawingSeconds;
    }
  };

  const startGame = (room: DoodleChainRoom) => {
    const game = room.game;
    game.order = Object.entries(room.playerList).map(([playerId, player]) => ({
      playerId,
      username: player.username,
    }));
    game.steps = stepsFor(game.order.length);
    game.game += 1;
    game.chains = game.order.map(() => []);
    game.drawings = new Map();
    game.hearts = new Map();
    game.reveal = null;
    game.endedEarly = false;
    game.lastGame = null;
    room.playerList = resetPoints(room.playerList);
    room.isGameStarted = true;

    console.log(
      `Doodle Chain started in room ${room.roomId}, ${game.steps} steps.`,
    );
    ctx.rooms.emitLobby('doodle-chain');
    beginStep(room, 1);
  };

  /**
   * Step `step` opens for everybody at once, each player on the chain the
   * order gives them, or sitting it out when the chain cannot be played on.
   */
  const beginStep = (room: DoodleChainRoom, step: number) => {
    const game = room.game;
    const kind = kindOf(step);
    const players = game.order.length;
    game.step = step;
    game.phase =
      kind === 'prompt' ? 'write' : kind === 'drawing' ? 'draw' : 'describe';
    game.done = new Set();
    game.work = new Map();
    game.tasks = new Map(
      game.order.map(({ playerId }, place): [string, StepTask] => {
        const chain = chainAt(place, step, players);
        const from = lastMade(game.chains[chain] ?? []);
        const sitsOut = step > 1 && !(from && canFollow(from.kind, kind));
        return [playerId, { chain, sitsOut }];
      }),
    );
    for (const { playerId } of game.order) {
      game.work.set(playerId, createWork());
    }

    ctx.rooms.announce(room.roomId, 'system', { type: 'dc:step', step, kind });
    ctx.rooms.startPhase(room, secondsFor(room), () => finishStep(room));

    // Whoever describes is sent the drawing they describe, and nobody else:
    // not a player who has left, who may be back watching, or in another room.
    if (kind === 'description') {
      for (const [playerId, task] of game.tasks) {
        if (!task.sitsOut && room.playerList[playerId]) {
          sendGivenDrawing(room, playerId, task);
        }
      }
    }
    ctx.rooms.emitState(room);
    endIfAllDone(room);
  };

  const sendGivenDrawing = (
    room: DoodleChainRoom,
    playerId: string,
    task: StepTask,
    socket?: IoSocket,
  ) => {
    const given = lastMade(room.game.chains[task.chain] ?? []);
    if (given?.content.type !== 'drawing') return;
    const id = given.content.drawing;
    const strokes = room.game.drawings.get(id) ?? [];
    if (socket) emitToSocket(socket, 'dc:drawing', room.roomId, id, strokes);
    else emitToPlayer(ctx.io, playerId, 'dc:drawing', room.roomId, id, strokes);
  };

  /** Everybody with something to do has pressed Done: the rest is dead time. */
  const endIfAllDone = (room: DoodleChainRoom) => {
    const game = room.game;
    if (!room.isGameStarted || !IN_STEP.has(game.phase)) return;
    if (workers(room).every((playerId) => game.done.has(playerId))) {
      finishStep(room);
    }
  };

  /**
   * What `playerId` made this step becomes their entry, finished or not. An
   * empty prompt is given a suggestion, so every chain starts with something.
   */
  const contentOf = (
    room: DoodleChainRoom,
    playerId: string,
    task: StepTask,
  ): DoodleChainContent => {
    const game = room.game;
    const work = game.work.get(playerId) ?? createWork();
    const kind = kindOf(game.step);
    if (kind === 'drawing') {
      if (work.canvas.strokes.length > 0) {
        const id = drawingId(game, task.chain, game.step);
        game.drawings.set(id, work.canvas.strokes);
        return { type: 'drawing', drawing: id };
      }
    } else if (work.suggestion !== null) {
      return { type: 'suggestion', suggestion: work.suggestion };
    } else if (work.text) {
      return { type: 'text', text: work.text };
    }
    if (kind === 'prompt') {
      return {
        type: 'suggestion',
        suggestion: Math.floor(random() * SUGGESTION_COUNT),
      };
    }
    return {
      type: 'empty',
      reason: room.playerList[playerId] ? 'time' : 'left',
    };
  };

  /** The step's work becomes its entries. Nothing is lost to the clock. */
  const keepStep = (room: DoodleChainRoom) => {
    const game = room.game;
    const kind = kindOf(game.step);
    game.order.forEach((author) => {
      const task = game.tasks.get(author.playerId);
      if (!task || task.sitsOut) return;
      const entry: StoredEntry = {
        chain: task.chain,
        step: game.step,
        kind,
        author,
        content: contentOf(room, author.playerId, task),
      };
      game.chains[task.chain]?.push(entry);
    });
    game.work = new Map();
    game.done = new Set();
  };

  /** Time is up, or everybody is done: the chains move on after a pause. */
  const finishStep = (room: DoodleChainRoom) => {
    const game = room.game;
    if (!IN_STEP.has(game.phase)) return;
    keepStep(room);
    game.phase = 'passing';
    ctx.rooms.startPhase(room, durations.passing, () => {
      if (game.step < game.steps) beginStep(room, game.step + 1);
      else beginReveal(room);
    });
    ctx.rooms.emitState(room);
  };

  /** Every chain is done, or too few are left to go on: the room watches them. */
  const beginReveal = (room: DoodleChainRoom) => {
    const game = room.game;
    ctx.rooms.stopPhase(room);
    game.phase = 'reveal';
    game.tasks = new Map();
    game.reveal = { chain: 0, shown: 1 };
    ctx.rooms.announce(room.roomId, 'system', {
      type: 'dc:reveal',
      host: room.owner.username,
    });
    sendShown(room);
    ctx.rooms.emitState(room);
  };

  /** The entry just shown, if it is a drawing, to everybody in the room. */
  const sendShown = (room: DoodleChainRoom) => {
    const game = room.game;
    if (!game.reveal) return;
    const entry = game.chains[game.reveal.chain]?.[game.reveal.shown - 1];
    if (entry?.content.type !== 'drawing') return;
    const id = entry.content.drawing;
    emitToRoom(
      ctx.io,
      room.roomId,
      'dc:drawing',
      room.roomId,
      id,
      game.drawings.get(id) ?? [],
    );
  };

  /**
   * The host shows the next entry. `total` is how many they saw shown, so a
   * double tap, or a Next from a page a step behind, shows nothing more.
   */
  const next = (roomId: string, playerId: string, total: number) => {
    const room = roomOf(roomId);
    if (!room?.isGameStarted || room.owner.playerId !== playerId) return;
    const game = room.game;
    if (game.phase !== 'reveal' || !game.reveal) return;
    if (total !== revealTotal(game)) return;

    const { chain, shown } = game.reveal;
    if (shown < (game.chains[chain]?.length ?? 0)) {
      game.reveal = { chain, shown: shown + 1 };
    } else if (chain < game.chains.length - 1) {
      game.reveal = { chain: chain + 1, shown: 1 };
    } else {
      endGame(room);
      return;
    }
    sendShown(room);
    ctx.rooms.emitState(room);
  };

  /** A player's score is the hearts their entries were given this game. */
  /**
   * `playerId` gives the chain's one heart to the entry made at `step`, which
   * moves it from any other, or takes it back with null.
   */
  const heart = (
    roomId: string,
    playerId: string,
    chain: number,
    step: number | null,
  ) => {
    const room = roomOf(roomId);
    if (!room?.isGameStarted || !room.playerList[playerId]) return;
    const game = room.game;
    if (game.phase !== 'reveal' || !game.reveal) return;
    const entries = game.chains[chain];
    if (!entries) return;
    const given = game.hearts.get(chain) ?? new Map<string, number>();

    if (step === null) {
      if (!given.delete(playerId)) return;
    } else {
      const index = entries.findIndex((entry) => entry.step === step);
      const entry = entries[index];
      if (!entry || !isShown(game, chain, index) || isEmpty(entry)) return;
      if (entry.author.playerId === playerId) return;
      if (given.get(playerId) === step) return;
      given.set(playerId, step);
    }
    game.hearts.set(chain, given);
    countHearts(room);
    ctx.rooms.emitState(room);
  };

  /** The reveal is over: the chains stay on the table as the album. */
  const endGame = (room: DoodleChainRoom) => {
    const game = room.game;
    ctx.rooms.stopPhase(room);
    countHearts(room);
    const standings = game.order
      .map(({ playerId, username }) => ({
        playerId,
        username,
        points: game.chains
          .flat()
          .filter((entry) => entry.author.playerId === playerId)
          .reduce(
            (sum, entry) => sum + heartsFor(game, entry.chain, entry.step),
            0,
          ),
      }))
      .toSorted((a, b) => b.points - a.points);
    const chains = game.chains.map((entries, index) => ({
      owner: { ...game.order[index]! },
      entries: entries.map((entry) => ({
        chain: entry.chain,
        step: entry.step,
        kind: entry.kind,
        author: { ...entry.author },
        content: { ...entry.content },
        hearts: heartsFor(game, entry.chain, entry.step),
      })),
    }));
    const most = Math.max(
      0,
      ...chains.flatMap((chain) => chain.entries.map((entry) => entry.hearts)),
    );
    const favourites =
      most === 0
        ? []
        : chains.flatMap((chain) =>
            chain.entries
              .filter((entry) => entry.hearts === most)
              .map(({ chain: index, step }) => ({ chain: index, step })),
          );

    game.lastGame = {
      endedEarly: game.endedEarly,
      standings,
      chains,
      favourites,
    };
    room.isGameStarted = false;
    game.phase = 'waiting';
    game.step = 0;
    game.reveal = null;
    game.tasks = new Map();
    game.work = new Map();
    game.done = new Set();

    ctx.rooms.announce(room.roomId, 'success', { type: 'dc:album' });
    ctx.rooms.emitState(room);
    ctx.rooms.emitLobby('doodle-chain');
  };

  /** Fewer than two are left: the steps still to come are dropped. */
  const endEarly = (room: DoodleChainRoom) => {
    const game = room.game;
    if (IN_STEP.has(game.phase)) keepStep(room);
    ctx.rooms.announce(room.roomId, 'alert', { type: 'game:interrupted' });
    game.endedEarly = true;
    beginReveal(room);
  };

  const setText = (
    roomId: string,
    playerId: string,
    draft: DoodleChainDraft,
  ) => {
    const room = roomOf(roomId);
    if (!room) return;
    const mine = workOf(room, playerId);
    const game = room.game;
    if (!mine || game.phase === 'draw' || game.done.has(playerId)) return;
    if ('suggestion' in draft) {
      if (game.phase !== 'write') return;
      mine.work.suggestion = draft.suggestion;
      mine.work.text = '';
    } else {
      mine.work.suggestion = null;
      mine.work.text = cleanText(draft.text);
    }
    // Nothing anybody else sees changes, and the writer has their own words.
  };

  const setDone = (roomId: string, playerId: string, done: boolean) => {
    const room = roomOf(roomId);
    const mine = room && workOf(room, playerId);
    if (!room || !mine) return;
    const game = room.game;
    if (game.done.has(playerId) === done) return;
    // An empty entry is never Done, so an empty one in a chain always means
    // its time ran out or its player left.
    if (done && isBlank(mine.work, kindOf(game.step))) return;
    if (done) game.done.add(playerId);
    else game.done.delete(playerId);
    ctx.rooms.emitState(room);
    endIfAllDone(room);
  };

  /** The canvas `playerId` may draw on now, or null: their own, while drawing. */
  const canvasOf = (roomId: string, playerId: string) => {
    const room = roomOf(roomId);
    if (!room || room.game.phase !== 'draw') return null;
    if (room.game.done.has(playerId)) return null;
    return workOf(room, playerId)?.work.canvas ?? null;
  };

  const draw = {
    start: (
      roomId: string,
      playerId: string,
      at: Coordinate,
      color: string,
      size: number,
    ) => {
      const canvas = canvasOf(roomId, playerId);
      if (canvas) beginStroke(canvas, color, size, at);
    },
    move: (roomId: string, playerId: string, at: Coordinate) => {
      const canvas = canvasOf(roomId, playerId);
      if (canvas) extendStroke(canvas, at);
    },
    undo: (roomId: string, playerId: string) => {
      const canvas = canvasOf(roomId, playerId);
      if (canvas) undoStroke(canvas);
    },
    clear: (roomId: string, playerId: string) => {
      const canvas = canvasOf(roomId, playerId);
      if (canvas) clearCanvas(canvas);
    },
  };

  /**
   * What a page that syncs needs beyond its snapshot: its own drawing so far,
   * the drawing it describes, or every drawing the reveal or the album shows.
   */
  const syncTo = (
    socket: IoSocket,
    room: DoodleChainRoom,
    playerId: string,
  ) => {
    const game = room.game;
    const send = (id: string) =>
      emitToSocket(
        socket,
        'dc:drawing',
        room.roomId,
        id,
        game.drawings.get(id) ?? [],
      );
    const drawingsIn = (entries: readonly StoredEntry[]) => {
      for (const entry of entries) {
        if (entry.content.type === 'drawing') send(entry.content.drawing);
      }
    };

    if (room.isGameStarted && game.phase === 'reveal') {
      game.chains.forEach((entries, chain) =>
        drawingsIn(entries.filter((_, index) => isShown(game, chain, index))),
      );
      return;
    }
    if (!room.isGameStarted) {
      if (game.lastGame) drawingsIn(game.chains.flat());
      return;
    }
    const mine = workOf(room, playerId);
    if (!mine) return;
    if (game.phase === 'draw') {
      emitToSocket(socket, 'dc:canvas:sync', room.roomId, [
        ...mine.work.canvas.strokes,
      ]);
    } else if (game.phase === 'describe') {
      sendGivenDrawing(room, playerId, mine.task, socket);
    }
  };

  /**
   * Called after the seat is already gone from `playerList`. What they made
   * this step is kept; the steps that would have reached them are empty.
   */
  const handlePlayerDeparture = (room: DoodleChainRoom, playerId: string) => {
    const game = room.game;
    if (!room.isGameStarted) return;
    game.done.delete(playerId);
    // A departure during the reveal changes only the table, so the reveal
    // goes on with whoever is left; the crown passes as in every room.
    if (game.phase === 'reveal') {
      countHearts(room);
      return;
    }
    if (seatCount(room) < FEWEST_TO_PLAY_ON) {
      endEarly(room);
      return;
    }
    endIfAllDone(room);
  };

  return {
    startGame,
    setText,
    setDone,
    draw,
    next,
    heart,
    syncTo,
    handlePlayerDeparture,
  };
};

type DoodleChainGameEngine = ReturnType<typeof createDoodleChainGameEngine>;

export { createDoodleChainGameEngine };
export type { DoodleChainGameEngine, DoodleChainRoom };
