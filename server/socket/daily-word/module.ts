import { SEATS } from '../../../shared/seats.js';
import type { DailyWordSettings } from '../../models/types.js';
import type { GameModule, GameContext } from '../../libs/rooms/types.js';
import { onClientRequest, type IoSocket } from '../../libs/rooms/emit.js';
import { parseArgs } from '../../libs/validation.js';
import { invalidRequest } from '../../models/error.js';
import type { DailyWordDurationsInSeconds } from '../../libs/game-clock.js';
import { createDailyWordGameEngine } from './game-engine.js';
import { createState, toLobbyInfo, toRoomState } from './state.js';
import type { DailyWordState } from './state.js';
import { guessRequest, roundsSetting } from './validation.js';

/**
 * Daily Word, as the room layer sees it: one timer, the open round's boards as
 * its per-player state, and one opinion about chat, which is that a player who
 * has found the word keeps quiet until the round ends.
 */
const createDailyWordModule = (
  ctx: GameContext,
  durations?: DailyWordDurationsInSeconds,
  seed?: string,
): GameModule<DailyWordState, DailyWordSettings> => {
  const engine = createDailyWordGameEngine(ctx, durations, seed);

  return {
    gameType: 'daily-word',
    minPlayers: SEATS['daily-word'].min,
    maxPlayers: SEATS['daily-word'].max,

    parseSettings: (raw) =>
      parseArgs(roundsSetting, raw, 'room:create (daily-word)'),
    createState,
    toLobbyInfo,
    toRoomState,

    // The boards and the last round's results all travel in the snapshot.
    syncTo: () => {},

    handleChat: (room, playerId) =>
      engine.mayChat(room, playerId) ? 'chat' : 'blocked',

    startGame: (room) => engine.startGame(room),
    onDeparture: (room, playerId) =>
      engine.handlePlayerDeparture(room, playerId),
    onDisconnect: (room) => engine.handleDisconnect(room),
    onReturn: () => {},

    registerHandlers: (socket: IoSocket) => {
      onClientRequest(socket, 'dw:guess', (rawArgs, reply) => {
        const validated = parseArgs(guessRequest, rawArgs, 'dw:guess');
        if (!validated) {
          reply(invalidRequest());
          return;
        }
        const [roomId, word] = validated;

        // Identity comes from the connection, never from the payload.
        const playerId = socket.data.playerId;

        const refusal = engine.submitGuess(roomId, playerId, word);
        reply(refusal ? invalidRequest(refusal) : { ok: true });
      });
    },
  };
};

export { createDailyWordModule };
