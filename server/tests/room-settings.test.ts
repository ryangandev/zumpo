import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  DrawAndGuessRoomState,
  GameType,
  LiarsDiceRoomState,
} from '../models/types.js';
import { SEATS } from '../../shared/seats.js';
import {
  createLiarsDiceRoom,
  createRoom,
  createMinesweeperRoom,
  joinRoom,
  lobbyView,
  request,
  seatTable,
  settle,
  startGame,
  startTestServer,
  waitForState,
  type TestServer,
} from './helpers/test-server.js';

/** Each game's settings as a room is made, and another it may change to. */
const SETTINGS: Record<GameType, [object, object]> = {
  'draw-and-guess': [
    { rounds: 1, categories: ['Animals', 'Food'] },
    { rounds: 3, categories: ['Sea Life'] },
  ],
  minesweeper: [{ difficulty: 'Small' }, { difficulty: 'Large' }],
  'make-24': [{ hands: 5 }, { hands: 10 }],
  pairs: [{ board: 'Small' }, { board: 'Large' }],
  trios: [{ trios: 10 }, { trios: 20 }],
  snap: [{}, {}],
  'liars-dice': [{ dicePerPlayer: 3 }, { dicePerPlayer: 5 }],
  hush: [{}, {}],
  'daily-word': [{ rounds: 3 }, { rounds: 5 }],
  'code-breaker': [{ rounds: 3 }, { rounds: 1 }],
  'doodle-chain': [{ drawingSeconds: 60 }, { drawingSeconds: 90 }],
  gomoku: [{}, {}],
};

const GAME_TYPES = Object.keys(SETTINGS) as GameType[];

/*
 * Between games the starter may change what the next game is played with.
 * The room layer sets each setting on the game's state under its own name,
 * so every game must keep it there and show it under that name.
 */
describe('changing the next game', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it.each(GAME_TYPES)(
    'is for the host of a %s room, between games, with settings the game offers',
    async (gameType) => {
      const [first, next] = SETTINGS[gameType];
      const owner = await harness.connect();
      const created = await request<{ ok: boolean; roomId: string }>(
        owner,
        'room:create',
        {
          gameType,
          roomName: 'Room',
          username: 'Owner',
          maxPlayers: SEATS[gameType].max,
          password: '',
          settings: first,
        },
      );
      const { roomId } = created;
      const guest = await harness.connect();
      await joinRoom(guest, roomId, 'Guest');

      expect(
        (await request(guest, 'room:settings', roomId, next)).error?.type,
      ).toBe('notRoomOwner');
      expect(
        (await request(owner, 'room:settings', roomId, { nonsense: 1 })).error
          ?.type,
      ).toBe('invalidRequest');

      expect(await request(owner, 'room:settings', roomId, next)).toEqual({
        ok: true,
      });
      // The snapshot and the lobby row both show it, under its own name.
      const state = await waitForState(guest, (candidate) =>
        Object.entries(next).every(
          ([key, value]) =>
            JSON.stringify(
              (candidate as unknown as Record<string, unknown>)[key],
            ) === JSON.stringify(value),
        ),
      );
      expect(state.isGameStarted).toBe(false);
      expect(await lobbyView(guest, roomId, gameType)).toMatchObject(next);
    },
  );

  it('is refused while a game is on', async () => {
    const {
      roomId,
      players: [owner],
    } = await seatTable(harness, ['Ryan', 'Maya'], (client, username) =>
      createLiarsDiceRoom(client, { username }),
    );
    await startGame(owner, roomId);
    expect(
      (await request(owner, 'room:settings', roomId, { dicePerPlayer: 5 }))
        .error?.type,
    ).toBe('gameAlreadyStarted');
  });

  it('plays the next game with what was chosen', async () => {
    const {
      roomId,
      players: [owner, maya],
    } = await seatTable(harness, ['Ryan', 'Maya'], (client, username) =>
      createLiarsDiceRoom(client, { username }),
    );
    await request(owner, 'room:settings', roomId, { dicePerPlayer: 5 });
    await startGame(owner, roomId);
    const state = await waitForState<LiarsDiceRoomState>(
      maya,
      (candidate) => candidate.isGameStarted,
    );
    expect(state.cups.map((cup) => cup.diceLeft)).toEqual([5, 5]);
  });

  it('draws the next Draw & Guess game from the categories picked, and never none', async () => {
    const {
      roomId,
      players: [owner, maya],
    } = await seatTable(harness, ['Ryan', 'Maya'], (client, username) =>
      createRoom(client, { username, categories: ['Animals', 'Food'] }),
    );
    for (const categories of [[], ['Dinosaurs'], ['Food', 'Food']]) {
      expect(
        (
          await request(owner, 'room:settings', roomId, {
            rounds: 1,
            categories,
          })
        ).error?.type,
      ).toBe('invalidRequest');
    }
    expect(
      await request(owner, 'room:settings', roomId, {
        rounds: 1,
        categories: ['Fantasy'],
      }),
    ).toEqual({ ok: true });
    await startGame(owner, roomId);
    const state = await waitForState<DrawAndGuessRoomState>(
      maya,
      (candidate) => candidate.isGameStarted,
    );
    expect(state).toMatchObject({
      categories: ['Fantasy'],
      wordCategory: 'Fantasy',
    });
  });

  it('keeps showing the last minefield at its own size until the next is dealt', async () => {
    const {
      roomId,
      players: [owner, maya],
    } = await seatTable(harness, ['Ryan', 'Maya'], (client, username) =>
      createMinesweeperRoom(client, { username, difficulty: 'Small' }),
    );
    await request(owner, 'room:settings', roomId, { difficulty: 'Large' });
    await settle();
    const before = maya.state as { width: number; board: unknown[] };
    expect(before.board).toHaveLength(before.width * 9);

    await startGame(owner, roomId);
    const after = await waitForState(maya, (state) => state.isGameStarted);
    expect(after).toMatchObject({ difficulty: 'Large', width: 30, height: 16 });
  });

  it('passes to the next player while the host is away', async () => {
    await harness.teardown();
    harness = await startTestServer(undefined, 5);
    const {
      roomId,
      players: [owner, maya],
    } = await seatTable(harness, ['Ryan', 'Maya'], (client, username) =>
      createLiarsDiceRoom(client, { username }),
    );
    owner.close();
    await settle();
    expect(
      await request(maya, 'room:settings', roomId, { dicePerPlayer: 5 }),
    ).toEqual({ ok: true });
  });
});
