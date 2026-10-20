import { SEATS } from '../../../shared/seats.js';
import type { TriosSettings } from '../../models/types.js';
import type { GameModule, GameContext } from '../../libs/rooms/types.js';
import { onClientEvent, type IoSocket } from '../../libs/rooms/emit.js';
import { parseArgs } from '../../libs/validation.js';
import type { TriosDurationsInSeconds } from '../../libs/game-clock.js';
import { createTriosGameEngine } from './game-engine.js';
import { createState, toLobbyInfo, toRoomState } from './state.js';
import type { TriosState } from './state.js';
import { claimRequest, triosSetting } from './validation.js';

/**
 * Trios, as the room layer sees it: no turns, so nobody's absence holds
 * anything up, and no opinion about chat, since the table is everybody's.
 */
const createTriosModule = (
  ctx: GameContext,
  durations?: TriosDurationsInSeconds,
): GameModule<TriosState, TriosSettings> => {
  const engine = createTriosGameEngine(ctx, durations);

  return {
    gameType: 'trios',
    minPlayers: SEATS['trios'].min,
    maxPlayers: SEATS['trios'].max,

    parseSettings: (raw) => parseArgs(triosSetting, raw, 'room:create (trios)'),
    createState,
    toLobbyInfo,
    toRoomState,

    // The table, the last trio and a lockout all travel in the snapshot.
    syncTo: () => {},

    startGame: (room) => engine.startGame(room),
    onDeparture: (room, playerId) =>
      engine.handlePlayerDeparture(room, playerId),
    // Nobody waits for a dropped player: the table stays in play for the rest,
    // and a lockout runs out on its own.
    onDisconnect: () => {},
    onReturn: () => {},

    registerHandlers: (socket: IoSocket) => {
      onClientEvent(socket, 'trios:claim', (...rawArgs: unknown[]) => {
        const validated = parseArgs(claimRequest, rawArgs, 'trios:claim');
        if (!validated) return;
        const [roomId, cards] = validated;

        // Identity comes from the connection, never from the payload.
        const playerId = socket.data.playerId;

        engine.claim(roomId, playerId, cards);
      });
    },
  };
};

export { createTriosModule };
