import { SEATS } from '../../../shared/seats.js';
import type {
  CodeBreakerBoard,
  CodeBreakerSettings,
} from '../../models/types.js';
import { seatCount } from '../../libs/rooms/seats.js';
import type { GameContext, Room } from '../../libs/rooms/types.js';
import { gameOverNotice, resetPoints, standingsOf } from '../../libs/utils.js';
import {
  codeBreakerDurationsInSeconds as defaultDurations,
  type CodeBreakerDurationsInSeconds,
} from '../../libs/game-clock.js';
import {
  checkGuess,
  isCracked,
  markGuess,
  pointsForCrack,
  roomCodes,
} from '../../../shared/code-breaker.js';
import { seededRandom, seedNumber } from '../../../shared/seed.js';
import {
  boardStatus,
  boardView,
  currentCode,
  emptyBoard,
  isDone,
  type CodeBreakerState,
} from './state.js';

type CodeBreakerRoom = Room<CodeBreakerState>;

/** Why a guess was not taken, for its acknowledgement; null when it was. */
type GuessRefusal = string | null;

/**
 * A player who has cracked the open code keeps quiet until its round ends,
 * because they could type it. One who is out of guesses does not know it.
 */
const mayChat = (room: CodeBreakerRoom, playerId: string) => {
  const board = room.game.boards.get(playerId);
  return !(
    room.game.phase === 'guessing' &&
    board !== undefined &&
    boardStatus(board) === 'cracked'
  );
};

/**
 * Owns the round loop. Like a Daily Word round, a round belongs to everybody
 * at once: the same code for every player, one clock, and a round that ends
 * early once everybody still connected has cracked it or run out of guesses.
 *
 * A game's codes are drawn at random, or, given a seed (a test run's), from
 * that seed afresh for every game, so each deals the same codes. Either way
 * they are drawn by `roomCodes`, so its rules hold.
 */
