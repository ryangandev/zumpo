import { SEATS } from '../../../shared/seats.js';
import type { MinesweeperSettings } from '../../models/types.js';
import type { GameModule, GameContext } from '../../libs/rooms/types.js';
import { onClientEvent, type IoSocket } from '../../libs/rooms/emit.js';
import { parseArgs } from '../../libs/validation.js';
import type { MinesweeperDurationsInSeconds } from '../../libs/game-clock.js';
import { createMinesweeperGameEngine } from './game-engine.js';
import { createState, toLobbyInfo, toRoomState } from './state.js';
import type { MinesweeperState } from './state.js';
import { difficultySetting, pickRequest } from './validation.js';

/**
 * Minesweeper, as the room layer sees it.
 *
 * Worth comparing with `draw-and-guess/module.ts`, because the two together are
 * the argument that the room layer is real rather than Draw & Guess wearing a
 * hat. This one keeps **one** timer where that one keeps three, needs **no**
 * per-player state of its own beyond the score every game has, and its `syncTo`
 * is empty because a Minesweeper room holds nothing an arriving player is not
 * already sent in the snapshot - no private word, no separate canvas.
 *
 * The room layer needed no changes to accommodate any of that, which is the
 * result the extraction was hoping for.
 */
const createMinesweeperModule = (
  ctx: GameContext,
  durations?: MinesweeperDurationsInSeconds,
): GameModule<MinesweeperState, MinesweeperSettings> => {
  const engine = createMinesweeperGameEngine(ctx, durations);

  return {
    gameType: 'minesweeper',
    minPlayers: SEATS['minesweeper'].min,
    maxPlayers: SEATS['minesweeper'].max,

    parseSettings: (raw) =>
      parseArgs(difficultySetting, raw, 'room:create (minesweeper)'),
    createState,
    toLobbyInfo,
    toRoomState,

    // Nothing to catch up on: the board, the round, the player's own pick and
    // the last result all travel in the snapshot the layer has already sent.
    syncTo: () => {},

    startGame: (room) => engine.startGame(room),
    onDeparture: (room, playerId) =>
      engine.handlePlayerDeparture(room, playerId),
    onDisconnect: (room) => engine.handleDisconnect(room),
    onReturn: () => {},

    registerHandlers: (socket: IoSocket) => {
      onClientEvent(socket, 'ms:pick', (...rawArgs: unknown[]) => {
        const validated = parseArgs(pickRequest, rawArgs, 'ms:pick');
        if (!validated) return;
        const [roomId, index] = validated;

        // Identity comes from the connection, never from the payload.
        const playerId = socket.data.playerId;

        engine.pick(roomId, playerId, index);
      });
    },
  };
};

export { createMinesweeperModule };
