import { SEATS } from '../../../shared/seats.js';
import type { HushSettings } from '../../models/types.js';
import type { GameModule, GameContext } from '../../libs/rooms/types.js';
import { onClientEvent, type IoSocket } from '../../libs/rooms/emit.js';
import { parseArgs } from '../../libs/validation.js';
import type { HushDurationsInSeconds } from '../../libs/game-clock.js';
import { createHushGameEngine } from './game-engine.js';
import { createState, toLobbyInfo, toRoomState } from './state.js';
import type { HushState } from './state.js';
import { noSettings, playRequest, readyRequest } from './validation.js';

/**
 * Hush, as the room layer sees it: no turns, a hushed chat while a level is
 * played, and a level that waits for a dropped player who still holds cards.
 */
const createHushModule = (
  ctx: GameContext,
  durations?: HushDurationsInSeconds,
  graceInSeconds?: number,
  seed?: string,
): GameModule<HushState, HushSettings> => {
  const engine = createHushGameEngine(ctx, durations, graceInSeconds, seed);

  return {
    gameType: 'hush',
    minPlayers: SEATS['hush'].min,
    maxPlayers: SEATS['hush'].max,

    parseSettings: (raw) =>
      parseArgs(noSettings, raw, 'room:create (hush)') as HushSettings | null,
    createState,
    toLobbyInfo,
    toRoomState,

    // The hand, the pile and the last results all travel in the snapshot.
    syncTo: () => {},

    // Saying a number would give the level away, so a level is played hushed.
    handleChat: (room) => (engine.mayChat(room) ? 'chat' : 'blocked'),

    startGame: (room) => engine.startGame(room),
    onDeparture: (room, playerId) =>
      engine.handlePlayerDeparture(room, playerId),
    onDisconnect: (room, playerId) => engine.handleDisconnect(room, playerId),
    onReturn: (room, playerId) => engine.handleReturn(room, playerId),

    registerHandlers: (socket: IoSocket) => {
      // Identity comes from the connection, never from the payload.
      onClientEvent(socket, 'hush:ready', (...rawArgs: unknown[]) => {
        const validated = parseArgs(readyRequest, rawArgs, 'hush:ready');
        if (!validated) return;
        engine.ready(validated[0], socket.data.playerId);
      });

      onClientEvent(socket, 'hush:play', (...rawArgs: unknown[]) => {
        const validated = parseArgs(playRequest, rawArgs, 'hush:play');
        if (!validated) return;
        const [roomId, card] = validated;
        engine.play(roomId, socket.data.playerId, card);
      });
    },
  };
};

export { createHushModule };