const createCodeBreakerGameEngine = (
  ctx: GameContext,
  durations: CodeBreakerDurationsInSeconds = defaultDurations,
  seed?: string,
) => {
  const random = () => (seed ? seededRandom(seedNumber(seed)) : Math.random);

  const roomOf = (roomId: string): CodeBreakerRoom | undefined =>
    ctx.rooms.ofType<CodeBreakerState>(roomId, 'code-breaker');

  const startGame = (room: CodeBreakerRoom) => {
    const game = room.game;
    game.codes = roomCodes(random(), game.rounds, new Date());
    game.round = 0;
    game.boards.clear();
    game.cracked.clear();
    game.lastRound = null;
    game.lastGame = null;
    room.playerList = resetPoints(room.playerList);
    room.isGameStarted = true;

    console.log(
      `Code Breaker started in room ${room.roomId}, ${game.rounds} codes.`,
    );

    ctx.rooms.announce(room.roomId, 'system', {
      type: 'cb:started',
      rounds: game.rounds,
      seconds: durations.round,
    });
    ctx.rooms.emitLobby('code-breaker');

    beginRound(room);
  };

  const beginRound = (room: CodeBreakerRoom) => {
    const game = room.game;
    game.phase = 'guessing';
    game.round += 1;
    game.boards.clear();
    ctx.rooms.startPhase(room, durations.round, () => endRound(room));
    ctx.rooms.emitState(room);
  };

  /**
   * A guess at the open code. It must be four different digits not guessed
   * before, by a seated player still guessing, while the round is open; the
   * server marks it, and scores it if it cracks the code.
   */
  const submitGuess = (
    roomId: string,
    playerId: string,
    guess: string,
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
    if (isDone(board)) return 'You are done with this code.';
    const problem = checkGuess(guess, board.guesses);
    // The page checks the same rules and words the note itself.
    if (problem) return `The guess was refused: ${problem}.`;

    const mark = markGuess(guess, currentCode(game));
    board.guesses.push(guess);
    board.marks.push(mark);
    game.boards.set(playerId, board);

    if (isCracked(mark)) {
      const roundMs = durations.round * 1000;
      const msLeft = Math.max(0, room.phaseEndsAt - Date.now());
      board.points = pointsForCrack(board.guesses.length, msLeft, roundMs);
      board.secondsLeft = Math.ceil(msLeft / 1000);
      player.points += board.points;
      game.cracked.set(playerId, (game.cracked.get(playerId) ?? 0) + 1);

      ctx.rooms.emitState(room);
      ctx.rooms.announce(room.roomId, 'success', {
        type: 'cb:cracked',
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
   * Once everybody who could still crack the code is done, the rest of its
   * clock is dead time. A player inside their reconnect grace is not waited
   * for.
   */
  const maybeEndEarly = (room: CodeBreakerRoom) => {
    if (!room.isGameStarted || room.game.phase !== 'guessing') return;

    const stillGuessing = Object.entries(room.playerList).some(
      ([playerId, player]) =>
        player.isConnected && !isDone(room.game.boards.get(playerId)),
    );
    if (stillGuessing) return;

    endRound(room);
  };

  const endRound = (room: CodeBreakerRoom) => {
    const game = room.game;
    if (!room.isGameStarted) return;

    const code = currentCode(game);
    const boards: CodeBreakerBoard[] = Object.entries(room.playerList).map(
      ([playerId, player]) =>
        boardView(
          playerId,
          player.username,
          game.boards.get(playerId) ?? emptyBoard(),
          true,
        ),
    );

    game.lastRound = {
      code,
      boards: boards.toSorted((a, b) => b.points - a.points),
    };
    game.boards.clear();
    game.phase = 'reveal';
    // What comes after the reveal: the next code, or the final scores.
    const last = game.round >= game.rounds;
    ctx.rooms.startPhase(room, durations.reveal, () =>
      last ? endGame(room, { endedEarly: false }) : beginRound(room),
    );

    ctx.rooms.emitState(room);
    ctx.rooms.announce(room.roomId, 'system', { type: 'cb:revealed', code });
  };

  /** The last round's results stay, for the results screen and a refresh. */
  const endGame = (
    room: CodeBreakerRoom,
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
      cracked: Object.fromEntries(
        standings.map(({ playerId }) => [
          playerId,
          game.cracked.get(playerId) ?? 0,
        ]),
      ),
    };

    room.isGameStarted = false;
    game.phase = 'waiting';
    game.round = 0;
    game.codes = [];
    game.boards.clear();

    ctx.rooms.emitState(room);
    // A game cut short has no result: game:interrupted already said so.
    if (!endedEarly) {
      ctx.rooms.announce(room.roomId, 'system', gameOverNotice(standings));
    }
    ctx.rooms.emitLobby('code-breaker');
  };

  /** Called after the seat is already gone from `playerList`. */
  const handlePlayerDeparture = (room: CodeBreakerRoom, playerId: string) => {
    // The board stays until the round ends: one who has cracked the code could
    // otherwise leave, come back to watch, and say it. Nothing else reads a
    // board for somebody no longer seated.
    room.game.cracked.delete(playerId);

    if (!room.isGameStarted) return;

    if (seatCount(room) < SEATS['code-breaker'].min) {
      ctx.rooms.announce(room.roomId, 'alert', { type: 'game:interrupted' });
      endGame(room, { endedEarly: true });
      return;
    }

    // The round may have been waiting only on them.
    maybeEndEarly(room);
  };

  /** Their seat, score and board are held; the round just stops waiting. */
  const handleDisconnect = (room: CodeBreakerRoom) => {
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

type CodeBreakerGameEngine = ReturnType<typeof createCodeBreakerGameEngine>;

export { createCodeBreakerGameEngine };
export type { CodeBreakerGameEngine, CodeBreakerRoom, CodeBreakerSettings };
