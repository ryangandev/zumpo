import type {
  Make24HandResult,
  Make24Settings,
  Make24Step,
} from '../../models/types.js';
import { RequestError } from '../../models/error.js';
import { seatCount } from '../../libs/rooms/seats.js';
import type { GameContext, Room } from '../../libs/rooms/types.js';
import { gameOverNotice, resetPoints } from '../../libs/utils.js';
import {
  make24DurationsInSeconds as defaultDurations,
  type Make24DurationsInSeconds,
} from '../../libs/game-clock.js';
import {
  dealHands,
  formatExpression,
  play,
  solve,
  solves,
} from '../../../shared/make-24.js';
import { currentDeal, type Make24State } from './state.js';

const MIN_PLAYERS_TO_START = 2;

type Make24Room = Room<Make24State>;

/**
 * What a solve is worth: 50 for getting there at all, and up to 100 more for
 * how much of the hand's clock was left, as a guess is in Draw & Guess.
 */
const pointsForSolve = (msLeft: number, handMs: number): number =>
  50 + Math.round((100 * Math.max(0, Math.min(msLeft, handMs))) / handMs);

/**
 * A player who has solved the open hand keeps quiet until it ends, and so
 * does a spectator, who sees the same four cards with nothing at stake and
 * could work the answer out for a friend.
 */
const mayChat = (room: Make24Room, playerId: string) =>
  !(
    room.game.phase === 'solving' &&
    (room.game.solves.has(playerId) || !room.playerList[playerId])
  );

/**
 * Owns the hand loop. Like a Minesweeper round, a hand belongs to everybody
 * at once: the same four cards for every player, one clock, and a hand that
 * ends early once everybody still connected has solved it.
 */
