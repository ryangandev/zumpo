import { SEATS } from '../../../shared/seats.js';
import type { DailyWordBoard, DailyWordSettings } from '../../models/types.js';
import { seatCount } from '../../libs/rooms/seats.js';
import type { GameContext, Room } from '../../libs/rooms/types.js';
import { gameOverNotice, resetPoints, standingsOf } from '../../libs/utils.js';
import {
  dailyWordDurationsInSeconds as defaultDurations,
  type DailyWordDurationsInSeconds,
} from '../../libs/game-clock.js';
import {
  checkGuess,
  isFound,
  markGuess,
  pointsForFind,
  roomWords,
} from '../../../shared/daily-word.js';
import { seededRandom, seedNumber } from '../../../shared/seed.js';
import {
  boardStatus,
  boardView,
  currentWord,
  emptyBoard,
  isDone,
  type DailyWordState,
} from './state.js';

type DailyWordRoom = Room<DailyWordState>;

/** Why a guess was not taken, for its acknowledgement; null when it was. */
type GuessRefusal = string | null;

/** A player who has found the open word keeps quiet until its round ends. */
const mayChat = (room: DailyWordRoom, playerId: string) => {
  const board = room.game.boards.get(playerId);
  return !(
    room.game.phase === 'guessing' &&
    board !== undefined &&
    boardStatus(board) === 'found'
  );
};

/**
 * Owns the round loop. Like a Make 24 hand, a round belongs to everybody at
 * once: the same word for every player, one clock, and a round that ends
 * early once everybody still connected has found it or run out of guesses.
 *
 * A game's words are drawn at random, or, given a seed (a test run's), from
 * that seed afresh for every game, so each deals the same words. Either way
 * they are drawn by `roomWords`, so its rules hold.
 */
