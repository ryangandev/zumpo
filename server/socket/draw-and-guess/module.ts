import { SEATS } from '../../../shared/seats.js';
import type {
  DrawAndGuessSettings,
  DrawAndGuessState,
} from '../../models/types.js';
import type { GameContext, GameModule, Room } from '../../libs/rooms/types.js';
import { emitToSocket, type IoSocket } from '../../libs/rooms/emit.js';
import { parseArgs } from '../../libs/validation.js';
import type { PhaseDurationsInSeconds } from '../../libs/game-clock.js';
import { createDrawAndGuessGameEngine } from './game-engine.js';
import { gameEventsHandler } from './game-events-handler.js';
import { whiteboardCanvasEventHandler } from './whiteboard-canvas-events-handler.js';
import { createState, toLobbyInfo, toRoomState } from './state.js';
import { roundsSetting } from './validation.js';

/**
 * Draw & Guess, as the room layer sees it.
 *
 * Everything below is a hand-off: one object the server registers by name, and
 * one it could register a second of without touching a line of the room layer.
 *
 * This is also where the abstraction is either right or wrong, and it is worth
 * being able to point at: the room layer calls the members below and nothing
 * else. It never sees a drawer queue, a word, a canvas or a phase. It keeps
 * this game's clock and timers, so they end with the room, but what they wait
 * for and what happens when they fire is decided here.
 */
const createDrawAndGuessModule = (
  ctx: GameContext,
  phaseDurations?: PhaseDurationsInSeconds,
): GameModule<DrawAndGuessState, DrawAndGuessSettings> => {
  const engine = createDrawAndGuessGameEngine(ctx, phaseDurations);

  return {
    gameType: 'draw-and-guess',
    minPlayers: SEATS['draw-and-guess'].min,
    maxPlayers: SEATS['draw-and-guess'].max,

    parseSettings: (raw) =>
      parseArgs(roundsSetting, raw, 'room:create (draw-and-guess)'),
    createState,
    toLobbyInfo,
    toRoomState,

    /**
     * The drawing so far, which is too large to travel in every snapshot,
     * sent to one socket at the one moment its listeners are known to be
     * live. A joiner, a player returning from a reload and a drawer resuming
     * their own turn all arrive here. The word needs nothing of its own: the
     * drawer's snapshot carries it.
     */
    syncTo: (socket: IoSocket, room: Room<DrawAndGuessState>) => {
      emitToSocket(socket, 'dg:canvas:sync', room.roomId, [
        ...room.game.canvas.strokes,
      ]);
    },

    handleChat: (room, playerId, text) =>
      engine.handleChat(room, playerId, text),

    startGame: (room) => engine.startGame(room),
    onDeparture: (room, playerId) =>
      engine.handlePlayerDeparture(room, playerId),
    onDisconnect: (room, playerId) =>
      engine.handleDrawerDisconnect(room, playerId),
    onReturn: (room, playerId) => engine.handleDrawerReturn(room, playerId),

    registerHandlers: (socket: IoSocket) => {
      gameEventsHandler(socket, engine);
      whiteboardCanvasEventHandler(socket, ctx);
    },
  };
};

export { createDrawAndGuessModule };
