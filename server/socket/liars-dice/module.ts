import { SEATS } from '../../../shared/seats.js';
import type { LiarsDiceSettings } from '../../models/types.js';
import type { GameModule, GameContext } from '../../libs/rooms/types.js';
import { onClientEvent, type IoSocket } from '../../libs/rooms/emit.js';
import { parseArgs } from '../../libs/validation.js';
import type { LiarsDiceDurationsInSeconds } from '../../libs/game-clock.js';
import { createLiarsDiceGameEngine } from './game-engine.js';
import { createState, toLobbyInfo, toRoomState } from './state.js';
import type { LiarsDiceState } from './state.js';
import { bidRequest, callRequest, diceSetting } from './validation.js';

/**
 * Liar's Dice, as the room layer sees it: one timer, a turn order, dice that
 * each player sees only their own of, and no opinion about chat, since table
 * talk is part of bluffing.
 */
const createLiarsDiceModule = (
  ctx: GameContext,
  durations?: LiarsDiceDurationsInSeconds,
  random?: () => number,
): GameModule<LiarsDiceState, LiarsDiceSettings> => {
  const engine = createLiarsDiceGameEngine(ctx, durations, random);

  return {
    gameType: 'liars-dice',
    minPlayers: SEATS['liars-dice'].min,
    maxPlayers: SEATS['liars-dice'].max,

    parseSettings: (raw) =>
      parseArgs(diceSetting, raw, 'room:create (liars-dice)'),
    createState,
    toLobbyInfo,
    toRoomState,

    // The cups, the bids and the reveal all travel in the snapshot.
    syncTo: () => {},

    startGame: (room) => engine.startGame(room),
    onDeparture: (room, playerId) =>
      engine.handlePlayerDeparture(room, playerId),
    // A turn does not wait for a dropped player, and is not skipped: its clock
    // keeps running, and then it is played for them as for anybody out of time.
    onDisconnect: () => {},
    onReturn: () => {},

    registerHandlers: (socket: IoSocket) => {
      onClientEvent(socket, 'ld:bid', (...rawArgs: unknown[]) => {
        const validated = parseArgs(bidRequest, rawArgs, 'ld:bid');
        if (!validated) return;
        const [roomId, count, face] = validated;

        // Identity comes from the connection, never from the payload.
        const playerId = socket.data.playerId;

        engine.bid(roomId, playerId, count, face);
      });

      onClientEvent(socket, 'ld:call', (...rawArgs: unknown[]) => {
        const validated = parseArgs(callRequest, rawArgs, 'ld:call');
        if (!validated) return;
        const [roomId] = validated;

        const playerId = socket.data.playerId;

        engine.call(roomId, playerId);
      });
    },
  };
};

export { createLiarsDiceModule };
