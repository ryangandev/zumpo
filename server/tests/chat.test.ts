import { textOf } from './helpers/test-server.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Room } from '../libs/rooms/types.js';
import type { IoServer } from '../libs/rooms/emit.js';
import {
  CHAT_HISTORY_LIMIT,
  createRoomRegistry,
} from '../libs/rooms/registry.js';
import {
  collect,
  collectChat,
  createRoom,
  joinRoom,
  settle,
  startTestServer,
  syncRoom,
  waitForChat,
  type TestServer,
} from './helpers/test-server.js';

/*
 * A room's chat is a log rather than a stream: every message has an id that
 * only ever goes up, and the room keeps the recent ones, so a page that
 * arrives late (or reloads) is handed what it missed instead of an empty box.
 */
describe('room chat', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('replays what was said, in order, with what kind of message each was', async () => {
    const alice = await harness.connect();
    const bob = await harness.connect();
    const carol = await harness.connect();
    const roomId = await createRoom(alice, { username: 'Alice' });
    await joinRoom(bob, roomId, 'Bob');

    const said = waitForChat(alice, (m) => m.kind === 'player');
    bob.emit('chat:send', roomId, 'hello all');
    await said;

    await joinRoom(carol, roomId, 'Carol');
    const left = waitForChat(alice, (m) => m.kind === 'alert');
    carol.emit('room:leave', roomId);
    await left;

    const { messages } = await syncRoom(bob, roomId);

    expect(messages).toEqual([
      {
        id: 1,
        kind: 'system',
        notice: { type: 'room:created', name: 'Alice' },
      },
      { id: 2, kind: 'system', notice: { type: 'room:joined', name: 'Bob' } },
      {
        id: 3,
        kind: 'player',
        playerId: bob.playerId,
        username: 'Bob',
        text: 'hello all',
      },
      { id: 4, kind: 'system', notice: { type: 'room:joined', name: 'Carol' } },
      { id: 5, kind: 'alert', notice: { type: 'room:left', name: 'Carol' } },
    ]);
  });

  it('numbers each room’s messages on its own', async () => {
    const alice = await harness.connect();
    const bob = await harness.connect();
    const first = await createRoom(alice, { username: 'Alice' });
    const second = await createRoom(bob, { username: 'Bob' });

    const [inFirst, inSecond] = await Promise.all([
      syncRoom(alice, first),
      syncRoom(bob, second),
    ]);

    expect(inFirst.messages.map((m) => m.id)).toEqual([1]);
    expect(inSecond.messages.map((m) => m.id)).toEqual([1]);
  });

  it('sends a live message with the id it is kept under', async () => {
    const alice = await harness.connect();
    const roomId = await createRoom(alice, { username: 'Alice' });
    await settle();

    const heard = collect(alice, 'chat:message');
    alice.emit('chat:send', roomId, 'one');
    alice.emit('chat:send', roomId, 'two');
    await settle();

    const { messages } = await syncRoom(alice, roomId);
    expect(heard.map(([forRoom, message]) => [forRoom, message])).toEqual(
      messages.slice(-2).map((message) => [roomId, message]),
    );
    expect(messages.slice(-2).map((m) => m.id)).toEqual([2, 3]);
  });

  /*
   * The text goes out exactly as typed, trimmed, and only as text: the client
   * renders it, so nothing here is HTML.
   */
  it('trims a message and ignores one that is only whitespace', async () => {
    const alice = await harness.connect();
    const roomId = await createRoom(alice, { username: 'Alice' });
    await settle();

    const heard = collectChat(alice);
    alice.emit('chat:send', roomId, '   ');
    alice.emit('chat:send', roomId, '  <b>hi</b>  ');
    await settle();

    expect(heard.map((m) => textOf(m))).toEqual(['<b>hi</b>']);
  });

  it('ignores a message from a client without a seat', async () => {
    const alice = await harness.connect();
    const roomId = await createRoom(alice, { username: 'Alice' });
    await settle();

    const heard = collectChat(alice);
    const stranger = await harness.connect();
    stranger.emit('chat:send', roomId, 'let me in');
    await settle();

    expect(heard).toEqual([]);
  });
});

/** A registry whose sends go nowhere, to drive the log directly. */
const makeRegistry = () => {
  const io = { to: () => ({ emit: () => true }) } as unknown as IoServer;
  return createRoomRegistry(io);
};

const makeRoom = (): Room => ({
  gameType: 'draw-and-guess',
  roomId: 'room-1',
  roomName: 'Room One',
  owner: { username: 'Owner', playerId: 'player-owner' },
  maxPlayers: 4,
  password: '',
  inviteKey: '',
  playerList: {
    'player-owner': { username: 'Owner', points: 0, isConnected: true },
  },
  spectators: {},
  isGameStarted: false,
  phaseEndsAt: 0,
  chat: { nextId: 1, messages: [] },
  game: {},
});

describe('the chat log', () => {
  it(`keeps the last ${CHAT_HISTORY_LIMIT} messages, and never reuses an id`, () => {
    const registry = makeRegistry();
    const room = makeRoom();
    registry.add(room);

    for (let i = 1; i <= CHAT_HISTORY_LIMIT + 5; i++) {
      registry.lookup.announce(room.roomId, 'system', {
        type: 'room:joined',
        name: `player ${i}`,
      });
    }

    expect(room.chat.messages).toHaveLength(CHAT_HISTORY_LIMIT);
    expect(room.chat.messages[0]).toEqual({
      id: 6,
      kind: 'system',
      notice: { type: 'room:joined', name: 'player 6' },
    });
    expect(room.chat.messages.at(-1)?.id).toBe(CHAT_HISTORY_LIMIT + 5);
    expect(room.chat.nextId).toBe(CHAT_HISTORY_LIMIT + 6);
  });

  it('posts a player’s message under the name on their seat', () => {
    const registry = makeRegistry();
    const room = makeRoom();
    registry.add(room);

    registry.say(room, 'player-owner', 'hi');
    registry.say(room, 'player-nobody', 'not seated');

    expect(room.chat.messages).toEqual([
      {
        id: 1,
        kind: 'player',
        playerId: 'player-owner',
        username: 'Owner',
        text: 'hi',
      },
    ]);
  });
});
