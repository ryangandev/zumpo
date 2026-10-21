import type {
  GomokuColor,
  GomokuColors,
  GomokuEnding,
  Standing,
} from '../../models/types.js';
import type { GameContext } from '../../libs/rooms/types.js';
import {
  gomokuDurationsInSeconds as defaultDurations,
  type GomokuDurationsInSeconds,
} from '../../libs/game-clock.js';
import {
  boardOf,
  fivesThrough,
  isFull,
  MISSED_TURNS_TO_LOSE,
  otherColor,
  stonesOf,
} from '../../../shared/gomoku.js';
import type { GomokuRoom } from './state.js';

/** The colour `playerId` plays this game, or null for anybody else. */
const colorOf = (room: GomokuRoom, playerId: string): GomokuColor | null => {
  const colors = room.game.colors;
  if (colors?.black.playerId === playerId) return 'black';
  if (colors?.white.playerId === playerId) return 'white';
  return null;
};

/** Who plays `color` this game; only asked while there are colours. */
const sideOf = (room: GomokuRoom, color: GomokuColor) =>
  room.game.colors![color];

const isTurnOf = (room: GomokuRoom, playerId: string) =>
  room.isGameStarted &&
  room.game.phase === 'playing' &&
  room.game.turnPlayerId === playerId;

/** Most games won first. */
const gomokuStandings = (room: GomokuRoom): Standing[] =>
  Object.entries(room.playerList)
    .map(([playerId, player]) => ({
      playerId,
      username: player.username,
      points: player.points,
    }))
    .toSorted((a, b) => b.points - a.points);

/**
 * Owns a game: whose turn it is, the move clock, lost turns, the colours, and
 * how a game ends. One stone a turn on an empty point; five or more in a row
 * wins, a full board is a draw.
 */
