import { afterEach, describe, expect, it } from 'vitest';
import {
  createSnapRoom,
  joinRoom,
  request,
  seatTable,
  settle,
  startTestServer,
  waitForState,
  type TestServer,
} from './helpers/test-server.js';

/*
 * Between games anybody at the table may say Ready, and once everybody here
 * but the host has, the next game starts without them; while the host is
 * away, the player the crown would pass to may start at once (decided by
 * Ryan on 2026-10-21).
 */
describe('getting ready for the next game', () => {
  let harness: TestServer;

  afterEach(async () => {
    await harness.teardown();
  });

  const snapTable = <const Names extends readonly [string, ...string[]]>(
    names: Names,
  ) =>
    seatTable(harness, names, (owner, username) =>
      createSnapRoom(owner, { username }),
    );

  it('lets anybody at the table say Ready, and starts once everybody but the host has', async () => {
    harness = await startTestServer();
    const {
      roomId,
      players: [ryan, maya, leo],
    } = await snapTable(['Ryan', 'Maya', 'Leo']);
    const room = () => harness.server.rooms.get(roomId)!;

    expect(await request(maya, 'room:ready', roomId, true)).toEqual({
      ok: true,
    });
    const seen = await waitForState(ryan, (state) => state.ready.length === 1);
    expect(seen.ready).toEqual([maya.playerId]);
    expect(room().isGameStarted).toBe(false);

    // Taking it back, and saying it again.
    await request(maya, 'room:ready', roomId, false);
    expect(room().ready.size).toBe(0);
    await request(maya, 'room:ready', roomId, true);

    expect(await request(leo, 'room:ready', roomId, true)).toEqual({
      ok: true,
    });
    expect(room().isGameStarted).toBe(true);
    // Whoever said Ready has had their say: the next game starts afresh.
    const started = await waitForState(ryan, (state) => state.isGameStarted);
    expect(started.ready).toEqual([]);
    expect((await request(leo, 'room:ready', roomId, true)).error?.type).toBe(
      'gameAlreadyStarted',
    );
  });

  it('is only for players at the table', async () => {
    harness = await startTestServer();
    const {
      roomId,
      players: [, maya],
    } = await snapTable(['Ryan', 'Maya']);
    const sam = await harness.connect();
    await joinRoom(sam, roomId, 'Sam', '', 'spectator');

    expect((await request(sam, 'room:ready', roomId, true)).error?.type).toBe(
      'notRoomMember',
    );
    expect((await request(maya, 'room:ready', roomId, 'yes')).error?.type).toBe(
      'invalidRequest',
    );
    expect(harness.server.rooms.get(roomId)!.isGameStarted).toBe(false);
  });

  it('does not wait on a player who is away, nor start with nobody ready', async () => {
    harness = await startTestServer(undefined, 5);
    const {
      roomId,
      players: [, maya, leo],
    } = await snapTable(['Ryan', 'Maya', 'Leo']);
    const room = () => harness.server.rooms.get(roomId)!;

    leo.close();
    await settle();
    expect(room().playerList[leo.playerId]?.isConnected).toBe(false);
    expect(room().isGameStarted).toBe(false);

    await request(maya, 'room:ready', roomId, true);
    expect(room().isGameStarted).toBe(true);
  });

  it('starts when the one the table waited on leaves it', async () => {
    harness = await startTestServer();
    const {
      roomId,
      players: [, maya, leo],
    } = await snapTable(['Ryan', 'Maya', 'Leo']);
    const room = () => harness.server.rooms.get(roomId)!;

    await request(maya, 'room:ready', roomId, true);
    expect(room().isGameStarted).toBe(false);
    leo.emit('room:leave', roomId);
    await settle();
    expect(room().isGameStarted).toBe(true);
  });

  it('forgets a Ready when its player goes to watch', async () => {
    harness = await startTestServer();
    const {
      roomId,
      players: [, maya],
    } = await snapTable(['Ryan', 'Maya', 'Leo']);
    const room = () => harness.server.rooms.get(roomId)!;

    await request(maya, 'room:ready', roomId, true);
    expect(await request(maya, 'room:watch', roomId)).toEqual({ ok: true });
    expect(room().ready.size).toBe(0);
    expect(room().isGameStarted).toBe(false);
  });

  it('passes the right to start to the next player at once while the host is away', async () => {
    // A grace long enough that the crown itself cannot have moved.
    harness = await startTestServer(undefined, 5);
    const {
      roomId,
      players: [ryan, maya, leo],
    } = await snapTable(['Ryan', 'Maya', 'Leo']);
    const room = () => harness.server.rooms.get(roomId)!;

    expect((await request(maya, 'game:start', roomId)).error?.type).toBe(
      'notRoomOwner',
    );

    ryan.close();
    await settle();
    expect(room().owner.playerId).toBe(ryan.playerId);
    // Leo is not next in line: Maya is.
    expect((await request(leo, 'game:start', roomId)).error?.type).toBe(
      'notRoomOwner',
    );
    expect(await request(maya, 'game:start', roomId)).toEqual({ ok: true });
    expect(room().isGameStarted).toBe(true);
    // The crown stays the host's, for when they come back.
    expect(room().owner.playerId).toBe(ryan.playerId);
  });

  it('gives the right back to a host who returns', async () => {
    harness = await startTestServer(undefined, 5);
    const {
      roomId,
      players: [ryan, maya],
    } = await snapTable(['Ryan', 'Maya', 'Leo']);

    const back = await harness.reload(ryan);
    await joinRoom(back, roomId, 'Ryan');
    await settle();
    expect((await request(maya, 'game:start', roomId)).error?.type).toBe(
      'notRoomOwner',
    );
    expect(await request(back, 'game:start', roomId)).toEqual({ ok: true });
  });
});