const createMake24GameEngine = (
  ctx: GameContext,
  durations: Make24DurationsInSeconds = defaultDurations,
) => {
  const roomOf = (roomId: string): Make24Room | undefined =>
    ctx.rooms.ofType<Make24State>(roomId, 'make-24');

  const startGame = (room: Make24Room, playerId: string) => {
    if (room.owner.playerId !== playerId) {
      throw new RequestError(
        'notRoomOwner',
        'Only the room owner can start the game.',
      );
    }
    if (room.isGameStarted) {
      throw new RequestError(
        'gameAlreadyStarted',
        'The game has already started.',
      );
    }
    if (seatCount(room) < MIN_PLAYERS_TO_START) {
      throw new RequestError(
        'notEnoughPlayers',
        `At least ${MIN_PLAYERS_TO_START} players are required to start.`,
      );
    }

    const game = room.game;
    game.deals = dealHands(Math.random, game.hands);
    game.hand = 0;
    game.solves.clear();
    game.lastHand = [];
    game.lastDeal = [];
    game.lastSolution = '';
    game.lastGame = null;
    room.playerList = resetPoints(room.playerList);
    room.isGameStarted = true;

    console.log(`Make 24 started in room ${room.roomId}, ${game.hands} hands.`);

    ctx.rooms.announce(room.roomId, 'system', {
      type: 'make24:started',
      hands: game.hands,
      seconds: durations.hand,
    });
    ctx.rooms.emitLobby('make-24');

    beginHand(room);
  };

  const beginHand = (room: Make24Room) => {
    const game = room.game;
    game.phase = 'solving';
    game.hand += 1;
    game.solves.clear();
    ctx.rooms.startPhase(room, durations.hand, () => endHand(room));
    ctx.rooms.emitState(room);
  };

  /**
   * A player says they have made 24. The steps are replayed on the hand the
   * server dealt, and only steps that use every card and end on 24 count.
   * One solve each, and only while the hand is open.
   */
  const submitSolve = (
    roomId: string,
    playerId: string,
    steps: readonly Make24Step[],
  ) => {
    const room = roomOf(roomId);
    if (!room?.isGameStarted) return;

    const game = room.game;
    if (game.phase !== 'solving') return;
    const player = room.playerList[playerId];
    if (!player) return;
    if (game.solves.has(playerId)) return;

    const deal = currentDeal(game);
    if (!solves(deal, steps)) return;

    const handMs = durations.hand * 1000;
    const msLeft = Math.max(0, room.phaseEndsAt - Date.now());
    const points = pointsForSolve(msLeft, handMs);
    game.solves.set(playerId, {
      points,
      secondsLeft: Math.ceil(msLeft / 1000),
      expression: formatExpression(play(deal, steps)![0].expression),
    });
    player.points += points;

    ctx.rooms.emitState(room);
    ctx.rooms.announce(room.roomId, 'success', {
      type: 'make24:solved',
      name: player.username,
      points,
    });

    maybeEndEarly(room);
  };

  /**
   * Once everybody who could still solve the hand has, the rest of its clock
   * is dead time. A player inside their reconnect grace is not waited for.
   */
  const maybeEndEarly = (room: Make24Room) => {
    if (!room.isGameStarted || room.game.phase !== 'solving') return;

    const stillSolving = Object.entries(room.playerList).some(
      ([playerId, player]) =>
        player.isConnected && !room.game.solves.has(playerId),
    );
    if (stillSolving) return;

    endHand(room);
  };

  const endHand = (room: Make24Room) => {
    ctx.rooms.stopPhase(room);
    const game = room.game;
    if (!room.isGameStarted) return;

    const results: Make24HandResult[] = Object.entries(room.playerList).map(
      ([playerId, player]) => {
        const solved = game.solves.get(playerId);
        return {
          playerId,
          username: player.username,
          solved: solved !== undefined,
          points: solved?.points ?? 0,
          secondsLeft: solved?.secondsLeft ?? 0,
          expression: solved?.expression ?? '',
        };
      },
    );

    game.lastHand = results.toSorted((a, b) => b.points - a.points);
    game.lastDeal = currentDeal(game);
    // Every hand is dealt solvable.
    game.lastSolution = formatExpression(solve(currentDeal(game))!);
    game.solves.clear();
    game.phase = 'reveal';
    const lastHand = game.hand >= game.hands;
    ctx.rooms.startPhase(room, durations.reveal, () =>
      lastHand ? endGame(room, { endedEarly: false }) : beginHand(room),
    );
    ctx.rooms.emitState(room);
  };

  /** The last hand's results stay, for the results screen and a refresh. */
  const endGame = (
    room: Make24Room,
    { endedEarly }: { endedEarly: boolean },
  ) => {
    ctx.rooms.stopPhase(room);
    const game = room.game;

    const standings = Object.entries(room.playerList)
      .map(([playerId, player]) => ({
        playerId,
        username: player.username,
        points: player.points,
      }))
      .toSorted((a, b) => b.points - a.points);

    game.lastGame = {
      endedEarly,
      standings,
      // A hand still open when the game stopped was never finished.
      hands: game.phase === 'solving' ? game.hand - 1 : game.hand,
    };

    room.isGameStarted = false;
    game.phase = 'waiting';
    game.hand = 0;
    game.deals = [];
    game.solves.clear();

    ctx.rooms.emitState(room);
    ctx.rooms.announce(room.roomId, 'system', gameOverNotice(standings));
    ctx.rooms.emitLobby('make-24');
  };

  /** Called after the seat is already gone from `playerList`. */
  const handlePlayerDeparture = (room: Make24Room, playerId: string) => {
    room.game.solves.delete(playerId);

    if (!room.isGameStarted) return;

    if (seatCount(room) < MIN_PLAYERS_TO_START) {
      ctx.rooms.announce(room.roomId, 'alert', { type: 'game:interrupted' });
      endGame(room, { endedEarly: true });
      return;
    }

    // The hand may have been waiting only on them.
    maybeEndEarly(room);
  };

  /** Their seat and score are held; the hand just stops waiting for them. */
  const handleDisconnect = (room: Make24Room) => {
    if (!room.isGameStarted) return;
    maybeEndEarly(room);
  };

  return {
    startGame,
    submitSolve,
    mayChat,
    handlePlayerDeparture,
    handleDisconnect,
  };
};

type Make24GameEngine = ReturnType<typeof createMake24GameEngine>;

export { createMake24GameEngine, pointsForSolve, MIN_PLAYERS_TO_START };
export type { Make24GameEngine, Make24Room, Make24Settings };
