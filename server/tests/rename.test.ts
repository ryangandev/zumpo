import { textOf } from './helpers/test-server.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nameInRoom, renamePlayer } from '../libs/rooms/names.js';
import type { Room } from '../libs/rooms/types.js';
import {
  createRoom,
  joinRoom,
  lobbyView,
  request,
  serverRoom,
  startTestServer,
  waitForChat,
  waitForDrawState,
  type TestServer,
} from './helpers/test-server.js';

/** A bare room holding these players, enough for the name helpers. */
const roomOf = (names: Record<string, string>, game: unknown = {}): Room => ({
  gameType: 'draw-and-guess',
  roomId: 'room',
  roomName: 'Room',
  owner: {
    playerId: Object.keys(names)[0]!,
    username: Object.values(names)[0]!,
  },
  maxPlayers: 8,
  password: '',
  playerList: Object.fromEntries(
    Object.entries(names).map(([id, username]) => [
      id,
      { username, points: 0, isConnected: true },
    ]),
  ),
  spectators: {},
  isGameStarted: false,
  phaseEndsAt: 0,
  chat: { nextId: 0, messages: [] },
  game,
});

describe('the name a player goes by in a room', () => {
  it('is the one they asked for when nobody else has it', () => {
    expect(nameInRoom(roomOf({ a: 'Ada' }), 'b', 'Grace')).toBe('Grace');
  });

  it('is their own name back, not a numbered one, for the player who has it', () => {
    expect(nameInRoom(roomOf({ a: 'Ada' }), 'a', 'Ada')).toBe('Ada');
  });

  it('takes the first free number when somebody else has it, whatever the case', () => {
    const room = roomOf({ a: 'Sam', b: 'sam 2' });
    expect(nameInRoom(room, 'c', 'SAM')).toBe('SAM 3');
  });

  it('shortens a long name so the number still fits the limit', () => {
    const room = roomOf({ a: 'Extremely Sleepy O' });
    const name = nameInRoom(room, 'b', 'Extremely Sleepy O');
    expect(name).toBe('Extremely Sleepy 2');
    expect(name.length).toBeLessThanOrEqual(18);
  });
});

describe('renaming a player in a room', () => {
  it('renames the seat, the owner and every record that names them', () => {
    const game = {
      lastGame: {
        standings: [
          { playerId: 'a', username: 'Ada', points: 3 },
          { playerId: 'b', username: 'Grace', points: 1 },
        ],
      },
      solves: new Map([['a', { playerId: 'a', username: 'Ada' }]]),
    };
    const room = roomOf({ a: 'Ada', b: 'Grace' }, game);
    room.chat.messages.push({
      id: 0,
      kind: 'player',
      playerId: 'a',
      username: 'Ada',
      text: 'hi',
    });

    renamePlayer(room, 'a', 'Ava');

    expect(room.playerList.a!.username).toBe('Ava');
    expect(room.owner.username).toBe('Ava');
    expect(game.lastGame.standings.map((s) => s.username)).toEqual([
      'Ava',
      'Grace',
    ]);
    expect(game.solves.get('a')?.username).toBe('Ava');
    // What was said was said under the old name.
    expect(room.chat.messages[0]!.username).toBe('Ada');
  });
});

describe('player:rename', () => {
  let harness: TestServer;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  it('shows everybody in the room the new name at once and says so in the chat', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Ada' });
    const guest = await harness.connect();
    await joinRoom(guest, roomId, 'Sleepy Otter');

    const ownerSees = waitForDrawState(
      owner,
      (state) => state.playerList[guest.playerId]?.username === 'Grace',
    );
    const guestSees = waitForDrawState(
      guest,
      (state) => state.playerList[guest.playerId]?.username === 'Grace',
    );
    const announced = waitForChat(owner, (message) =>
      textOf(message).includes('is now'),
    );
    expect(await request(guest, 'player:rename', 'Grace')).toEqual({
      ok: true,
    });

    await Promise.all([ownerSees, guestSees]);
    expect(await announced).toMatchObject({
      kind: 'system',
      notice: { type: 'room:renamed', before: 'Sleepy Otter', name: 'Grace' },
    });
  });

  it('renames the host in the room and in the lobby', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Brave Noodle' });
    const watcher = await harness.connect();

    const ownerSees = waitForDrawState(
      owner,
      (state) => state.owner.username === 'Leo',
    );
    await request(owner, 'player:rename', 'Leo');
    await ownerSees;
    expect((await lobbyView(watcher, roomId))?.owner.username).toBe('Leo');
  });

  it('numbers a name somebody else in the room already goes by', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Sam' });
    const guest = await harness.connect();
    await joinRoom(guest, roomId, 'Sam');
    expect(
      serverRoom(harness, roomId).playerList[guest.playerId]!.username,
    ).toBe('Sam 2');

    await request(guest, 'player:rename', 'Grace');
    await request(owner, 'player:rename', 'grace');
    expect(
      serverRoom(harness, roomId).playerList[owner.playerId]!.username,
    ).toBe('grace 2');
  });

  it('changes nothing and says nothing when the name is the same', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Ada' });
    const before = serverRoom(harness, roomId).chat.nextId;

    expect(await request(owner, 'player:rename', 'Ada')).toEqual({ ok: true });
    expect(serverRoom(harness, roomId).chat.nextId).toBe(before);
  });

  it('answers a player with no seat, who has nothing to rename', async () => {
    const loner = await harness.connect();
    expect(await request(loner, 'player:rename', 'Grace')).toEqual({
      ok: true,
    });
  });

  it('refuses an empty or over-long name', async () => {
    const client = await harness.connect();
    for (const name of ['   ', 'x'.repeat(19)]) {
      expect(await request(client, 'player:rename', name)).toMatchObject({
        ok: false,
        error: { type: 'invalidRequest' },
      });
    }
  });
});
