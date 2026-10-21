import { SEATS } from '../../../shared/seats.js';
import type {
  ChatMessageKind,
  RoomNotice,
} from '../../../shared/wire-types.js';
import type { DrawAndGuessState } from '../../models/types.js';
import { isSpectator, seatCount } from '../../libs/rooms/seats.js';
import type { ChatVerdict, GameContext, Room } from '../../libs/rooms/types.js';
import { emitToRoom } from '../../libs/rooms/emit.js';
import {
  getRandomInt,
  getRandomElementFromSet,
  getRemainingPhaseMs,
  resetPoints,
  standingsOf,
} from '../../libs/utils.js';
import {
  buildWordHint,
  getRandomCategory,
  getRandomChoicesFromList,
  revealablePositions,
} from './words.js';
import {
  phaseDurationsInSeconds as defaultPhaseDurations,
  type PhaseDurationsInSeconds,
} from '../../libs/game-clock.js';
import { wordBank } from '../../libs/word-bank.js';
import { clearCanvas } from '../../libs/drawing/canvas.js';
import { swap } from '../../../shared/list.js';

const WORD_CHOICE_COUNT = 3;

/**
 * How long a turn waits for a drawer whose connection dropped mid-drawing,
 * before giving up and moving on. A reload takes about a second; this is the
 * bound on how long everyone else stares at a frozen canvas if they were not
 * reloading but leaving.
 */
const DEFAULT_DRAWER_HOLD_SECONDS = 10;

/**
 * The hint gets easier as the clock runs down: two reveals, evenly spaced
 * through the drawing phase, uncovering up to a third of the letters between
 * them. A third is enough to rescue a stalled room without handing over a
 * short word: "Pear" gives up one letter, never two.
 */
const HINT_REVEAL_COUNT = 2;
const MAX_REVEALED_FRACTION = 1 / 3;

/**
 * A guess is worth what is left on the clock.
 *
 * The floor is for getting there at all; the bonus is for getting there
 * first. The drawer takes a cut of whatever the guesser earned: a drawing
 * people get quickly is a better drawing.
 */
const GUESS_POINTS_FLOOR = 50;
const GUESS_POINTS_MAX_BONUS = 100;
const DRAWER_SHARE_OF_GUESS = 0.4;

type DrawAndGuessRoom = Room<DrawAndGuessState>;

const addTo = (tally: Map<string, number>, playerId: string, points: number) =>
  tally.set(playerId, (tally.get(playerId) ?? 0) + points);

/** Adds to a player's score and to what they have made this turn and round. */
const addTurnPoints = (
  room: DrawAndGuessRoom,
  playerId: string,
  points: number,
) => {
  const player = room.playerList[playerId];
  if (!player) return;
  player.points += points;
  addTo(room.game.turnPoints, playerId, points);
  addTo(room.game.roundPoints, playerId, points);
};

/**
 * What the round came to, for everybody seated at its end, most first; a
 * player who made nothing is in it with 0.
 */
const summarizeRound = (room: DrawAndGuessRoom) => {
  room.game.lastRound = {
    round: room.game.currentRound,
    standings: standingsOf(
      room.playerList,
      (playerId) => room.game.roundPoints.get(playerId) ?? 0,
    ),
  };
};

/**
 * Owns the turn state machine for Draw & Guess.
 *
 * The server holds one `setTimeout` per room and drives every transition
 * itself. Clients are told how many milliseconds remain and render a countdown
 * from that; nothing they send can advance a phase.
 *
 * Every transition ends by telling the room layer something changed
 * (`emitState`), and the room layer sends each player their own snapshot. The
 * engine never builds or sends a snapshot itself, which is what keeps the word
 * out of the wrong one.
 *
 * One engine is created per server process and shared by all connections, so
 * the timer registries below are genuinely per room rather than per socket.
 * They are also this game's own: the room layer owns exactly one kind of
 * timer, the seat expiry, and knows nothing about these three.
 *
 * The phase durations are a parameter rather than a module-level constant so a
 * test can drive a whole game in milliseconds. Production passes nothing and
 * gets the env-configured defaults.
 */
