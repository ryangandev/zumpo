import type { IoSocket } from '../libs/rooms/emit.js';
import type { RoomMembership } from '../libs/rooms/membership.js';
import { guard } from '../libs/guard.js';

/**
 * A dropped connection is no longer a departure.
 *
 * This file used to hold its own copy of the whole leave sequence - recount,
 * transfer ownership, delete the room if empty, tell the engine - which is how
 * it came to disagree with the explicit leave handler about whether to check
 * membership first. Both go through `membership` now, which is also where the
 * decision lives about how long to wait before believing somebody is gone.
 */
const clientDepartureOnDisconnectHandler = (
  socket: IoSocket,
  membership: RoomMembership,
) => {
  socket.on('disconnect', () => {
    guard(`Player ${socket.data.playerId} disconnecting`, () =>
      membership.handleDisconnect(socket.data.playerId, socket.id),
    );
  });
};

export { clientDepartureOnDisconnectHandler };
