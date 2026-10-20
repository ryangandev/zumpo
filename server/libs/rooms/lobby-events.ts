import { failure, invalidRequest } from '../../models/error.js';
import { generateRoomId } from '../utils.js';
import { parseArgs, roomCreateRequest, gameTypeOnly } from '../validation.js';
import type { RoomMembership } from './membership.js';
import type { RoomRegistry } from './registry.js';
import type { Room } from './types.js';
import {
  emitToSocket,
  lobbyChannel,
  onClientEvent,
  onClientRequest,
  type IoSocket,
} from './emit.js';

/**
 * Listing rooms and making one. Neither depends on what is played in them:
 * a create request is a name, a number of seats, an optional password, the
 * creator's name, and a blob only the game's own module can read.
 *
 * A lobby is a socket.io room per game (`lobby:draw-and-guess`) rather than an
 * `io.emit` to the whole server, so every Minesweeper room appearing does not
 * wake every client sitting in the Draw & Guess lobby.
 */
const lobbyEventsHandler = (
  socket: IoSocket,
  registry: RoomRegistry,
  membership: RoomMembership,
  maxRooms: number,
  roomsPerAddress: number,
) => {
  onClientEvent(socket, 'lobby:subscribe', (...rawArgs: unknown[]) => {
    const validated = parseArgs(gameTypeOnly, rawArgs, 'lobby:subscribe');
    if (!validated) return;
    const [gameType] = validated;
    const module = registry.moduleFor(gameType);
    if (!module) return;

    socket.join(lobbyChannel(gameType));

    // The subscriber wants the list now, not at the next change.
    const rooms = registry
      .ofGame(gameType)
      .map((room) => module.toLobbyInfo(room));

    emitToSocket(socket, 'lobby:rooms', gameType, rooms);
  });

  onClientEvent(socket, 'lobby:unsubscribe', (...rawArgs: unknown[]) => {
    const validated = parseArgs(gameTypeOnly, rawArgs, 'lobby:unsubscribe');
    if (!validated) return;
    socket.leave(lobbyChannel(validated[0]));
  });

  /**
   * A new room, with its creator already in the first seat. A room used to be
   * created empty and joined in a second request, which left a window in which
   * it sat in the lobby with nobody in it and an owner who was not there.
   */
  onClientRequest(socket, 'room:create', ([rawRequest], reply) => {
    const validated = parseArgs(roomCreateRequest, rawRequest, 'room:create');
    if (!validated) {
      reply(invalidRequest());
      return;
    }

    const { gameType, roomName, username, maxPlayers, password, settings } =
      validated;

    const module = registry.moduleFor(gameType);
    if (!module) {
      reply(invalidRequest('That game is not available.'));
      return;
    }

    // The seat count is bounded generically, but each game has its own idea of
    // how many players it can seat.
    if (maxPlayers < module.minPlayers || maxPlayers > module.maxPlayers) {
      reply(invalidRequest());
      return;
    }

    // Whatever the game asked for beyond the envelope. A rejected blob refuses
    // the request rather than creating a room with defaults nobody chose.
    const gameSettings = module.parseSettings(settings);
    if (gameSettings === null) {
      reply(invalidRequest());
      return;
    }

    // Rooms live in memory, and one player holds one seat, but nothing stops
    // somebody opening connection after connection to make room after room.
    if (registry.count() >= maxRooms) {
      reply(
        failure(
          'tooManyRooms',
          'Zumpo has as many rooms as it can hold right now.',
        ),
      );
      return;
    }

    // Nor one machine all of them. A room it made in place of the one it is
    // in does not count against it: that one is about to go.
    const address = socket.data.address;
    const playerId = socket.data.playerId;
    if (address !== undefined) {
      const made = [...registry.rooms.values()].filter(
        (room) => room.createdFrom === address && !room.playerList[playerId],
      ).length;
      if (made >= roomsPerAddress) {
        reply(
          failure('tooManyRooms', 'This address has as many rooms as it may.'),
        );
        return;
      }
    }

    // Identity comes from the connection, never from the payload.
    membership.leaveAllBut(playerId);

    const roomId = generateRoomId();
    const room: Room = {
      gameType,
      roomId,
      roomName,
      owner: { username, playerId },
      maxPlayers,
      password,
      playerList: {
        [playerId]: { username, points: 0, isConnected: true },
      },
      spectators: {},
      isGameStarted: false,
      phaseEndsAt: 0,
      chat: { nextId: 1, messages: [] },
      game: module.createState(gameSettings),
      ...(address !== undefined && { createdFrom: address }),
    };

    registry.add(room);
    socket.join(roomId);

    // The password is deliberately not echoed back: the creator already has
    // it, and every value that crosses the socket is one more place it can
    // leak from.
    reply({ ok: true, roomId });

    registry.lookup.announce(roomId, 'system', {
      type: 'room:created',
      name: username,
    });
    registry.lookup.emitState(room);
    registry.lookup.emitLobby(gameType);
  });
};

export { lobbyEventsHandler };
