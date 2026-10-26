import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  collect,
  createRoom,
  lobbyView,
  request,
  settle,
  startTestServer,
  waitFor,
  waitForDrawState,
  type TestServer,
} from './helpers/test-server.js';

const validRequest = {
  gameType: 'draw-and-guess',
  roomName: 'A Room',
  username: 'Ada',
  maxPlayers: 4,
  password: '',
  settings: { rounds: 1, categories: ['Animals'] },
};

describe('the lobby', () => {
  let harness: TestServer;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  it('starts empty', async () => {
    const client = await harness.connect();
    const list = waitFor(client, 'lobby:rooms');
    client.emit('lobby:subscribe', 'draw-and-guess');

    expect(await list).toEqual(['draw-and-guess', []]);
  });

  it('announces a new room to everyone watching that lobby', async () => {
    const watcher = await harness.connect();
    const creator = await harness.connect();
    watcher.emit('lobby:subscribe', 'draw-and-guess');
    await settle();

    const broadcast = waitFor(watcher, 'lobby:rooms');
    const roomId = await createRoom(creator, { roomName: 'Announced' });

    const [gameType, rooms] = await broadcast;
    expect(gameType).toBe('draw-and-guess');
    expect(rooms.map((room) => room.roomId)).toContain(roomId);
  });

  /*
   * A lobby is a socket.io room per game, so a client that never asked is
   * never told, which is what keeps two games' room lists from waking each
   * other's players.
   */
  it('says nothing to a client that has not subscribed', async () => {
    const bystander = await harness.connect();
    const heard = collect(bystander, 'lobby:rooms');

    const creator = await harness.connect();
    await createRoom(creator, { roomName: 'Unwatched' });
    await settle();

    expect(heard).toEqual([]);
  });

  it('stops sending the list once a client unsubscribes', async () => {
    const leaver = await harness.connect();
    leaver.emit('lobby:subscribe', 'draw-and-guess');
    await settle();

    leaver.emit('lobby:unsubscribe', 'draw-and-guess');
    await settle();

    const heard = collect(leaver, 'lobby:rooms');
    const creator = await harness.connect();
    await createRoom(creator, { roomName: 'After Leaving' });
    await settle();

    expect(heard).toEqual([]);
  });

  /*
   * The room list was the widest leak in the app: the password was in it
   * verbatim, readable by anyone who opened the lobby and looked at a
   * websocket frame.
   */
  it('never puts a room password on the wire', async () => {
    const eavesdropper = await harness.connect();
    const lists = collect(eavesdropper, 'lobby:rooms');
    eavesdropper.emit('lobby:subscribe', 'draw-and-guess');

    const creator = await harness.connect();
    const states = collect(creator, 'room:state');
    const answer = await request(creator, 'room:create', {
      ...validRequest,
      roomName: 'Locked',
      password: 'super-secret',
    });
    await settle();

    expect(JSON.stringify(lists)).not.toContain('super-secret');
    // Not echoed back to the creator either: they already have it.
    expect(JSON.stringify(answer)).not.toContain('super-secret');
    expect(JSON.stringify(states)).not.toContain('super-secret');

    const room = await lobbyView(
      eavesdropper,
      (answer as unknown as { roomId: string }).roomId,
    );
    expect(room?.hasPassword).toBe(true);
    expect(room).not.toHaveProperty('password');
  });

  it('marks an unlocked room as having no password', async () => {
    const client = await harness.connect();
    const roomId = await createRoom(client, { roomName: 'Open House' });

    expect((await lobbyView(client, roomId))?.hasPassword).toBe(false);
  });

  /*
   * A room used to be created empty and joined in a second request, which
   * left it sitting in the lobby with nobody in it.
   */
  it('seats the creator in their new room, as its owner', async () => {
    const client = await harness.connect();
    const snapshot = waitForDrawState(client);
    const roomId = await createRoom(client, {
      roomName: 'Mine',
      username: 'Ada',
      maxPlayers: 6,
      rounds: 3,
    });

    const room = await lobbyView(client, roomId);
    expect(room).toMatchObject({
      roomName: 'Mine',
      currentPlayerCount: 1,
      maxPlayers: 6,
      rounds: 3,
      status: 'Open',
      owner: { username: 'Ada', playerId: client.playerId },
    });

    // ...and is sent the room straight away, already in it.
    const state = await snapshot;
    expect(state.roomId).toBe(roomId);
    expect(state.playerList[client.playerId]).toEqual({
      username: 'Ada',
      points: 0,
      isConnected: true,
    });
    expect(
      harness.server.rooms.get(roomId)?.playerList[client.playerId],
    ).toEqual({
      username: 'Ada',
      points: 0,
      isConnected: true,
    });
  });

  it('refuses a create request the UI could not have sent', async () => {
    const client = await harness.connect();
    const before = harness.server.rooms.size;

    for (const payload of [
      {
        ...validRequest,
        roomName: 'x'.repeat(500),
        maxPlayers: 1_000_000,
        settings: { rounds: 999 },
      },
      'not an object',
      undefined,
    ]) {
      expect(await request(client, 'room:create', payload)).toEqual({
        ok: false,
        error: { type: 'invalidRequest', message: expect.any(String) },
      });
    }

    expect(harness.server.rooms.size).toBe(before);
  });

  it('refuses a room for a game the server does not run', async () => {
    const client = await harness.connect();

    const answer = await request(client, 'room:create', {
      ...validRequest,
      gameType: 'chess',
    });

    expect(answer.ok).toBe(false);
    expect(answer.error?.type).toBe('invalidRequest');
  });

  /*
   * The envelope is validated by the room layer and `settings` by the game.
   * A room whose settings are refused must not be created with defaults its
   * owner never picked.
   */
  it('refuses a room whose game-specific settings do not parse', async () => {
    const client = await harness.connect();
    const before = harness.server.rooms.size;

    for (const settings of [
      { rounds: 99, categories: ['Animals'] },
      { rounds: 'two', categories: ['Animals'] },
      { rounds: 2 },
      { rounds: 2, categories: [] },
      {},
      undefined,
    ]) {
      const answer = await request(client, 'room:create', {
        ...validRequest,
        settings,
      });
      expect(answer.error?.type).toBe('invalidRequest');
    }

    expect(harness.server.rooms.size).toBe(before);
  });

  it('survives a malformed payload without dropping the connection', async () => {
    const client = await harness.connect();

    client.emit('room:create', { roomName: null } as never, () => {});
    await settle();

    expect(client.connected).toBe(true);
    // Still serving well-formed requests afterwards.
    await expect(createRoom(client)).resolves.toEqual(expect.any(String));
  });

  it('still handles a create request sent without an acknowledgement', async () => {
    const client = await harness.connect();
    const before = harness.server.rooms.size;

    (client as unknown as { emit: (...args: unknown[]) => void }).emit(
      'room:create',
      validRequest,
    );
    await settle();

    expect(harness.server.rooms.size).toBe(before + 1);
    expect(client.connected).toBe(true);
  });
});
