import { SEATS } from '../../../shared/seats.js';
import type { Make24Settings, Make24Step } from '../../models/types.js';
import type { GameModule, GameContext } from '../../libs/rooms/types.js';
import { onClientEvent, type IoSocket } from '../../libs/rooms/emit.js';
import { parseArgs } from '../../libs/validation.js';
import type { Make24DurationsInSeconds } from '../../libs/game-clock.js';
import { createMake24GameEngine } from './game-engine.js';
import { createState, toLobbyInfo, toRoomState } from './state.js';
import type { Make24State } from './state.js';
import { handsSetting, solveRequest } from './validation.js';

/**
 * Make 24, as the room layer sees it: one timer, no per-player state beyond
 * the open hand's solves, and one opinion about chat, which is that a player
 * who has solved the hand keeps quiet until it ends.
 */
const createMake24Module = (
  ctx: GameContext,
  durations?: Make24DurationsInSeconds,
): GameModule<Make24State, Make24Settings> => {
  const engine = createMake24GameEngine(ctx, durations);

  return {
    gameType: 'make-24',
    minPlayers: SEATS['make-24'].min,
    maxPlayers: SEATS['make-24'].max,

    parseSettings: (raw) =>
      parseArgs(handsSetting, raw, 'room:create (make-24)'),
    createState,
    toLobbyInfo,
    toRoomState,

    // The hand, the player's own solve and the last results all travel in
    // the snapshot.
    syncTo: () => {},

    handleChat: (room, playerId) =>
      engine.mayChat(room, playerId) ? 'chat' : 'blocked',

    startGame: (room) => engine.startGame(room),
    onDeparture: (room, playerId) =>
      engine.handlePlayerDeparture(room, playerId),
    onDisconnect: (room) => engine.handleDisconnect(room),
    onReturn: () => {},

    registerHandlers: (socket: IoSocket) => {
      onClientEvent(socket, 't24:solve', (...rawArgs: unknown[]) => {
        const validated = parseArgs(solveRequest, rawArgs, 't24:solve');
        if (!validated) return;
        const [roomId, steps] = validated;

        // Identity comes from the connection, never from the payload.
        const playerId = socket.data.playerId;

        engine.submitSolve(roomId, playerId, steps as Make24Step[]);
      });
    },
  };
};

export { createMake24Module };