const createGomokuGameEngine = (
  ctx: GameContext,
  durations: GomokuDurationsInSeconds = defaultDurations,
  random: () => number = Math.random,
) => {
  const roomOf = (roomId: string): GomokuRoom | undefined =>
    ctx.rooms.ofType(roomId, 'gomoku');

  /**
   * The same two players as last game swap colours, so each has the first
   * move in turn; a new pair is drawn at random.
   */
  const colorsFor = (room: GomokuRoom): GomokuColors => {
    const seated = Object.keys(room.playerList);
    const side = (playerId: string) => ({
      playerId,
      username: room.playerList[playerId]?.username ?? '',
    });
    const last = room.game.colors;
    const samePair =
      last !== null &&
      seated.length === 2 &&
      seated.includes(last.black.playerId) &&
      seated.includes(last.white.playerId);
    if (samePair) {
      return {
        black: side(last.white.playerId),
        white: side(last.black.playerId),
      };
    }
    const [first = '', second = ''] =
      random() < 0.5 ? seated : seated.toReversed();
    return { black: side(first), white: side(second) };
  };

  const startGame = (room: GomokuRoom) => {
    const game = room.game;
    game.colors = colorsFor(room);
    game.moves = [];
    game.missedTurns = {
      [game.colors.black.playerId]: 0,
      [game.colors.white.playerId]: 0,
    };
    game.winLines = null;
    game.lastGame = null;
    game.phase = 'playing';
    room.isGameStarted = true;

    console.log(`Gomoku started in room ${room.roomId}.`);

    ctx.rooms.announce(room.roomId, 'system', {
      type: 'gomoku:started',
      black: game.colors.black.username,
      white: game.colors.white.username,
      seconds: durations.turn,
    });
    ctx.rooms.emitLobby('gomoku');

    beginTurn(room, game.colors.black.playerId);
  };

  /** `playerId` places a stone, with a fresh clock. */
  const beginTurn = (room: GomokuRoom, playerId: string) => {
    room.game.turnPlayerId = playerId;
    ctx.rooms.startPhase(room, durations.turn, () => runOutOfTime(room));
    ctx.rooms.emitState(room);
  };

  /** The turn passes with no stone; a second in a row loses the game. */
  const runOutOfTime = (room: GomokuRoom) => {
    const game = room.game;
    const playerId = game.turnPlayerId;
    if (!room.isGameStarted || game.phase !== 'playing' || !playerId) return;
    const color = colorOf(room, playerId);
    if (color === null) return;

    game.moves.push({ color, point: null });
    const missed = (game.missedTurns[playerId] ?? 0) + 1;
    game.missedTurns[playerId] = missed;
    if (missed >= MISSED_TURNS_TO_LOSE) {
      endGame(room, 'timeout', otherColor(color));
      return;
    }
    ctx.rooms.announce(room.roomId, 'alert', {
      type: 'gomoku:timeout',
      name: sideOf(room, color).username,
    });
    beginTurn(room, sideOf(room, otherColor(color)).playerId);
  };

  /** A stone on an empty point, on your turn; anything else is ignored. */
  const place = (roomId: string, playerId: string, point: number) => {
    const room = roomOf(roomId);
    if (!room || !isTurnOf(room, playerId)) return;
    const color = colorOf(room, playerId);
    if (color === null) return;
    const game = room.game;
    const board = boardOf(game.moves);
    if (board[point] !== null) return;

    game.moves.push({ color, point });
    game.missedTurns[playerId] = 0;
    board[point] = color;

    const fives = fivesThrough(board, point, color);
    if (fives.length > 0) {
      game.winLines = fives;
      endGame(room, 'five', color);
      return;
    }
    if (isFull(board)) {
      endGame(room, 'draw', null);
      return;
    }
    beginTurn(room, sideOf(room, otherColor(color)).playerId);
  };

  /** Giving the game to the other player, at the table and while it is on. */
  const resign = (roomId: string, playerId: string) => {
    const room = roomOf(roomId);
    if (!room?.isGameStarted || room.game.phase !== 'playing') return;
    const color = colorOf(room, playerId);
    if (color === null || !room.playerList[playerId]) return;
    endGame(room, 'resigned', otherColor(color));
  };

  /**
   * The winner scores a game, and the board stays on the table, with the
   * last summary, for the results screen and a refresh.
   */
  const endGame = (
    room: GomokuRoom,
    ending: GomokuEnding,
    winner: GomokuColor | null,
  ) => {
    ctx.rooms.stopPhase(room);
    const game = room.game;

    const winnerSide = winner === null ? null : sideOf(room, winner);
    const loserSide = winner === null ? null : sideOf(room, otherColor(winner));
    const winnerSeat = winnerSide && room.playerList[winnerSide.playerId];
    if (winnerSeat) winnerSeat.points += 1;

    game.lastGame = {
      endedEarly: ending === 'left',
      standings: gomokuStandings(room),
      ending,
      winner,
      stones: stonesOf(game.moves),
    };
    room.isGameStarted = false;
    game.phase = 'waiting';
    game.turnPlayerId = null;

    ctx.rooms.emitState(room);
    ctx.rooms.announce(room.roomId, winner === null ? 'system' : 'success', {
      type: 'gomoku:over',
      ending,
      winner: winnerSide?.username ?? null,
      loser: loserSide?.username ?? null,
    });
    ctx.rooms.emitLobby('gomoku');
  };

  /**
   * Called after the seat is already gone from `playerList`. A player who
   * leaves mid-game, or whose seat's grace runs out, loses it: with two seats
   * there is nobody else to play on with.
   */
  const handlePlayerDeparture = (room: GomokuRoom, playerId: string) => {
    if (!room.isGameStarted) return;
    const color = colorOf(room, playerId);
    if (color === null) return;
    endGame(room, 'left', otherColor(color));
  };

  return { startGame, place, resign, handlePlayerDeparture };
};

type GomokuGameEngine = ReturnType<typeof createGomokuGameEngine>;

export { createGomokuGameEngine };
export type { GomokuGameEngine };
