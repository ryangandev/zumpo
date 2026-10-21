import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameType } from '../models/types.js';
import { SEATS } from '../../shared/seats.js';
import {
  joinRoom,
  request,
  settle,
  startTestServer,
  type TestServer,
} from './helpers/test-server.js';

/** A valid create request's settings for each game. */
const SETTINGS: Record<GameType, object> = {
  'draw-and-guess': { rounds: 1 },
  minesweeper: { difficulty: 'Small' },
  'make-24': { hands: 5 },
  pairs: { board: 'Small' },
  trios: { trios: 10 },
  snap: {},
  'liars-dice': { dicePerPlayer: 3 },
  hush: {},
  'daily-word': { rounds: 3 },
  'doodle-chain': { drawingSeconds: 60 },
};

const GAME_TYPES = Object.keys(SETTINGS) as GameType[];

/*
 * Who may start, and when, is the same question in every game, so the room
 * layer asks it once; a new game cannot forget to.
 */
describe('starting a game', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it.each(GAME_TYPES)(
    'is for the owner of a %s room, with enough players, once',
    async (gameType) => {
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
          settings: SETTINGS[gameType],
        },
      );
      expect(created.ok).toBe(true);
      const { roomId } = created;
      const room = () => harness.server.rooms.get(roomId);

      expect((await request(owner, 'game:start', roomId)).error?.type).toBe(
        'notEnoughPlayers',
      );

      const guests = [];
      for (let seat = 1; seat < SEATS[gameType].min; seat++) {
        const guest = await harness.connect();
        await joinRoom(guest, roomId, `Guest ${seat}`);
        guests.push(guest);
      }
      await settle();
      expect(
        (await request(guests[0]!, 'game:start', roomId)).error?.type,
      ).toBe('notRoomOwner');
      expect(room()?.isGameStarted).toBe(false);

      expect(await request(owner, 'game:start', roomId)).toEqual({ ok: true });
      expect(room()?.isGameStarted).toBe(true);
      expect((await request(owner, 'game:start', roomId)).error?.type).toBe(
        'gameAlreadyStarted',
      );
    },
  );
});
