import { afterEach, describe, expect, it } from 'vitest';
import {
  FAST_MAKE24,
  FAST_MINESWEEPER,
  FAST_PAIRS,
  FAST_PHASES,
  createRoom,
  joinRoom,
  settle,
  startTestServer,
  type TestClient,
  type TestServer,
} from './helpers/test-server.js';
import type { CreateZumpoServerOptions } from '../app.js';

describe('what one player and one server may hold', () => {
  let harness: TestServer;

  afterEach(async () => {
    await harness.teardown();
  });

  it('gives up a seat elsewhere when a player joins another room', async () => {
    harness = await startTestServer();
    const alice = await harness.connect();
    const bob = await harness.connect();
    const carol = await harness.connect();
    const first = await createRoom(alice, { username: 'Alice' });
    await joinRoom(carol, first, 'Carol');
    const second = await createRoom(bob, { username: 'Bob' });

    await joinRoom(alice, second, 'Alice');
    await settle();

    const rooms = harness.server.rooms;
    expect(Object.keys(rooms.get(first)!.playerList)).toEqual([carol.playerId]);
    expect(rooms.get(first)!.owner.playerId).toBe(carol.playerId);
    expect(Object.keys(rooms.get(second)!.playerList)).toEqual([
      bob.playerId,
      alice.playerId,
    ]);
  });

  it('gives up a seat elsewhere when a player makes a room', async () => {
    harness = await startTestServer();
    const alice = await harness.connect();
    const first = await createRoom(alice, { username: 'Alice' });

    const second = await createRoom(alice, { username: 'Alice' });
    await settle();

    expect(harness.server.rooms.get(first)).toBeUndefined();
    expect(
      harness.server.rooms.get(second)?.playerList[alice.playerId],
    ).toBeDefined();
  });

  it('makes no more rooms than it can hold', async () => {
    harness = await startTestServer(
      FAST_PHASES,
      0.6,
      FAST_MINESWEEPER,
      FAST_MAKE24,
      FAST_PAIRS,
      { maxRooms: 2 },
    );
    const [alice, bob, carol] = await Promise.all([
      harness.connect(),
      harness.connect(),
      harness.connect(),
    ]);
    await createRoom(alice);
    await createRoom(bob);

    const refused = await carol.timeout(3000).emitWithAck('room:create', {
      gameType: 'draw-and-guess',
      roomName: 'One too many',
      username: 'Carol',
      maxPlayers: 4,
      password: '',
      settings: { rounds: 1 },
    });

    expect(refused).toMatchObject({
      ok: false,
      error: { type: 'tooManyRooms' },
    });
    expect(harness.server.rooms.size).toBe(2);
  });

  it('drops a connection that sends an oversized packet', async () => {
    harness = await startTestServer();
    const alice = await harness.connect();
    const roomId = await createRoom(alice);

    const closed = new Promise<string>((resolve) =>
      alice.once('disconnect', resolve),
    );
    alice.emit('chat:send', roomId, 'x'.repeat(32 * 1024));

    expect(await closed).toBe('transport close');
  });
});

const withLimits = (overrides: CreateZumpoServerOptions) =>
  startTestServer(
    FAST_PHASES,
    0.6,
    FAST_MINESWEEPER,
    FAST_MAKE24,
    FAST_PAIRS,
    overrides,
  );

const createFrom = (client: TestClient, roomName: string) =>
  client.timeout(3000).emitWithAck('room:create', {
    gameType: 'draw-and-guess',
    roomName,
    username: 'Someone',
    maxPlayers: 4,
    password: '',
    settings: { rounds: 1 },
  });

describe('what one address may hold', () => {
  let harness: TestServer;

  afterEach(async () => {
    await harness.teardown();
  });

  it('lets an address open only so many connections at once', async () => {
    harness = await withLimits({ connectionLimits: { perAddress: 2 } });
    const alice = await harness.connect();
    await harness.connect();

    await expect(harness.connect()).rejects.toThrow(/Too many connections/);

    alice.close();
    await settle();
    await expect(harness.connect()).resolves.toBeDefined();
  });

  it('lets an address connect only so often', async () => {
    harness = await withLimits({ connectionLimits: { connectsPerMinute: 2 } });
    (await harness.connect()).close();
    (await harness.connect()).close();
    await settle();

    await expect(harness.connect()).rejects.toThrow(/Too many connections/);
  });

  it('lets an address make only so many rooms', async () => {
    harness = await withLimits({ connectionLimits: { roomsPerAddress: 1 } });
    const [alice, bob] = await Promise.all([
      harness.connect(),
      harness.connect(),
    ]);
    await createRoom(alice);

    expect(await createFrom(bob, 'A second')).toMatchObject({
      ok: false,
      error: { type: 'tooManyRooms' },
    });
    // Making one in place of the room it is in leaves it with one still.
    expect(await createFrom(alice, 'Instead')).toMatchObject({ ok: true });
    expect(harness.server.rooms.size).toBe(1);
  });

  it('tells addresses apart by the header a proxy sets', async () => {
    harness = await withLimits({
      clientIpHeader: 'X-Client-IP',
      connectionLimits: { perAddress: 1 },
    });
    await harness.connect(undefined, { 'x-client-ip': '203.0.113.1' });
    await harness.connect(undefined, {
      'x-client-ip': '203.0.113.2, 10.0.0.1',
    });

    await expect(
      harness.connect(undefined, { 'x-client-ip': '203.0.113.1' }),
    ).rejects.toThrow(/Too many connections/);
    // Without the header there is no address to hold to a limit, and one
    // shared by everybody would shut the site: only the totals apply.
    await harness.connect();
    await expect(harness.connect()).resolves.toBeDefined();
  });

  it('holds only so many identities, but always lets a player back', async () => {
    harness = await withLimits({ connectionLimits: { sessions: 2 } });
    const alice = await harness.connect();
    await harness.connect();

    await expect(harness.connect()).rejects.toThrow(/full/);
    await expect(harness.reload(alice)).resolves.toMatchObject({
      playerId: alice.playerId,
    });
  });
});
