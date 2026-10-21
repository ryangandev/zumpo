import { SEATS } from '../../../shared/seats.js';
import type { GomokuSettings } from '../../models/types.js';
import type { GameModule, GameContext } from '../../libs/rooms/types.js';
import { onClientEvent, type IoSocket } from '../../libs/rooms/emit.js';
import { parseArgs } from '../../libs/validation.js';
import type { GomokuDurationsInSeconds } from '../../libs/game-clock.js';
import { createGomokuGameEngine } from './game-engine.js';
import { createState, toLobbyInfo, toRoomState } from './state.js';
import type { GomokuState } from './state.js';
import { noSettings, placeRequest, resignRequest } from './validation.js';

/**
 * Gomoku, as the room layer sees it: two seats, one board everybody may see,
 * one move clock, and no opinion about chat.
 */
const createGomokuModule = (
  ctx: GameContext,
  durations?: GomokuDurationsInSeconds,
  random?: () => number,
): GameModule<GomokuState, GomokuSettings> => {
  const engine = createGomokuGameEngine(ctx, durations, random);

  return {
    gameType: 'gomoku',
    minPlayers: SEATS['gomoku'].min,
    maxPlayers: SEATS['gomoku'].max,

    parseSettings: (raw) =>
      parseArgs(
        noSettings,
        raw,
        'room:create (gomoku)',
      ) as GomokuSettings | null,
    createState,
    toLobbyInfo,
    toRoomState,

    // The moves, the colours and the clock all travel in the snapshot.
    syncTo: () => {},

    startGame: (room) => engine.startGame(room),
    onDeparture: (room, playerId) =>
      engine.handlePlayerDeparture(room, playerId),
    // A turn does not wait for a dropped player: its clock keeps running, and
    // runs out as it would for anybody. Their seat's grace running out is a
    // departure, which loses the game.
    onDisconnect: () => {},
    onReturn: () => {},

    registerHandlers: (socket: IoSocket) => {
      onClientEvent(socket, 'gomoku:place', (...rawArgs: unknown[]) => {
        const validated = parseArgs(placeRequest, rawArgs, 'gomoku:place');
        if (!validated) return;
        const [roomId, point] = validated;

        // Identity comes from the connection, never from the payload.
        const playerId = socket.data.playerId;

        engine.place(roomId, playerId, point);
      });

      onClientEvent(socket, 'gomoku:resign', (...rawArgs: unknown[]) => {
        const validated = parseArgs(resignRequest, rawArgs, 'gomoku:resign');
        if (!validated) return;
        const [roomId] = validated;

        engine.resign(roomId, socket.data.playerId);
      });
    },
  };
};

export { createGomokuModule };
