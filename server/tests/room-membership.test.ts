import { textOf } from './helpers/test-server.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seatCount } from '../libs/rooms/seats.js';
import {
  collect,
  collectChat,
  createRoom,
  joinRoom,
  lobbyView,
  request,
  settle,
  startTestServer,
  syncRoom,
  waitForChat,
  waitForDrawState,
  type TestServer,
} from './helpers/test-server.js';

describe('joining and leaving a room', () => {
  let harness: TestServer;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  it('admits a player and tells everyone in the room who is in it', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Ada' });

    const guest = await harness.connect();
    const ownerSees = waitForDrawState(
      owner,
      (state) => state.currentPlayerCount === 2,
    );
    const guestSees = waitForDrawState(
      guest,
      (state) => state.currentPlayerCount === 2,
    );
    await joinRoom(guest, roomId, 'Grace');

    for (const state of await Promise.all([ownerSees, guestSees])) {
      expect(
        Object.values(state.playerList).map((player) => player.username),
      ).toEqual(expect.arrayContaining(['Ada', 'Grace']));
    }
  });

  it('announces an arrival in the chat', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Ada' });

    const guest = await harness.connect();
    const announced = waitForChat(owner, (message) =>
      textOf(message).includes('Grace'),
    );
    await joinRoom(guest, roomId, 'Grace');

    expect(await announced).toMatchObject({
      kind: 'system',
      notice: { type: 'room:joined', name: 'Grace' },
    });
  });

  it('refuses the wrong password and admits the right one', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { password: 'open-sesame' });

    const guest = await harness.connect();
    const refused = await request(guest, 'room:join', roomId, 'Guest', 'wrong');
    expect(refused).toEqual({
      ok: false,
      error: { type: 'incorrectPassword', message: expect.any(String) },
    });
    expect(harness.server.rooms.get(roomId)?.playerList[guest.playerId]).toBe(
      undefined,
    );

    await expect(
      joinRoom(guest, roomId, 'Guest', 'open-sesame'),
    ).resolves.toBeUndefined();
  });

  it('reports a room that does not exist rather than inventing one', async () => {
    const client = await harness.connect();
    const answer = await request(
      client,
      'room:join',
      randomUUID(),
      'Nobody',
      '',
    );

    expect(answer.error?.type).toBe('roomNotExist');
  });

  it('marks a room full at capacity and turns further players away', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { maxPlayers: 2 });

    const second = await harness.connect();
    await joinRoom(second, roomId, 'Two');

    expect((await lobbyView(owner, roomId))?.status).toBe('Full');

    const third = await harness.connect();
    const answer = await request(
      third,
      'room:join',
      roomId,
      'Three',
      '',
      'player',
    );

    expect(answer.error?.type).toBe('roomNotOpen');
  });

  /*
   * A seated player is returning to their seat, so a full room is no reason
   * to turn them away, and the seat they hold keeps the name it was taken
   * with.
   */
  it('lets a seated player join again, without a second seat', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, {
      maxPlayers: 2,
      username: 'Ada',
      password: 'locked',
    });
    const second = await harness.connect();
    await joinRoom(second, roomId, 'Two', 'locked');

    // Full, locked, and asked again without the password.
    await expect(joinRoom(owner, roomId, 'Renamed')).resolves.toBeUndefined();

    const room = harness.server.rooms.get(roomId);
    expect(seatCount(room!)).toBe(2);
    expect(room?.playerList[owner.playerId]?.username).toBe('Ada');
  });

  it('refuses a join with a malformed payload', async () => {
    const client = await harness.connect();
    const answer = await request(client, 'room:join', 'not-a-room', '', '');

    expect(answer.error?.type).toBe('invalidRequest');
  });

  /*
   * The page asks once its listeners are live, rather than relying on a
   * broadcast that raced its own navigation.
   */
  it('replays the room, its chat and its drawing on request', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Ada' });

    const latecomer = await harness.connect();
    await joinRoom(latecomer, roomId, 'Late');
    await settle();

    const canvas = collect(latecomer, 'dg:canvas:sync');
    const { state, messages } = await syncRoom(latecomer, roomId);
    await settle();

    expect(state.currentPlayerCount).toBe(2);
    expect(state.roomId).toBe(roomId);
    expect(messages.map((message) => textOf(message))).toEqual([
      'Ada created the room.',
      'Late has joined the room.',
    ]);
    expect(canvas).toEqual([[roomId, []]]);
  });

  /*
   * A client that arrives at a room without a seat (a pasted link, say) is
   * told so rather than handed the room's state. A locked room's player list
   * is not something a stranger should be able to pull with a room id off the
   * lobby broadcast, and every id in that broadcast is public.
   */
  it('refuses the room to a client that holds no seat', async () => {
    const holder = await harness.connect();
    const roomId = await createRoom(holder, { username: 'Holder' });

    const arriving = await harness.connect();
    const leaked = collect(arriving, 'room:state');
    const history = collect(arriving, 'chat:history');
    const answer = await request(arriving, 'room:sync', roomId);

    expect(answer).toEqual({
      ok: false,
      error: { type: 'notRoomMember', message: expect.any(String) },
    });
    await settle();
    expect(leaked).toEqual([]);
    expect(history).toEqual([]);
  });

  /*
   * ...and that refusal is the room page's cue to ask for a seat, which is how
   * a pasted link still gets you into an open room.
   */
  it('lets a refused client join, and then see the room', async () => {
    const holder = await harness.connect();
    const roomId = await createRoom(holder, { username: 'Holder' });

    const arriving = await harness.connect();
    expect((await request(arriving, 'room:sync', roomId)).ok).toBe(false);
    await joinRoom(arriving, roomId, 'Arrived');

    const { state } = await syncRoom(arriving, roomId);
    expect(state.playerList[arriving.playerId]?.username).toBe('Arrived');
    expect(state.currentPlayerCount).toBe(2);
  });

  it('reports a sync for a room that has gone away', async () => {
    const client = await harness.connect();
    const answer = await request(client, 'room:sync', randomUUID());

    expect(answer.error?.type).toBe('roomNotExist');
  });

  it('hands ownership to the next player when the owner leaves', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Ada' });

    const guest = await harness.connect();
    await joinRoom(guest, roomId, 'Grace');

    const departure = waitForDrawState(
      guest,
      (state) => !state.playerList[owner.playerId],
    );
    const announced = waitForChat(guest, (message) =>
      textOf(message).includes('owner'),
    );
    owner.emit('room:leave', roomId);

    expect((await departure).owner).toEqual({
      username: 'Grace',
      playerId: guest.playerId,
    });
    expect(await announced).toMatchObject({
      kind: 'alert',
      notice: { type: 'room:owner-left', name: 'Ada', owner: 'Grace' },
    });
  });

  it('announces a departure under the name on the seat', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Ada' });
    const guest = await harness.connect();
    await joinRoom(guest, roomId, 'Grace');

    const announced = waitForChat(owner, (message) =>
      textOf(message).includes('left'),
    );
    guest.emit('room:leave', roomId);

    expect(await announced).toMatchObject({
      kind: 'alert',
      notice: { type: 'room:left', name: 'Grace' },
    });
  });

  it('deletes a room once the last player leaves', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner);

    owner.emit('room:leave', roomId);
    await settle();

    expect(harness.server.rooms.get(roomId)).toBeUndefined();
  });

  it('holds the room briefly when its last player drops, then cleans up', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner);

    owner.close();
    await settle(200);

    // Still there: a dropped connection might be a reload, and deleting the
    // room immediately is what used to make refreshing into one impossible.
    expect(harness.server.rooms.get(roomId)).toBeDefined();
    expect(
      harness.server.rooms.get(roomId)?.playerList[owner.playerId]?.isConnected,
    ).toBe(false);

    await settle(700);

    expect(harness.server.rooms.get(roomId)).toBeUndefined();
  });

  /*
   * Leaving a room you were never in used to run the entire departure anyway:
   * the player count was recomputed, ownership could be handed on, and the
   * room was told somebody had left.
   */
  describe('a leave from a socket that is not in the room', () => {
    it('changes nothing and reports nothing', async () => {
      const owner = await harness.connect();
      const roomId = await createRoom(owner, { username: 'Ada' });

      const guest = await harness.connect();
      await joinRoom(guest, roomId, 'Grace');
      await settle();

      const messages = collectChat(owner);
      const states = collect(owner, 'room:state');

      const stranger = await harness.connect();
      stranger.emit('room:leave', roomId);
      await settle();

      expect(seatCount(harness.server.rooms.get(roomId)!)).toBe(2);
      expect(harness.server.rooms.get(roomId)?.owner.username).toBe('Ada');
      expect(messages).toEqual([]);
      expect(states).toEqual([]);
    });

    it('removes exactly one player when the same client leaves twice', async () => {
      const owner = await harness.connect();
      const roomId = await createRoom(owner);

      const guest = await harness.connect();
      await joinRoom(guest, roomId, 'Grace');

      guest.emit('room:leave', roomId);
      await settle();
      guest.emit('room:leave', roomId);
      await settle();

      expect(seatCount(harness.server.rooms.get(roomId)!)).toBe(1);
    });
  });
});