const createDrawAndGuessGameEngine = (
  ctx: GameContext,
  phaseDurationsInSeconds: PhaseDurationsInSeconds = defaultPhaseDurations,
) => {
  const { io } = ctx;
  /** How long a room is still waiting for a drawer who dropped. */
  const drawerHolds = ctx.rooms.timers();
  /** Pending letter reveals for the turn in progress. */
  const hintReveals = ctx.rooms.timers();
  const drawerHoldInSeconds =
    phaseDurationsInSeconds.drawerHold ?? DEFAULT_DRAWER_HOLD_SECONDS;

  const roomOf = (roomId: string): DrawAndGuessRoom | undefined =>
    ctx.rooms.ofType<DrawAndGuessState>(roomId, 'draw-and-guess');

  const announce = (
    roomId: string,
    kind: Exclude<ChatMessageKind, 'player'>,
    notice: RoomNotice,
  ) => ctx.rooms.announce(roomId, kind, notice);

  const emitState = (room: DrawAndGuessRoom) => ctx.rooms.emitState(room);

  const emitLobbyRoomList = () => ctx.rooms.emitLobby('draw-and-guess');

  const clearDrawerHold = (room: DrawAndGuessRoom) => {
    room.game.drawerHoldEndsAt = 0;
    drawerHolds.clear(room.roomId);
  };

  /**
   * Uncovers letters of the word as the drawing phase runs down.
   *
   * The positions are drawn at random up front and then revealed in that order,
   * so a reveal cannot land on a letter that is already showing, and each step
   * genuinely tells the room something it did not know.
   */
  const scheduleHintReveals = (room: DrawAndGuessRoom) => {
    hintReveals.clear(room.roomId);

    const positions = revealablePositions(room.game.word);
    const totalToReveal = Math.floor(positions.length * MAX_REVEALED_FRACTION);
    if (totalToReveal === 0) return;

    // Fisher-Yates, so every letter is equally likely to be the one given away.
    const order = [...positions];
    for (let index = order.length - 1; index > 0; index--) {
      const swapWith = getRandomInt(0, index + 1);
      swap(order, index, swapWith);
    }

    const word = room.game.word;
    const turn = room.game.turn;
    const revealed = new Set<number>();

    // Counted here rather than off `revealed`, which is empty until the first
    // timer fires: a three-letter word has one letter to give away, and both
    // steps would otherwise be scheduled to reveal that same letter, the
    // second one a snapshot that changes nothing.
    let scheduledSoFar = 0;

    for (let step = 1; step <= HINT_REVEAL_COUNT; step++) {
      const revealedByNow = Math.round(
        (totalToReveal * step) / HINT_REVEAL_COUNT,
      );
      if (revealedByNow <= scheduledSoFar) continue;
      scheduledSoFar = revealedByNow;

      const upTo = revealedByNow;
      const delayInSeconds =
        (phaseDurationsInSeconds.drawing * step) / (HINT_REVEAL_COUNT + 1);

      hintReveals.add(room.roomId, delayInSeconds * 1000, () => {
        // The turn may have ended early (everybody guessed, the drawer
        // dropped), and the next one is not this one's word to hint at.
        if (room.game.phase !== 'drawing') return;
        if (room.game.turn !== turn) return;

        for (const position of order.slice(0, upTo)) revealed.add(position);
        room.game.hint = buildWordHint(word, revealed);
        emitState(room);
      });
    }
  };

  const startGame = (room: DrawAndGuessRoom) => {
    // Checked before anything else about the room is reported, so a stranger
    // with a room id off the lobby broadcast learns nothing from the reply.
    room.playerList = resetPoints(room.playerList);
    room.isGameStarted = true;
    room.game.currentRound = 0;
    room.game.turn = 0;
    room.game.lastGame = null;
    room.game.lastRound = null;
    room.game.wordCategory = getRandomCategory(wordBank).name;

    // Logged without the room object, which carries the password
    console.log(
      `Game started in room ${room.roomId} with category "${room.game.wordCategory}".`,
    );

    announce(room.roomId, 'system', {
      type: 'dg:started',
      category: room.game.wordCategory,
    });
    emitLobbyRoomList();

    startNewRound(room);
  };

  const startNewRound = (room: DrawAndGuessRoom) => {
    room.game.currentRound += 1;
    room.game.drawerQueue = new Set(Object.keys(room.playerList));
    room.game.roundPoints.clear();

    startNewDrawerTurn(room);
  };

  const startNewDrawerTurn = (room: DrawAndGuessRoom) => {
    // The server's copy of the drawing is wiped exactly where every client
    // wipes theirs, which is what keeps the two the same thing.
    clearCanvas(room.game.canvas);
    emitToRoom(io, room.roomId, 'dg:canvas:clear', room.roomId);

    // Only somebody actually present can take a turn. A player inside their
    // reconnect grace period still holds a seat, but handing them the pencil
    // would stall the room until they either returned or timed out.
    const presentInQueue = new Set(
      [...room.game.drawerQueue].filter(
        (playerId) => room.playerList[playerId]?.isConnected,
      ),
    );

    const nobodyHere = !Object.values(room.playerList).some(
      (player) => player.isConnected,
    );
    if (room.game.wordCategory === '' || nobodyHere) {
      endGame(room, { endedEarly: true });
      return;
    }
    const newDrawer = getRandomElementFromSet(presentInQueue);
    if (!newDrawer) {
      // Everybody still owed a turn this round is away: their turns are
      // skipped rather than the game ended, since they may be back within
      // their grace and play on in the next round.
      room.game.drawerQueue.clear();
      nextTurn(room);
      return;
    }

    room.game.turn += 1;
    room.game.phase = 'choosing';
    room.game.currentDrawer = newDrawer;
    announce(room.roomId, 'divider', {
      type: 'dg:turn',
      round: room.game.currentRound,
      drawer: room.playerList[newDrawer]?.username ?? '',
    });
    room.game.drawerQueue.delete(newDrawer);
    room.game.word = '';
    room.game.hint = '';
    room.game.wordAutoPicked = false;
    room.game.scoredThisTurn.clear();
    room.game.turnPoints.clear();
    room.game.wordChoices = getRandomChoicesFromList(
      wordBank[room.game.wordCategory],
      WORD_CHOICE_COUNT,
    );

    // If the drawer never chooses, the clock chooses for them.
    ctx.rooms.startPhase(room, phaseDurationsInSeconds.wordSelecting, () => {
      const fallbackWord = room.game.wordChoices[0];
      if (fallbackWord === undefined) {
        endTurn(room);
        return;
      }
      room.game.wordAutoPicked = true;
      beginDrawingPhase(room, fallbackWord);
    });
    emitState(room);
  };

  const beginDrawingPhase = (room: DrawAndGuessRoom, word: string) => {
    room.game.phase = 'drawing';
    // The last round's summary has had its time: the next round is drawing.
    room.game.lastRound = null;
    room.game.word = word;
    room.game.hint = buildWordHint(word);
    room.game.wordChoices = [];

    // Not the word: the log is read by more people than the room is, and a
    // secret written down is one that can leak.
    console.log(
      `In room ${room.roomId}, drawer ${room.game.currentDrawer} is drawing.`,
    );

    ctx.rooms.startPhase(room, phaseDurationsInSeconds.drawing, () =>
      beginReviewingPhase(room),
    );
    scheduleHintReveals(room);
    emitState(room);
  };

  const beginReviewingPhase = (room: DrawAndGuessRoom) => {
    // Nothing left to hint at: the snapshot reveals the word itself.
    hintReveals.clear(room.roomId);
    clearDrawerHold(room);

    room.game.phase = 'reveal';
    // Nobody left to draw this round: no more points can come in it.
    if (room.game.drawerQueue.size === 0) summarizeRound(room);
    ctx.rooms.startPhase(room, phaseDurationsInSeconds.reviewing, () =>
      endTurn(room),
    );
    emitState(room);
  };

  /**
   * The turn is over, however it ended. Straight on to the next one, the next
   * round, or the end of the game: the room never sits between turns, so this
   * sends no snapshot of its own.
   */
  const endTurn = (room: DrawAndGuessRoom) => {
    ctx.rooms.stopPhase(room);
    clearDrawerHold(room);
    hintReveals.clear(room.roomId);

    // A departure may have ended the game while this turn was running.
    if (!room.isGameStarted) {
      emitState(room);
      return;
    }

    nextTurn(room);
  };

  /** The next turn, the next round, or the end of the game. */
  const nextTurn = (room: DrawAndGuessRoom) => {
    if (room.game.drawerQueue.size > 0) {
      startNewDrawerTurn(room);
    } else if (room.game.currentRound < room.game.rounds) {
      // A last turn skipped before its reveal has not summed the round yet.
      if (room.game.lastRound?.round !== room.game.currentRound) {
        summarizeRound(room);
      }
      startNewRound(room);
    } else {
      endGame(room, { endedEarly: false });
    }
  };

  const endGame = (
    room: DrawAndGuessRoom,
    { endedEarly }: { endedEarly: boolean },
  ) => {
    ctx.rooms.stopPhase(room);
    clearDrawerHold(room);
    hintReveals.clear(room.roomId);

    const game = room.game;
    if (game.wordCategory !== '') {
      game.lastGame = {
        endedEarly,
        standings: standingsOf(room.playerList),
        wordCategory: game.wordCategory,
        rounds: game.currentRound,
        turns: game.turn,
      };
    }

    room.isGameStarted = false;
    game.phase = 'waiting';
    game.currentRound = 0;
    game.turn = 0;
    game.currentDrawer = '';
    game.word = '';
    game.hint = '';
    game.wordChoices = [];
    game.wordAutoPicked = false;
    game.drawerQueue.clear();
    game.scoredThisTurn.clear();
    game.turnPoints.clear();
    game.roundPoints.clear();
    game.lastRound = null;
    game.wordCategory = '';

    emitState(room);
    // A game cut short has no result: game:interrupted already said so.
    if (!endedEarly) announce(room.roomId, 'success', { type: 'game:ended' });
    emitLobbyRoomList();
  };

  /**
   * Called after a player has been removed from `playerList`, by either the
   * explicit leave handler or the disconnect handler.
   */
  const handlePlayerDeparture = (room: DrawAndGuessRoom, playerId: string) => {
    // Leaving a stale id in the queue would hand a turn to a player who is
    // no longer there, and nobody would ever draw it.
    room.game.drawerQueue.delete(playerId);
    room.game.scoredThisTurn.delete(playerId);
    room.game.turnPoints.delete(playerId);
    room.game.roundPoints.delete(playerId);

    if (!room.isGameStarted) return;

    if (seatCount(room) < SEATS['draw-and-guess'].min) {
      announce(room.roomId, 'alert', { type: 'game:interrupted' });
      endGame(room, { endedEarly: true });
      return;
    }

    if (room.game.currentDrawer === playerId) {
      announce(room.roomId, 'alert', { type: 'dg:drawer-left' });
      endTurn(room);
    }
  };

  /**
   * What a correct guess is worth at this moment, to the guesser and to the
   * drawer. Lives here because the engine is what knows both halves: how long
   * the phase is, and how much of it is left.
   */
  const pointsForCorrectGuess = (
    room: DrawAndGuessRoom,
  ): { guesser: number; drawer: number } => {
    const phaseInMs = phaseDurationsInSeconds.drawing * 1000;
    const fractionLeft =
      phaseInMs > 0
        ? Math.min(1, Math.max(0, getRemainingPhaseMs(room) / phaseInMs))
        : 0;

    const guesser =
      GUESS_POINTS_FLOOR + Math.round(GUESS_POINTS_MAX_BONUS * fractionLeft);

    return { guesser, drawer: Math.round(guesser * DRAWER_SHARE_OF_GUESS) };
  };

  /**
   * A guess has just been scored. If it was the last one anybody could make,
   * the turn is over.
   *
   * The rest of a drawing phase whose word everyone has already guessed is
   * dead time: the drawer has nothing left to draw for and every guesser is
   * watching a countdown for a word they know. Players who are inside their
   * reconnect grace do not hold it open: they cannot guess while they are
   * away, so waiting for them would cost the room the whole phase.
   */
  const endTurnIfEverybodyGuessed = (room: DrawAndGuessRoom) => {
    if (room.game.phase !== 'drawing') return;

    const stillGuessing = Object.entries(room.playerList).filter(
      ([playerId, player]) =>
        playerId !== room.game.currentDrawer &&
        player.isConnected &&
        !room.game.scoredThisTurn.has(playerId),
    );
    if (stillGuessing.length > 0) return;

    announce(room.roomId, 'system', { type: 'dg:all-guessed' });
    beginReviewingPhase(room);
  };

  /**
   * Everything a player types comes through here first, because in this game
   * a chat message may be a guess, and may give the word away.
   *
   * - The drawer is silenced while the word is in play (choosing and
   *   drawing): anything they type could be the word, or a hint at it.
   * - A player who has scored this turn is silenced until the next turn
   *   starts, the reveal included: they know the word, and could type it.
   * - During drawing, a guesser's message is a guess. A correct one is scored
   *   and announced instead of shown; a wrong one is ordinary chat.
   * - During drawing, a spectator talks only to the other spectators: they
   *   cannot score, but they could hint at the word to the players. A
   *   spectator who types the word is swallowed.
   *
   * Matching ignores case and surrounding spaces.
   */
  const handleChat = (
    room: DrawAndGuessRoom,
    playerId: string,
    text: string,
  ): ChatVerdict => {
    const game = room.game;
    const isInPlay = game.phase === 'choosing' || game.phase === 'drawing';

    if (isInPlay && game.currentDrawer === playerId) return 'blocked';
    if (game.scoredThisTurn.has(playerId)) return 'blocked';
    if (game.phase !== 'drawing' || game.word === '') return 'chat';

    const isCorrect =
      text.trim().toLowerCase() === game.word.trim().toLowerCase();
    if (!isCorrect) return isSpectator(room, playerId) ? 'spectators' : 'chat';

    // A correct guess must never be posted as chat, so a turn without a
    // drawer to credit swallows it rather than letting the word through.
    const guesser = room.playerList[playerId];
    if (!guesser || !room.playerList[game.currentDrawer]) return 'blocked';

    // What a guess is worth depends on how much of the phase is left.
    const award = pointsForCorrectGuess(room);
    addTurnPoints(room, playerId, award.guesser);
    addTurnPoints(room, game.currentDrawer, award.drawer);
    game.scoredThisTurn.add(playerId);

    announce(room.roomId, 'success', {
      type: 'dg:guessed',
      name: guesser.username,
      points: award.guesser,
    });
    emitState(room);

    // If that was the last player who could still guess, there is nothing
    // left to draw for and the phase ends here rather than running out.
    endTurnIfEverybodyGuessed(room);
    return 'consumed';
  };

  /**
   * The drawer's connection dropped, but they keep their seat.
   *
   * The drawing is on the server, so a turn under way is worth holding
   * briefly: a reload takes about a second, and it comes back to the same
   * board with the same clock still running.
   *
   * Briefly, though. Nothing has been invested in a turn whose word has not
   * been chosen yet, and an absent drawer will not be choosing one, so that
   * case is skipped at once. A turn already under way waits, but only for
   * `drawerHoldInSeconds`: long enough for a refresh, short enough that a room
   * whose drawer has actually gone is not left staring at a frozen canvas.
   */
  const handleDrawerDisconnect = (room: DrawAndGuessRoom, playerId: string) => {
    if (!room.isGameStarted) return;
    if (room.game.currentDrawer !== playerId) return;

    if (room.game.phase === 'choosing') {
      announce(room.roomId, 'alert', { type: 'dg:drawer-lost' });
      endTurn(room);
      return;
    }

    // The reveal needs nobody in particular; it runs itself out.
    if (room.game.phase !== 'drawing') return;

    // Never outlast the phase it is holding open.
    const holdInMs = Math.min(
      drawerHoldInSeconds * 1000,
      getRemainingPhaseMs(room),
    );

    room.game.drawerHoldEndsAt = Date.now() + holdInMs;
    drawerHolds.set(room.roomId, holdInMs, () => {
      // They may have come back, left properly, or had the turn end under
      // them in the time we spent waiting.
      room.game.drawerHoldEndsAt = 0;
      if (room.game.currentDrawer !== playerId) return;
      if (room.playerList[playerId]?.isConnected) return;

      announce(room.roomId, 'alert', { type: 'dg:drawer-timeout' });
      endTurn(room);
    });
    emitState(room);
  };

  /**
   * They came back inside the hold, so the turn is theirs again. Their room
   * page asks for the word and the drawing over `room:sync` once it mounts.
   */
  const handleDrawerReturn = (room: DrawAndGuessRoom, playerId: string) => {
    if (room.game.currentDrawer !== playerId) return;
    if (!drawerHolds.has(room.roomId)) return;

    clearDrawerHold(room);
    announce(room.roomId, 'system', { type: 'dg:drawer-returned' });
    emitState(room);
  };

  /**
   * The drawer's own word choice. Verified rather than trusted: the sender has
   * to be the current drawer, in their own choosing phase, choosing one of the
   * words they were actually offered.
   */
  const selectWord = (roomId: string, playerId: string, word: string) => {
    const room = roomOf(roomId);
    if (!room) return;
    if (room.game.currentDrawer !== playerId) return;
    if (room.game.phase !== 'choosing') return;
    if (!room.game.wordChoices.includes(word)) return;

    beginDrawingPhase(room, word);
  };

  return {
    startGame,
    selectWord,
    handleChat,
    handlePlayerDeparture,
    handleDrawerDisconnect,
    handleDrawerReturn,
  };
};

type DrawAndGuessGameEngine = ReturnType<typeof createDrawAndGuessGameEngine>;

export { createDrawAndGuessGameEngine };
export type { DrawAndGuessGameEngine, DrawAndGuessRoom };
