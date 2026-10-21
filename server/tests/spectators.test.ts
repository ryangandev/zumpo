import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_SPECTATORS } from '../../shared/room.js';
import type { DrawAndGuessRoomState, HushRoomState } from '../models/types.js';
import {
  collectChat,
  createHushRoom,
  createRoom,
  hushRoom,
  joinRoom,
  lobbyView,
  playToDrawingPhase,
  request,
  serverRoom,
  settle,
  startGame,
  startTestServer,
  syncRoom,
  textOf,
  waitForChat,
  waitForDrawState,
  waitForHushState,
  waitForState,
  type TestServer,
} from './helpers/test-server.js';

/*
 * Spectator seats: anybody may watch a room instead of playing, a latecomer
 * to a game under way watches it, and between games either may move. A
 * spectator sees what any player may see, can talk, and is never part of the
 * game.
 */
describe('spectators', () => {
  let harness: TestServer;

  beforeAll(async () => {
    harness = await startTestServer();
  });

  afterAll(async () => {
    await harness.teardown();
  });

  it('seats somebody arriving at a game under way in the spectator seats', async () => {
    const { roomId, alice } = await playToDrawingPhase(harness);

    const carol = await harness.connect();
    const aliceSees = waitForState(
      alice,
      (state) => Object.keys(state.spectators).length === 1,
    );
    await joinRoom(carol, roomId, 'Carol');

    const room = serverRoom(harness, roomId);
    expect(room.playerList[carol.playerId]).toBeUndefined();
    expect(room.spectators[carol.playerId]).toEqual({
      username: 'Carol',
      isConnected: true,
    });
    expect((await aliceSees).spectators[carol.playerId]?.username).toBe(
      'Carol',
    );

    const { state } = await syncRoom(carol, roomId);
    expect(state.spectators[carol.playerId]).toBeDefined();
    expect((await lobbyView(carol, roomId))?.spectatorCount).toBe(1);
  });

  it('turns a latecomer away who asks to play a game under way', async () => {
    const { roomId } = await playToDrawingPhase(harness);
    const carol = await harness.connect();

    const answer = await request(
      carol,
      'room:join',
      roomId,
      'Carol',
      '',
      'player',
    );

    expect(answer.error?.type).toBe('roomNotOpen');
  });

  it('lets anybody watch an open room when they ask to', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Ada' });
    const carol = await harness.connect();

    await joinRoom(carol, roomId, 'Carol', '', 'spectator');

    const room = serverRoom(harness, roomId);
    expect(room.spectators[carol.playerId]).toBeDefined();
    expect(room.playerList[carol.playerId]).toBeUndefined();
  });

  it(`watches a full room, up to ${MAX_SPECTATORS} spectators`, async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { maxPlayers: 2 });
    await joinRoom(await harness.connect(), roomId, 'Two');

    for (let n = 1; n <= MAX_SPECTATORS; n += 1) {
      await joinRoom(await harness.connect(), roomId, `Watcher ${n}`);
    }
    const late = await harness.connect();
    const answer = await request(late, 'room:join', roomId, 'Late', '', null);

    expect(answer.error?.type).toBe('roomNotOpen');
    expect(Object.keys(serverRoom(harness, roomId).spectators)).toHaveLength(
      MAX_SPECTATORS,
    );
  });

  it('asks a spectator for the password of a private room', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { password: 'locked' });
    const carol = await harness.connect();

    const wrong = await request(
      carol,
      'room:join',
      roomId,
      'Carol',
      'nope',
      'spectator',
    );
    expect(wrong.error?.type).toBe('incorrectPassword');

    await joinRoom(carol, roomId, 'Carol', 'locked', 'spectator');
    expect(
      serverRoom(harness, roomId).spectators[carol.playerId],
    ).toBeDefined();
  });

  it('gives a spectator a number when their name is taken at the table', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Sam' });
    const other = await harness.connect();

    await joinRoom(other, roomId, 'Sam', '', 'spectator');

    expect(
      serverRoom(harness, roomId).spectators[other.playerId]?.username,
    ).toBe('Sam 2');
  });

  it('moves a player to watch and back between games, and says so', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Ada' });
    const bob = await harness.connect();
    await joinRoom(bob, roomId, 'Bob');

    const watching = waitForChat(
      owner,
      (m) => textOf(m) === 'Bob is watching.',
    );
    expect((await request(bob, 'room:watch', roomId)).ok).toBe(true);
    await watching;

    const room = serverRoom(harness, roomId);
    expect(room.playerList[bob.playerId]).toBeUndefined();
    expect(room.spectators[bob.playerId]?.username).toBe('Bob');

    const seated = waitForChat(owner, (m) => textOf(m) === 'Bob took a seat.');
    expect((await request(bob, 'room:sit', roomId)).ok).toBe(true);
    await seated;

    expect(room.spectators[bob.playerId]).toBeUndefined();
    expect(room.playerList[bob.playerId]).toMatchObject({
      username: 'Bob',
      points: 0,
    });
  });

  it('passes the crown on when the host moves to watch', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Ada' });
    const bob = await harness.connect();
    await joinRoom(bob, roomId, 'Bob');

    const told = waitForChat(
      bob,
      (m) => textOf(m) === 'Ada is watching. Bob is now the host.',
    );
    expect((await request(owner, 'room:watch', roomId)).ok).toBe(true);
    await told;
    expect(serverRoom(harness, roomId).owner).toEqual({
      playerId: bob.playerId,
      username: 'Bob',
    });
  });

  it('keeps the crown with a host who watches an empty table', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Ada' });

    expect((await request(owner, 'room:watch', roomId)).ok).toBe(true);
    expect(serverRoom(harness, roomId).owner.playerId).toBe(owner.playerId);
  });

  it('crowns a player who is here before one who is away', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Ada' });
    const bob = await harness.connect();
    await joinRoom(bob, roomId, 'Bob');
    const carol = await harness.connect();
    await joinRoom(carol, roomId, 'Carol');
    // Bob, first in line, drops; Carol is here.
    const away = waitForState(
      owner,
      (s) => s.playerList[bob.playerId]?.isConnected === false,
    );
    bob.close();
    await away;

    // The first new owner, before Bob's grace could run out and settle it.
    const crowned = waitForState(
      carol,
      (s) => s.owner.playerId !== owner.playerId,
    );
    owner.emit('room:leave', roomId);
    expect((await crowned).owner.playerId).toBe(carol.playerId);
  });

  it('keeps everybody where they are while a game is under way', async () => {
    const { roomId, alice } = await playToDrawingPhase(harness);
    const carol = await harness.connect();
    await joinRoom(carol, roomId, 'Carol');

    expect((await request(alice, 'room:watch', roomId)).error?.type).toBe(
      'gameAlreadyStarted',
    );
    expect((await request(carol, 'room:sit', roomId)).error?.type).toBe(
      'gameAlreadyStarted',
    );
  });

  it('keeps a spectator out of a full table', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { maxPlayers: 2 });
    await joinRoom(await harness.connect(), roomId, 'Two');
    const carol = await harness.connect();
    await joinRoom(carol, roomId, 'Carol');

    expect((await request(carol, 'room:sit', roomId)).error?.type).toBe(
      'roomNotOpen',
    );
  });

  it('refuses to move somebody who is not where they would move from', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner);
    const stranger = await harness.connect();

    expect((await request(stranger, 'room:watch', roomId)).error?.type).toBe(
      'notRoomMember',
    );
    expect((await request(owner, 'room:sit', roomId)).error?.type).toBe(
      'notRoomMember',
    );
  });

  it('never deals a spectator in', async () => {
    const owner = await harness.connect();
    const roomId = await createHushRoom(owner, { username: 'Ada' });
    const bob = await harness.connect();
    await joinRoom(bob, roomId, 'Bob');
    const carol = await harness.connect();
    await joinRoom(carol, roomId, 'Carol', '', 'spectator');

    const carolSees = waitForHushState(carol, (state) => state.isGameStarted);
    await startGame(owner, roomId);
    const view: HushRoomState = await carolSees;

    const game = hushRoom(harness, roomId).game;
    expect(game.hands[carol.playerId]).toBeUndefined();
    expect(Object.keys(view.table)).not.toContain(carol.playerId);
    expect(view.hand).toEqual([]);
  });

  it("shows a spectator the guessers' view, never the word", async () => {
    const { roomId, word } = await playToDrawingPhase(harness);
    const carol = await harness.connect();
    await joinRoom(carol, roomId, 'Carol');

    const { state } = await syncRoom(carol, roomId);
    const view = state as DrawAndGuessRoomState;
    expect(view.phase).toBe('drawing');
    expect(view.word).toBeUndefined();
    expect(view.wordChoices).toBeUndefined();
    expect(view.hint).not.toBe(word);
  });

  it('lets spectators talk among themselves while the word is drawn, swallows a right guess and scores nobody', async () => {
    const { roomId, drawer, guesser, word } = await playToDrawingPhase(harness);
    const carol = await harness.connect();
    await joinRoom(carol, roomId, 'Carol');
    const dave = await harness.connect();
    await joinRoom(dave, roomId, 'Dave');
    const heardByGuesser = collectChat(guesser);
    const heardByDrawer = collectChat(drawer);

    // A hint from the stands reaches the stands, and nobody at the table.
    const toDave = waitForChat(dave, (m) => m.kind === 'player');
    const toCarol = waitForChat(carol, (m) => m.kind === 'player');
    carol.emit('chat:send', roomId, 'it is a house!');
    const said = {
      kind: 'player',
      playerId: carol.playerId,
      username: 'Carol',
      text: 'it is a house!',
      audience: 'spectators',
    };
    expect(await toDave).toMatchObject(said);
    expect(await toCarol).toMatchObject(said);

    carol.emit('chat:send', roomId, word);
    await settle();
    for (const heard of [heardByGuesser, heardByDrawer]) {
      expect(heard.some((m) => m.kind === 'player')).toBe(false);
    }
    expect(heardByGuesser.some((m) => m.notice?.type === 'dg:guessed')).toBe(
      false,
    );
    expect(
      serverRoom(harness, roomId).game.scoredThisTurn.has(carol.playerId),
    ).toBe(false);

    // Nor does a refresh bring it to the table; it does to the stands.
    const atTable = await syncRoom(guesser, roomId);
    expect(atTable.messages.some((m) => m.kind === 'player')).toBe(false);
    const inStands = await syncRoom(dave, roomId);
    expect(inStands.messages).toContainEqual(expect.objectContaining(said));
  });

  it('lets a spectator talk to everybody once the word is out', async () => {
    const { roomId, guesser, word } = await playToDrawingPhase(harness);
    const carol = await harness.connect();
    await joinRoom(carol, roomId, 'Carol');

    const reveal = waitForDrawState(guesser, (s) => s.phase === 'reveal', 5000);
    guesser.emit('chat:send', roomId, word);
    await reveal;

    const hello = waitForChat(guesser, (m) => m.kind === 'player');
    carol.emit('chat:send', roomId, 'nice drawing');
    const message = await hello;
    expect(message).toMatchObject({ username: 'Carol', text: 'nice drawing' });
    expect(message.audience).toBeUndefined();
  });

  it('hands the room to a spectator once the last player leaves, and ends it with the last spectator', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Ada' });
    const carol = await harness.connect();
    await joinRoom(carol, roomId, 'Carol', '', 'spectator');

    owner.emit('room:leave', roomId);
    const crowned = await waitForState(
      carol,
      (state) => state.owner.playerId === carol.playerId,
    );
    expect(crowned.currentPlayerCount).toBe(0);
    expect(harness.server.rooms.has(roomId)).toBe(true);

    carol.emit('room:leave', roomId);
    await settle();
    expect(harness.server.rooms.has(roomId)).toBe(false);
  });

  it("holds a spectator's place quietly through a refresh", async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Ada' });
    const carol = await harness.connect();
    await joinRoom(carol, roomId, 'Carol', '', 'spectator');
    // The arrival is announced; only what follows it is the refresh.
    await waitForChat(owner, (m) => textOf(m) === 'Carol is watching.');
    const heard = collectChat(owner);

    const away = waitForDrawState(
      owner,
      (state) => state.spectators[carol.playerId]?.isConnected === false,
    );
    const back = await harness.reload(carol);
    await away.catch(() => undefined);
    await waitForDrawState(
      owner,
      (state) => state.spectators[back.playerId]?.isConnected === true,
    );

    expect(heard.filter((m) => m.kind !== 'player')).toEqual([]);
    expect(
      serverRoom(harness, roomId).spectators[back.playerId]?.username,
    ).toBe('Carol');
  });

  it("lets a spectator's place go when they do not come back", async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Ada' });
    const carol = await harness.connect();
    await joinRoom(carol, roomId, 'Carol', '', 'spectator');

    const left = waitForChat(
      owner,
      (m) => textOf(m) === 'Carol has left the room.',
    );
    carol.close();
    await left;

    expect(
      serverRoom(harness, roomId).spectators[carol.playerId],
    ).toBeUndefined();
  });

  it('renames a spectator in the room', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Ada' });
    const carol = await harness.connect();
    await joinRoom(carol, roomId, 'Carol', '', 'spectator');

    expect((await request(carol, 'player:rename', 'Caz')).ok).toBe(true);

    expect(
      serverRoom(harness, roomId).spectators[carol.playerId]?.username,
    ).toBe('Caz');
  });
});
