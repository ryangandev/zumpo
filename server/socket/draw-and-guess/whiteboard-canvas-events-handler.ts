import type { DrawAndGuessState } from '../../models/types.js';
import type { GameContext, Room } from '../../libs/rooms/types.js';
import {
  broadcastToRoom,
  onClientEvent,
  type IoSocket,
} from '../../libs/rooms/emit.js';
import { parseArgs, roomIdOnly } from '../../libs/validation.js';
import {
  continueDrawingRequest,
  startDrawingRequest,
} from '../../libs/drawing/validation.js';
import {
  beginStroke,
  clearCanvas,
  extendStroke,
  undoStroke,
} from '../../libs/drawing/canvas.js';

/**
 * The canvas relay.
 *
 * This was the one handler that never received the membership check the guess
 * path got: it validated the *shape* of a payload and then broadcast it to
 * whatever room id it was handed. Room ids are not secret - the lobby list goes
 * to every subscriber and carries `roomId` for every room, locked ones included
 * - so a client that had never joined a room could draw on it, undo the
 * drawer's last stroke, or wipe the canvas mid-turn. `clear` was the worst of
 * them: one emit, and a stranger's drawing was gone.
 *
 * The rule enforced here is the one the UI has always shown: the canvas belongs
 * to whoever is drawing on it, and only while they are drawing.
 */
const whiteboardCanvasEventHandler = (socket: IoSocket, ctx: GameContext) => {
  /**
   * The room this socket may currently draw in, or null. Returns the room
   * itself because every event below goes on to record itself in that room's
   * canvas - the stored drawing and the relayed one are built from the same
   * events, in the same place, so they cannot drift apart.
   */
  const pencilRoomOf = (roomId: string): Room<DrawAndGuessState> | null => {
    // Identity comes from the connection, never from the payload.
    const playerId = socket.data.playerId;

    // Also: the room has to be a Draw & Guess room. A room id off any lobby
    // broadcast is a valid id; it is not necessarily a valid id *here*.
    const room = ctx.rooms.ofType<DrawAndGuessState>(roomId, 'draw-and-guess');
    if (!room) return null;
    if (!room.playerList[playerId]) return null; // not in this room
    if (room.game.currentDrawer !== playerId) return null; // not their turn
    if (room.game.phase !== 'drawing') return null; // not before or after it

    return room;
  };

  onClientEvent(socket, 'dg:draw:start', (...rawArgs: unknown[]) => {
    const validated = parseArgs(startDrawingRequest, rawArgs, 'dg:draw:start');
    if (!validated) return;
    const [roomId, coords, color, size] = validated;

    const room = pencilRoomOf(roomId);
    if (!room) return;
    if (!beginStroke(room.game.canvas, color, size, coords)) return;

    broadcastToRoom(
      socket,
      roomId,
      'dg:canvas:start',
      roomId,
      coords,
      color,
      size,
    );
  });

  onClientEvent(socket, 'dg:draw:move', (...rawArgs: unknown[]) => {
    const validated = parseArgs(
      continueDrawingRequest,
      rawArgs,
      'dg:draw:move',
    );
    if (!validated) return;
    const [roomId, coords] = validated;

    const room = pencilRoomOf(roomId);
    if (!room) return;
    if (!extendStroke(room.game.canvas, coords)) return;

    broadcastToRoom(socket, roomId, 'dg:canvas:move', roomId, coords);
  });

  onClientEvent(socket, 'dg:draw:end', (...rawArgs: unknown[]) => {
    const validated = parseArgs(roomIdOnly, rawArgs, 'dg:draw:end');
    if (!validated) return;
    const [roomId] = validated;

    // Nothing to record: a stroke is complete as soon as its last point
    // arrives. The event exists so a client can close its path.
    if (!pencilRoomOf(roomId)) return;

    broadcastToRoom(socket, roomId, 'dg:canvas:end', roomId);
  });

  // Undo used to carry a full-canvas PNG as a data URL - on the order of
  // 100KB to 1MB, per undo. Every client keeps the same stroke list, so
  // "drop the last stroke" is all that needs to cross the wire.
  onClientEvent(socket, 'dg:draw:undo', (...rawArgs: unknown[]) => {
    const validated = parseArgs(roomIdOnly, rawArgs, 'dg:draw:undo');
    if (!validated) return;
    const [roomId] = validated;

    const room = pencilRoomOf(roomId);
    if (!room) return;
    undoStroke(room.game.canvas);

    broadcastToRoom(socket, roomId, 'dg:canvas:undo', roomId);
  });

  onClientEvent(socket, 'dg:draw:clear', (...rawArgs: unknown[]) => {
    const validated = parseArgs(roomIdOnly, rawArgs, 'dg:draw:clear');
    if (!validated) return;
    const [roomId] = validated;

    const room = pencilRoomOf(roomId);
    if (!room) return;
    clearCanvas(room.game.canvas);

    broadcastToRoom(socket, roomId, 'dg:canvas:clear', roomId);
  });
};

export { whiteboardCanvasEventHandler };
