import { SEATS } from '../../../shared/seats.js';
import type { PairsSettings } from '../../models/types.js';
import type { GameModule, GameContext } from '../../libs/rooms/types.js';
import { onClientEvent, type IoSocket } from '../../libs/rooms/emit.js';
import { parseArgs } from '../../libs/validation.js';
import type { PairsDurationsInSeconds } from '../../libs/game-clock.js';
import { createPairsGameEngine } from './game-engine.js';
import { createState, toLobbyInfo, toRoomState } from './state.js';
import type { PairsState } from './state.js';
import { boardSetting, flipRequest } from './validation.js';

/**
 * Pairs, as the room layer sees it: one timer, a turn order, and no opinion
 * about chat, since nothing said there gives a card away that everybody did
 * not already see.
 */
const createPairsModule = (
  ctx: GameContext,
  durations?: PairsDurationsInSeconds,
): GameModule<PairsState, PairsSettings> => {
  const engine = createPairsGameEngine(ctx, durations);

  return {
    gameType: 'pairs',
    minPlayers: SEATS['pairs'].min,
    maxPlayers: SEATS['pairs'].max,

    parseSettings: (raw) => parseArgs(boardSetting, raw, 'room:create (pairs)'),
    createState,
    toLobbyInfo,
    toRoomState,

    // The board, the turn and the last results all travel in the snapshot.
    syncTo: () => {},

    startGame: (room) => engine.startGame(room),
    onDeparture: (room, playerId) =>
      engine.handlePlayerDeparture(room, playerId),
    // A turn does not wait for a dropped player: its clock keeps running, and
    // a turn that comes round while they are away skips them.
    onDisconnect: () => {},
    onReturn: () => {},

    registerHandlers: (socket: IoSocket) => {
      onClientEvent(socket, 'pairs:flip', (...rawArgs: unknown[]) => {
        const validated = parseArgs(flipRequest, rawArgs, 'pairs:flip');
        if (!validated) return;
        const [roomId, index] = validated;

        // Identity comes from the connection, never from the payload.
        const playerId = socket.data.playerId;

        engine.flip(roomId, playerId, index);
      });
    },
  };
};

export { createPairsModule };