const createDailyWordGameEngine = (
  ctx: GameContext,
  durations: DailyWordDurationsInSeconds = defaultDurations,
  seed?: string,
) => {
  const random = () => (seed ? seededRandom(seedNumber(seed)) : Math.random);

  const roomOf = (roomId: string): DailyWordRoom | undefined =>
    ctx.rooms.ofType<DailyWordState>(roomId, 'daily-word');

  const startGame = (room: DailyWordRoom) => {
    const game = room.game;
    game.words = roomWords(random(), game.rounds, new Date());
    game.round = 0;
    game.boards.clear();
    game.found.clear();
    game.lastRound = null;
    game.lastGame = null;
    room.playerList = resetPoints(room.playerList);
    room.isGameStarted = true;

    console.log(
      `Daily Word started in room ${room.roomId}, ${game.rounds} words.`,
    );

    ctx.rooms.announce(room.roomId, 'system', {
      type: 'dw:started',
      rounds: game.rounds,
      seconds: durations.round,
    });
    ctx.rooms.emitLobby('daily-word');

    beginRound(room);
  };

  const beginRound = (room: DailyWordRoom) => {
    const game = room.game;
    game.phase = 'guessing';
    game.round += 1;
    game.boards.clear();
    ctx.rooms.startPhase(room, durations.round, () => endRound(room));
    ctx.rooms.emitState(room);
  };

  /**
   * A guess at the open word. It must be a valid word not guessed before, by
   * a seated player still guessing, while the round is open; the server marks
   * it, and scores it if it is the word.
   */
  const submitGuess = (
    roomId: string,
    playerId: string,
    word: string,
  ): GuessRefusal => {
    const room = roomOf(roomId);
    if (!room) return 'That room is gone.';
    const player = room.playerList[playerId];
    if (!player) return 'You are not in this room.';

    const game = room.game;
    if (!room.isGameStarted || game.phase !== 'guessing') {
      return 'The round is over.';
    }
    const board = game.boards.get(playerId) ?? emptyBoard();
    if (isDone(board)) return 'You are done with this word.';
    const problem = checkGuess(word, board.guesses);
    // The page checks the same rules and words the note itself.
    if (problem) return `The guess was refused: ${problem}.`;

    const marks = markGuess(word, currentWord(game));
    board.guesses.push(word);
    board.marks.push(marks);
    game.boards.set(playerId, board);

    if (isFound(marks)) {
      const roundMs = durations.round * 1000;
      const msLeft = Math.max(0, room.phaseEndsAt - Date.now());
      board.points = pointsForFind(board.guesses.length, msLeft, roundMs);
      board.secondsLeft = Math.ceil(msLeft / 1000);
      player.points += board.points;
      game.found.set(playerId, (game.found.get(playerId) ?? 0) + 1);

      ctx.rooms.emitState(room);
      ctx.rooms.announce(room.roomId, 'score', {
        type: 'dw:solved',
        name: player.username,
        guesses: board.guesses.length,
        points: board.points,
      });
    } else {
      ctx.rooms.emitState(room);
    }

    maybeEndEarly(room);
    return null;
  };

  /**
   * Once everybody who could still find the word is done, the rest of its
   * clock is dead time. A player inside their reconnect grace is not waited
   * for.
   */
  const maybeEndEarly = (room: DailyWordRoom) => {
    if (!room.isGameStarted || room.game.phase !== 'guessing') return;

    const stillGuessing = Object.entries(room.playerList).some(
      ([playerId, player]) =>
        player.isConnected && !isDone(room.game.boards.get(playerId)),
    );
    if (stillGuessing) return;

    endRound(room);
  };

  const endRound = (room: DailyWordRoom) => {
    const game = room.game;
    if (!room.isGameStarted) return;

    const word = currentWord(game);
    const boards: DailyWordBoard[] = Object.entries(room.playerList).map(
      ([playerId, player]) =>
        boardView(
          playerId,
          player.username,
          game.boards.get(playerId) ?? emptyBoard(),
          true,
        ),
    );

    game.lastRound = {
      word,
      boards: boards.toSorted((a, b) => b.points - a.points),
    };
    game.boards.clear();
    game.phase = 'reveal';
    // What comes after the reveal: the next word, or the final scores.
    const last = game.round >= game.rounds;
    ctx.rooms.startPhase(room, durations.reveal, () =>
      last ? endGame(room, { endedEarly: false }) : beginRound(room),
    );

    ctx.rooms.emitState(room);
    ctx.rooms.announce(room.roomId, 'system', {
      type: 'dw:revealed',
      word: word.toUpperCase(),
    });
  };

  /** The last round's results stay, for the results screen and a refresh. */
  const endGame = (
    room: DailyWordRoom,
    { endedEarly }: { endedEarly: boolean },
  ) => {
    ctx.rooms.stopPhase(room);
    const game = room.game;

    const standings = standingsOf(room.playerList);

    game.lastGame = {
      endedEarly,
      standings,
      // A round still open when the game stopped was never finished.
      rounds: game.phase === 'guessing' ? game.round - 1 : game.round,
      found: Object.fromEntries(
        standings.map(({ playerId }) => [
          playerId,
          game.found.get(playerId) ?? 0,
        ]),
      ),
    };

    room.isGameStarted = false;
    game.phase = 'waiting';
    game.round = 0;
    game.words = [];
    game.boards.clear();

    ctx.rooms.emitState(room);
    // A game cut short has no result: game:interrupted already said so.
    if (!endedEarly) {
      ctx.rooms.announce(room.roomId, 'success', gameOverNotice(standings));
    }
    ctx.rooms.emitLobby('daily-word');
  };

  /** Called after the seat is already gone from `playerList`. */
  const handlePlayerDeparture = (room: DailyWordRoom, playerId: string) => {
    // The board stays until the round ends: one who has found the word could
    // otherwise leave, come back to watch, and say it. Nothing else reads a
    // board for somebody no longer seated.
    room.game.found.delete(playerId);

    if (!room.isGameStarted) return;

    if (seatCount(room) < SEATS['daily-word'].min) {
      ctx.rooms.announce(room.roomId, 'alert', { type: 'game:interrupted' });
      endGame(room, { endedEarly: true });
      return;
    }

    // The round may have been waiting only on them.
    maybeEndEarly(room);
  };

  /** Their seat, score and board are held; the round just stops waiting. */
  const handleDisconnect = (room: DailyWordRoom) => {
    if (!room.isGameStarted) return;
    maybeEndEarly(room);
  };

  return {
    startGame,
    submitGuess,
    mayChat,
    handlePlayerDeparture,
    handleDisconnect,
  };
};

type DailyWordGameEngine = ReturnType<typeof createDailyWordGameEngine>;

export { createDailyWordGameEngine };
export type { DailyWordGameEngine, DailyWordRoom, DailyWordSettings };
