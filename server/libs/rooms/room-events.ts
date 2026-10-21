import { asFailure, failure, invalidRequest } from '../../models/error.js';
import {
  canWatch,
  heirOf,
  isSpectator,
  memberOf,
  roomStatus,
} from './seats.js';
import {
  joinRoomRequest,
  parseArgs,
  renameRequest,
  roomIdOnly,
} from '../validation.js';
import { nameInRoom, renamePlayer } from './names.js';
import type { RoomMembership } from './membership.js';
import type { RoomRegistry } from './registry.js';
import { seatCount } from './seats.js';
import { matchesSecret } from '../utils.js';
import {
  emitToSocket,
  onClientEvent,
  onClientRequest,
  type IoSocket,
} from './emit.js';

/**
 * Joining, watching, leaving, re-syncing, starting and renaming: what every
 * room does regardless of what is played in it.
 *
 * Each request is answered through its acknowledgement, success or the reason
 * it was refused, and anything it changes reaches the room as a new snapshot.
 */
const roomEventsHandler = (
  socket: IoSocket,
  registry: RoomRegistry,
  membership: RoomMembership,
) => {
  onClientRequest(socket, 'room:join', (args, reply) => {
    const validated = parseArgs(
      joinRoomRequest,
      // Tolerate a missing password, which an unlocked room has none of, and
      // a missing seat, which leaves the choice to the room.
      [args[0], args[1], args[2] ?? '', args[3] ?? null],
      'room:join',
    );
    if (!validated) {
      reply(invalidRequest());
      return;
    }
    const [roomId, wanted, password, asked] = validated;

    // Identity comes from the connection, never from the payload: the client
    // proved who it was during the handshake, and this is the result.
    const playerId = socket.data.playerId;

    const room = registry.lookup.get(roomId);
    if (!room || !registry.moduleOf(room)) {
      reply(failure('roomNotExist', 'Room does not exist.'));
      return;
    }

    const isAlreadySeated = Boolean(memberOf(room, playerId));
    // Without a preference, the table while it is open, and the spectator
    // seats while it is not: somebody arriving at a game under way watches.
    const seat =
      asked ?? (roomStatus(room) === 'Open' ? 'player' : 'spectator');

    if (!isAlreadySeated) {
      // A player already holding a seat is returning to it, so a full room or
      // a game in progress is no reason to turn them away, and the seat they
      // hold is all the proof a locked room asks for.
      const hasPlace =
        seat === 'player' ? roomStatus(room) === 'Open' : canWatch(room);
      if (!hasPlace) {
        reply(failure('roomNotOpen', 'Room is not open.'));
        return;
      }
      // The invite link's key opens the room as the password does. Neither
      // comparison says how near a wrong guess came.
      if (
        room.password &&
        !matchesSecret(password, room.password) &&
        !(room.inviteKey !== '' && matchesSecret(password, room.inviteKey))
      ) {
        reply(
          failure('incorrectPassword', 'Incorrect password. Please try again.'),
        );
        return;
      }

      membership.leaveAllBut(playerId, roomId);
      const username = nameInRoom(room, playerId, wanted);
      if (seat === 'player') {
        room.playerList[playerId] = { username, points: 0, isConnected: true };
      } else {
        room.spectators[playerId] = { username, isConnected: true };
      }
    }
    // A seat already held keeps its name: only `player:rename` changes it, and
    // tells the room when it does.
    const username = memberOf(room, playerId)?.username ?? wanted;

    socket.join(roomId);
    reply({ ok: true });

    if (!isAlreadySeated) {
      registry.lookup.announce(roomId, 'system', {
        type: isSpectator(room, playerId) ? 'room:watching' : 'room:joined',
        name: username,
      });
    }
    registry.lookup.emitState(room);
    registry.lookup.emitLobby(room.gameType);
  });

  /**
   * Asked for by the room page once it has mounted and its listeners are live.
   * A snapshot broadcast while the page was still navigating would have
   * nowhere to land, so rather than guessing how long that takes, the client
   * says when it is ready.
   *
   * Answered only for players in the room, playing or watching. A locked
   * room's player list is
   * not something a stranger should be able to pull with a room id off the
   * lobby broadcast. A client that arrives without a seat (a pasted link) is
   * told so, and asks to join.
   */
  onClientRequest(socket, 'room:sync', (args, reply) => {
    const validated = parseArgs(roomIdOnly, args, 'room:sync');
    if (!validated) {
      reply(invalidRequest());
      return;
    }
    const [roomId] = validated;

    const room = registry.lookup.get(roomId);
    const module = room ? registry.moduleOf(room) : undefined;
    if (!room || !module) {
      reply(failure('roomNotExist', 'Room does not exist.'));
      return;
    }

    const playerId = socket.data.playerId;
    if (!memberOf(room, playerId)) {
      reply(failure('notRoomMember', 'You are not in this room.'));
      return;
    }

    // Normally already in the channel, from creating, joining or resuming;
    // joining again costs nothing and makes sure.
    socket.join(roomId);
    reply({ ok: true });

    emitToSocket(socket, 'room:state', module.toRoomState(room, playerId));
    emitToSocket(
      socket,
      'chat:history',
      roomId,
      registry.chatFor(room, playerId),
    );

    // Whatever else this one socket needs and the snapshot cannot carry, such
    // as a drawing. A joiner, a player returning from a reload and a drawer
    // resuming their own turn all arrive through here.
    module.syncTo(socket, room, playerId);
  });

  /**
   * Between games, a player gives up their seat to watch. Their score goes
   * with the seat, as it would if they left, and the game is told they went.
   */
  onClientRequest(socket, 'room:watch', (args, reply) => {
    const validated = parseArgs(roomIdOnly, args, 'room:watch');
    if (!validated) {
      reply(invalidRequest());
      return;
    }
    const [roomId] = validated;
    const playerId = socket.data.playerId;

    const room = registry.lookup.get(roomId);
    if (!room || !registry.moduleOf(room)) {
      reply(failure('roomNotExist', 'Room does not exist.'));
      return;
    }
    const seat = room.playerList[playerId];
    if (!seat) {
      reply(failure('notRoomMember', 'You are not at this table.'));
      return;
    }
    if (room.isGameStarted) {
      reply(failure('gameAlreadyStarted', 'The game has already started.'));
      return;
    }
    if (!canWatch(room)) {
      reply(failure('roomNotOpen', 'Every spectator seat is taken.'));
      return;
    }

    delete room.playerList[playerId];
    room.spectators[playerId] = {
      username: seat.username,
      isConnected: seat.isConnected,
    };
    // A host who leaves the table hands the crown to somebody still at it.
    const heir =
      room.owner.playerId === playerId
        ? heirOf(room, { playersOnly: true })
        : undefined;
    if (heir) {
      room.owner = {
        playerId: heir,
        username: room.playerList[heir]!.username,
      };
    }
    registry.moduleOf(room)?.onDeparture(room, playerId);
    reply({ ok: true });

    registry.lookup.announce(roomId, 'system', {
      type: 'room:watching',
      name: seat.username,
      ...(heir && { owner: room.owner.username }),
    });
    registry.lookup.emitState(room);
    registry.lookup.emitLobby(room.gameType);
  });

  /** Between games, a spectator takes a free seat at the table. */
  onClientRequest(socket, 'room:sit', (args, reply) => {
    const validated = parseArgs(roomIdOnly, args, 'room:sit');
    if (!validated) {
      reply(invalidRequest());
      return;
    }
    const [roomId] = validated;
    const playerId = socket.data.playerId;

    const room = registry.lookup.get(roomId);
    if (!room || !registry.moduleOf(room)) {
      reply(failure('roomNotExist', 'Room does not exist.'));
      return;
    }
    const spectator = room.spectators[playerId];
    if (!spectator) {
      reply(failure('notRoomMember', 'You are not watching this room.'));
      return;
    }
    if (room.isGameStarted) {
      reply(failure('gameAlreadyStarted', 'The game has already started.'));
      return;
    }
    if (roomStatus(room) !== 'Open') {
      reply(failure('roomNotOpen', 'Every seat is taken.'));
      return;
    }

    delete room.spectators[playerId];
    room.playerList[playerId] = {
      username: spectator.username,
      points: 0,
      isConnected: spectator.isConnected,
    };
    reply({ ok: true });

    registry.lookup.announce(roomId, 'system', {
      type: 'room:seated',
      name: spectator.username,
    });
    registry.lookup.emitState(room);
    registry.lookup.emitLobby(room.gameType);
  });

  onClientEvent(socket, 'room:leave', (...rawArgs: unknown[]) => {
    const validated = parseArgs(roomIdOnly, rawArgs, 'room:leave');
    if (!validated) return;
    const [roomId] = validated;

    const playerId = socket.data.playerId;

    // Leaving is deliberate, so the seat goes at once, with no grace period.
    // A stray or repeated leave is ignored inside `leave`, before any change.
    membership.leave(roomId, playerId);
  });

  onClientRequest(socket, 'game:start', (args, reply) => {
    const validated = parseArgs(roomIdOnly, args, 'game:start');
    if (!validated) {
      reply(invalidRequest());
      return;
    }
    const [roomId] = validated;

    const playerId = socket.data.playerId;

    const room = registry.lookup.get(roomId);
    const module = room ? registry.moduleOf(room) : undefined;
    if (!room || !module) {
      reply(failure('roomNotExist', 'Room does not exist.'));
      return;
    }

    // What every game asks before it starts, asked once, here.
    if (room.owner.playerId !== playerId) {
      reply(failure('notRoomOwner', 'Only the room owner can start the game.'));
      return;
    }
    if (room.isGameStarted) {
      reply(failure('gameAlreadyStarted', 'The game has already started.'));
      return;
    }
    if (seatCount(room) < module.minPlayers) {
      reply(
        failure(
          'notEnoughPlayers',
          `At least ${module.minPlayers} players are required to start.`,
        ),
      );
      return;
    }

    try {
      module.startGame(room);
    } catch (error) {
      reply(asFailure(error));
      return;
    }
    reply({ ok: true });
  });

  /**
   * A new name for every seat the player holds, which is one room at most.
   * Each room shows it at once and says so in its chat; the lobby too when the
   * player owns the room, because its table names the host. A player with no
   * seat has nothing to update here: the next room they join is told the new
   * name then.
   */
  onClientRequest(socket, 'player:rename', (args, reply) => {
    const validated = parseArgs(renameRequest, args, 'player:rename');
    if (!validated) {
      reply(invalidRequest());
      return;
    }
    const [wanted] = validated;
    const playerId = socket.data.playerId;

    for (const room of registry.roomsHeldBy(playerId)) {
      const before = memberOf(room, playerId)?.username ?? '';
      const username = nameInRoom(room, playerId, wanted);
      if (username === before) continue;
      renamePlayer(room, playerId, username);
      registry.lookup.announce(room.roomId, 'system', {
        type: 'room:renamed',
        before,
        name: username,
      });
      registry.lookup.emitState(room);
      if (room.owner.playerId === playerId) {
        registry.lookup.emitLobby(room.gameType);
      }
    }
    reply({ ok: true });
  });
};

export { roomEventsHandler };
