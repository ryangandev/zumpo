import { SEATS } from '../../../shared/seats.js';
import type { CodeBreakerSettings } from '../../models/types.js';
import type { GameModule, GameContext } from '../../libs/rooms/types.js';
import { onClientRequest, type IoSocket } from '../../libs/rooms/emit.js';
import { parseArgs } from '../../libs/validation.js';
import { invalidRequest } from '../../models/error.js';
import type { CodeBreakerDurationsInSeconds } from '../../libs/game-clock.js';
import { createCodeBreakerGameEngine } from './game-engine.js';
import { createState, toLobbyInfo, toRoomState } from './state.js';
import type { CodeBreakerState } from './state.js';
import { guessRequest, roundsSetting } from './validation.js';

/**
 * Code Breaker, as the room layer sees it: one timer, the open round's boards
 * as its per-player state, and one opinion about chat, which is that a player
 * who has cracked the code keeps quiet until the round ends.
 */
const createCodeBreakerModule = (
  ctx: GameContext,
  durations?: CodeBreakerDurationsInSeconds,
  seed?: string,
): GameModule<CodeBreakerState, CodeBreakerSettings> => {
  const engine = createCodeBreakerGameEngine(ctx, durations, seed);

  return {
    gameType: 'code-breaker',
    minPlayers: SEATS['code-breaker'].min,
    maxPlayers: SEATS['code-breaker'].max,

    parseSettings: (raw) =>
      parseArgs(roundsSetting, raw, 'room:create (code-breaker)'),
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
      onClientRequest(socket, 'cb:guess', (rawArgs, reply) => {
        const validated = parseArgs(guessRequest, rawArgs, 'cb:guess');
        if (!validated) {
          reply(invalidRequest());
          return;
        }
        const [roomId, guess] = validated;

        // Identity comes from the connection, never from the payload.
        const playerId = socket.data.playerId;

        const refusal = engine.submitGuess(roomId, playerId, guess);
        reply(refusal ? invalidRequest(refusal) : { ok: true });
      });
    },
  };
};

export { createCodeBreakerModule };
