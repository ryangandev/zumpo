import { chatRequest, parseArgs } from '../validation.js';
import type { RoomRegistry } from './registry.js';
import { memberOf } from './seats.js';
import { onClientEvent, type IoSocket } from './emit.js';

/**
 * Talking in a room, which every game has and no game owns.
 *
 * One input for everything a player types. The room layer checks the sender
 * is in the room, at the table or watching, then offers the message to the
 * game, which may use it (a
 * correct Draw & Guess guess is scored, not shown) or refuse it (a drawer
 * typing while the word is in play would be giving it away). Whatever the game
 * leaves as chat is posted to the whole room, the sender included, under the
 * name they go by in the room.
 *
 * A spectator talks too. The game is offered their message like anybody's,
 * and sees an id in no `playerList`: a spectator never scores, and a guess at
 * the word from one is swallowed rather than shown.
 */
const chatEventsHandler = (socket: IoSocket, registry: RoomRegistry) => {
  onClientEvent(socket, 'chat:send', (...rawArgs: unknown[]) => {
    const validated = parseArgs(chatRequest, rawArgs, 'chat:send');
    if (!validated) return;
    const [roomId, text] = validated;

    // Only somebody in the room may talk in it.
    const playerId = socket.data.playerId;
    const room = registry.lookup.get(roomId);
    if (!room || !memberOf(room, playerId)) return;

    const verdict =
      registry.moduleOf(room)?.handleChat?.(room, playerId, text) ?? 'chat';
    if (verdict !== 'chat') return;

    registry.say(room, playerId, text);
  });
};

export { chatEventsHandler };
