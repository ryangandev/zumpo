import { SEATS } from '../../../shared/seats.js';
import type { DoodleChainSettings } from '../../models/types.js';
import type { GameContext, GameModule } from '../../libs/rooms/types.js';
import { onClientEvent, type IoSocket } from '../../libs/rooms/emit.js';
import { parseArgs, roomIdOnly } from '../../libs/validation.js';
import {
  continueDrawingRequest,
  startDrawingRequest,
} from '../../libs/drawing/validation.js';
import type { DoodleChainDurationsInSeconds } from '../../libs/game-clock.js';
import { createDoodleChainGameEngine } from './game-engine.js';
import { createState, toLobbyInfo, toRoomState } from './state.js';
import type { DoodleChainState } from './state.js';
import {
  doneRequest,
  drawingTimeSetting,
  heartRequest,
  nextRequest,
  textRequest,
} from './validation.js';

/**
 * Doodle Chain, as the room layer sees it: everybody plays every step at
 * once, nobody sees a chain until the reveal, and every message is chat.
 */
const createDoodleChainModule = (
  ctx: GameContext,
  durations?: DoodleChainDurationsInSeconds,
): GameModule<DoodleChainState, DoodleChainSettings> => {
  const engine = createDoodleChainGameEngine(ctx, durations);

  return {
    gameType: 'doodle-chain',
    minPlayers: SEATS['doodle-chain'].min,
    maxPlayers: SEATS['doodle-chain'].max,

    parseSettings: (raw) =>
      parseArgs(drawingTimeSetting, raw, 'room:create (doodle-chain)'),
    createState,
    toLobbyInfo,
    toRoomState,

    // Drawings are too large for every snapshot, so they travel on their own.
    syncTo: (socket, room, playerId) => engine.syncTo(socket, room, playerId),

    startGame: (room) => engine.startGame(room),
    onDeparture: (room, playerId) =>
      engine.handlePlayerDeparture(room, playerId),
    // The game never waits for anybody: a step runs to its clock, and a dropped
    // player's work so far is kept for them.
    onDisconnect: () => {},
    onReturn: () => {},

    registerHandlers: (socket: IoSocket) => {
      // Identity comes from the connection, never from the payload.
      const playerId = () => socket.data.playerId;

      onClientEvent(socket, 'dc:text', (...rawArgs: unknown[]) => {
        const validated = parseArgs(textRequest, rawArgs, 'dc:text');
        if (!validated) return;
        engine.setText(validated[0], playerId(), validated[1]);
      });

      onClientEvent(socket, 'dc:done', (...rawArgs: unknown[]) => {
        const validated = parseArgs(doneRequest, rawArgs, 'dc:done');
        if (!validated) return;
        engine.setDone(validated[0], playerId(), validated[1]);
      });

      onClientEvent(socket, 'dc:draw:start', (...rawArgs: unknown[]) => {
        const validated = parseArgs(
          startDrawingRequest,
          rawArgs,
          'dc:draw:start',
        );
        if (!validated) return;
        const [roomId, point, color, size] = validated;
        engine.draw.start(roomId, playerId(), point, color, size);
      });

      onClientEvent(socket, 'dc:draw:move', (...rawArgs: unknown[]) => {
        const validated = parseArgs(
          continueDrawingRequest,
          rawArgs,
          'dc:draw:move',
        );
        if (!validated) return;
        engine.draw.move(validated[0], playerId(), validated[1]);
      });

      // A stroke is complete with its last point; nothing to record.
      onClientEvent(socket, 'dc:draw:end', (...rawArgs: unknown[]) => {
        parseArgs(roomIdOnly, rawArgs, 'dc:draw:end');
      });

      onClientEvent(socket, 'dc:draw:undo', (...rawArgs: unknown[]) => {
        const validated = parseArgs(roomIdOnly, rawArgs, 'dc:draw:undo');
        if (!validated) return;
        engine.draw.undo(validated[0], playerId());
      });

      onClientEvent(socket, 'dc:draw:clear', (...rawArgs: unknown[]) => {
        const validated = parseArgs(roomIdOnly, rawArgs, 'dc:draw:clear');
        if (!validated) return;
        engine.draw.clear(validated[0], playerId());
      });

      onClientEvent(socket, 'dc:reveal:next', (...rawArgs: unknown[]) => {
        const validated = parseArgs(nextRequest, rawArgs, 'dc:reveal:next');
        if (!validated) return;
        engine.next(validated[0], playerId(), validated[1]);
      });

      onClientEvent(socket, 'dc:heart', (...rawArgs: unknown[]) => {
        const validated = parseArgs(heartRequest, rawArgs, 'dc:heart');
        if (!validated) return;
        const [roomId, chain, step] = validated;
        engine.heart(roomId, playerId(), chain, step);
      });
    },
  };
};

export { createDoodleChainModule };
