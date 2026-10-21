import { SEATS } from '../../../shared/seats.js';
import type { SnapSettings } from '../../models/types.js';
import type { GameModule, GameContext } from '../../libs/rooms/types.js';
import { onClientEvent, type IoSocket } from '../../libs/rooms/emit.js';
import { parseArgs } from '../../libs/validation.js';
import type { SnapDurationsInSeconds } from '../../libs/game-clock.js';
import { createSnapGameEngine } from './game-engine.js';
import { createState, toLobbyInfo, toRoomState } from './state.js';
import type { SnapState } from './state.js';
import { claimRequest, noSettings } from './validation.js';

/**
 * Snap, as the room layer sees it: no turns, so nobody's absence holds
 * anything up, and no opinion about chat, since the middle card is
 * everybody's.
 */
const createSnapModule = (
  ctx: GameContext,
  durations?: SnapDurationsInSeconds,
): GameModule<SnapState, SnapSettings> => {
  const engine = createSnapGameEngine(ctx, durations);

  return {
    gameType: 'snap',
    minPlayers: SEATS['snap'].min,
    maxPlayers: SEATS['snap'].max,

    parseSettings: (raw) =>
      parseArgs(noSettings, raw, 'room:create (snap)') as SnapSettings | null,
    createState,
    toLobbyInfo,
    toRoomState,

    // The cards, the last take and a lockout all travel in the snapshot.
    syncTo: () => {},

    startGame: (room) => engine.startGame(room),
    onDeparture: (room, playerId) =>
      engine.handlePlayerDeparture(room, playerId),
    // Nobody waits for a dropped player: the middle card stays in play for
    // the rest, and a lockout runs out on its own.
    onDisconnect: () => {},
    onReturn: () => {},

    registerHandlers: (socket: IoSocket) => {
      onClientEvent(socket, 'snap:claim', (...rawArgs: unknown[]) => {
        const validated = parseArgs(claimRequest, rawArgs, 'snap:claim');
        if (!validated) return;
        const [roomId, card, symbol] = validated;

        // Identity comes from the connection, never from the payload.
        const playerId = socket.data.playerId;

        engine.claim(roomId, playerId, card, symbol);
      });
    },
  };
};

export { createSnapModule };
