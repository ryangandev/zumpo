import { textOf } from './helpers/test-server.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DailyWordRoomState } from '../models/types.js';
import {
  collectChat,
  createDailyWordRoom,
  dailyWordRoom,
  joinRoom,
  lobbyView,
  playToFirstWord,
  request,
  settle,
  startTestServer,
  waitForChat,
  waitForDailyWordState,
  type ClientSocket,
  type TestServer,
} from './helpers/test-server.js';
import { GUESSES } from '../../shared/daily-word-guesses.js';
import { MAX_GUESSES, roomWords } from '../../shared/daily-word.js';
import { seededRandom, seedNumber } from '../../shared/seed.js';

type Answer = { ok: boolean; error?: { type: string; message: string } };

/** The open word, read off the server: the one thing a client never has. */
const wordOf = (harness: TestServer, roomId: string) => {
  const game = dailyWordRoom(harness, roomId).game;
  return game.words[game.round - 1];
};

/** Valid guesses that are not `word`, to miss with. */
const missesFor = (word: string, count = MAX_GUESSES) =>
  GUESSES.filter((guess) => guess !== word).slice(0, count);

const guess = (client: ClientSocket, roomId: string, word: string) =>
  request<Answer>(client, 'dw:guess', roomId, word);

const boardOf = (state: DailyWordRoomState, playerId: string) =>
  state.boards.find((board) => board.playerId === playerId)!;

describe('a Daily Word room', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('lists its words in its own lobby', async () => {
    const client = await harness.connect();
    const roomId = await createDailyWordRoom(client, { rounds: 5 });

    expect(await lobbyView(client, roomId, 'daily-word')).toMatchObject({
      gameType: 'daily-word',
      rounds: 5,
    });
  });

  it('refuses a game of any other length than 3 or 5 words', async () => {
    const client = await harness.connect();

    const answer = await request(client, 'room:create', {
      gameType: 'daily-word',
      roomName: 'Marathon',
      username: 'Ada',
      maxPlayers: 4,
      password: '',
      settings: { rounds: 4 },
    });

    expect(answer.error?.type).toBe('invalidRequest');
    expect(Object.keys(harness.server.rooms)).toEqual([]);
  });

  it('waits with no boards before the first game', async () => {
    const client = await harness.connect();
    const first = waitForDailyWordState(client);
    await createDailyWordRoom(client);

    expect(await first).toMatchObject({
      phase: 'waiting',
      round: 0,
      boards: [],
      lastRound: null,
      lastGame: null,
    });
  });

  it('gives everybody an empty board, and the word to nobody', async () => {
    const { roomId, first } = await playToFirstWord(harness);

    expect(first.boards).toHaveLength(2);
    expect(first.boards.every((board) => board.rows.length === 0)).toBe(true);
    expect(first.phaseEndsInMs).toBeGreaterThan(0);
    expect(JSON.stringify(first)).not.toContain(`"${wordOf(harness, roomId)}"`);
    expect(dailyWordRoom(harness, roomId).game.words).toHaveLength(3);
  });
});

describe('a round', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('marks a guess, and shows the others its marks, never its letters', async () => {
    const { roomId, alice, bob } = await playToFirstWord(harness);
    const [miss] = missesFor(wordOf(harness, roomId)!, 1);

    const aliceSees = waitForDailyWordState(
      alice,
      (s) => boardOf(s, alice.playerId).rows.length === 1,
    );
    const bobSees = waitForDailyWordState(
      bob,
      (s) => boardOf(s, alice.playerId).rows.length === 1,
    );
    expect(await guess(alice, roomId, miss!.toUpperCase())).toEqual({
      ok: true,
    });

    const [mine, theirs] = await Promise.all([aliceSees, bobSees]);
    const row = boardOf(mine, alice.playerId).rows[0];
    expect(row!.word).toBe(miss);
    expect(row!.marks).toHaveLength(5);
    expect(boardOf(theirs, alice.playerId)).toMatchObject({
      status: 'guessing',
      rows: [{ word: null, marks: row!.marks }],
    });
    expect(JSON.stringify(theirs)).not.toContain(`"${miss}"`);
  });

  it('turns back a word that is not one, a repeat, and a short row', async () => {
    const { roomId, alice } = await playToFirstWord(harness);
    const [miss] = missesFor(wordOf(harness, roomId)!, 1);

    const notAWord = await guess(alice, roomId, 'blant');
    expect(notAWord.error).toMatchObject({
      type: 'invalidRequest',
      message: expect.stringContaining('notAWord'),
    });

    await guess(alice, roomId, miss!);
    const repeat = await guess(alice, roomId, miss!);
    expect(repeat.error?.message).toContain('alreadyGuessed');

    expect((await guess(alice, roomId, 'abc')).error?.type).toBe(
      'invalidRequest',
    );
    const game = dailyWordRoom(harness, roomId).game;
    expect(game.boards.get(alice.playerId)!.guesses).toEqual([miss]);
  });

  it('scores the word found, and announces it', async () => {
    const { roomId, alice, bob } = await playToFirstWord(harness);
    const word = wordOf(harness, roomId);
    const [miss] = missesFor(word!, 1);

    await guess(alice, roomId, miss!);
    const announced = waitForChat(bob, (m) => m.kind === 'score');
    const found = waitForDailyWordState(
      bob,
      (s) => boardOf(s, alice.playerId).status === 'found',
    );
    await guess(alice, roomId, word!);

    const [state, message] = await Promise.all([found, announced]);
    const board = boardOf(state, alice.playerId);
    // Two guesses: 500, plus up to 50 for the time left.
    expect(board.points).toBeGreaterThan(500);
    expect(board.points).toBeLessThanOrEqual(550);
    expect(state.playerList[alice.playerId]!.points).toBe(board.points);
    expect(textOf(message)).toBe(`Alice got it in 2! (+${board.points})`);
    expect(JSON.stringify(state)).not.toContain(`"${word}"`);
  });

  it('takes no more guesses from a player who is done', async () => {
    const { roomId, alice } = await playToFirstWord(harness);
    const word = wordOf(harness, roomId);
    await guess(alice, roomId, word!);

    const after = await guess(alice, roomId, missesFor(word!, 1)[0]!);
    expect(after.error?.message).toBe('You are done with this word.');
  });

  it('keeps a player who has found the word out of the chat until it ends', async () => {
    const { roomId, alice, bob } = await playToFirstWord(harness);
    await guess(alice, roomId, wordOf(harness, roomId)!);

    const bobHears = collectChat(bob);
    alice.emit('chat:send', roomId, 'that was easy');
    await settle();
    expect(bobHears.filter((m) => m.kind === 'player')).toEqual([]);

    // Bob, still guessing, may talk.
    const heard = waitForChat(alice, (m) => m.kind === 'player');
    bob.emit('chat:send', roomId, 'hmm');
    expect(textOf(await heard)).toBe('hmm');
  });

  it('keeps a player who found the word, left and came back to watch, out of the chat', async () => {
    const { roomId, alice, bob } = await playToFirstWord(harness, 3, {
      carol: true,
    });
    await guess(alice, roomId, wordOf(harness, roomId)!);
    alice.emit('room:leave', roomId);
    const watching = waitForDailyWordState(
      alice,
      (s) => alice.playerId in s.spectators,
    );
    await joinRoom(alice, roomId, 'Alice');
    await watching;

    const bobHears = collectChat(bob);
    alice.emit('chat:send', roomId, 'that was easy');
    await settle();
    expect(bobHears.filter((m) => m.kind === 'player')).toEqual([]);
  });

  it('lets a player who is out of guesses talk, and says so on their board', async () => {
    const { roomId, alice, bob } = await playToFirstWord(harness);
    for (const miss of missesFor(wordOf(harness, roomId)!)) {
      expect((await guess(bob, roomId, miss)).ok).toBe(true);
    }
    const out = await waitForDailyWordState(
      alice,
      (s) => boardOf(s, bob.playerId).status === 'out',
    );
    expect(boardOf(out, bob.playerId).rows).toHaveLength(MAX_GUESSES);

    const heard = waitForChat(alice, (m) => m.kind === 'player');
    bob.emit('chat:send', roomId, 'no idea');
    expect(textOf(await heard)).toBe('no idea');
  });

  it('ends early once everybody is done, and reveals every board', async () => {
    const { roomId, alice, bob } = await playToFirstWord(harness);
    const word = wordOf(harness, roomId);
    const reveal = waitForDailyWordState(
      alice,
      (s) => s.phase === 'reveal' && s.round === 1,
    );
    const said = waitForChat(alice, (m) =>
      textOf(m).startsWith('The word was'),
    );
    await guess(alice, roomId, word!);
    for (const miss of missesFor(word!)) await guess(bob, roomId, miss);

    const results = await reveal;
    expect(results.boards).toEqual([]);
    expect(results.lastRound!.word).toBe(word);
    // Best first, with everybody's letters now.
    expect(results.lastRound!.boards.map((b) => b.username)).toEqual([
      'Alice',
      'Bob',
    ]);
    expect(results.lastRound!.boards[1]).toMatchObject({
      status: 'out',
      points: 0,
    });
    expect(results.lastRound!.boards[1]!.rows[0]!.word).toBe(
      missesFor(word!)[0],
    );
    expect(textOf(await said)).toBe(`The word was ${word!.toUpperCase()}.`);

    const next = await waitForDailyWordState(
      alice,
      (s) => s.phase === 'guessing' && s.round === 2,
    );
    expect(next.boards.every((board) => board.rows.length === 0)).toBe(true);
  });

  it('ends on time for those still guessing, at no cost', async () => {
    const { roomId, alice } = await playToFirstWord(harness);
    await guess(alice, roomId, wordOf(harness, roomId)!);

    const results = await waitForDailyWordState(
      alice,
      (s) => s.phase === 'reveal',
      4000,
    );
    expect(results.lastRound!.boards[1]).toMatchObject({
      username: 'Bob',
      status: 'guessing',
      points: 0,
      rows: [],
    });
  });

  it('keeps the guesses through a refresh', async () => {
    const { roomId, alice } = await playToFirstWord(harness);
    const [miss] = missesFor(wordOf(harness, roomId)!, 1);
    await guess(alice, roomId, miss!);

    const again = await harness.reload(alice);
    const state = waitForDailyWordState(again);
    await request(again, 'room:sync', roomId);
    expect(boardOf(await state, alice.playerId).rows[0]!.word).toBe(miss);
  });
});

describe('a Daily Word game', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('ends after its last word, with the words each player found', async () => {
    const { roomId, alice, bob } = await playToFirstWord(harness);
    for (let round = 1; round <= 3; round++) {
      const word = wordOf(harness, roomId);
      await guess(alice, roomId, word!);
      if (round === 2) {
        for (const miss of missesFor(word!)) await guess(bob, roomId, miss);
      } else {
        await guess(bob, roomId, word!);
      }
      if (round < 3) {
        await waitForDailyWordState(
          alice,
          (s) => s.phase === 'guessing' && s.round === round + 1,
        );
      }
    }

    const over = await waitForDailyWordState(alice, (s) => s.lastGame !== null);
    expect(over).toMatchObject({
      phase: 'waiting',
      isGameStarted: false,
      round: 0,
      boards: [],
    });
    expect(over.lastGame).toMatchObject({
      endedEarly: false,
      rounds: 3,
      found: { [alice.playerId]: 3, [bob.playerId]: 2 },
    });
    expect(over.lastGame!.standings[0]!.username).toBe('Alice');
    // The last round stays up with the summary.
    expect(over.lastRound!.boards).toHaveLength(2);
  });

  it('never deals the same word twice in a game', async () => {
    const { roomId } = await playToFirstWord(harness, 5);
    const { words } = dailyWordRoom(harness, roomId).game;
    expect(new Set(words).size).toBe(5);
  });

  it('deals the same words every game when given a seed', async () => {
    await harness.teardown();
    harness = await startTestServer(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        dailyWordSeed: 'figma',
      },
    );
    const seeded = roomWords(seededRandom(seedNumber('figma')), 5, new Date());
    for (let game = 0; game < 2; game++) {
      const { roomId } = await playToFirstWord(harness, 5);
      expect(dailyWordRoom(harness, roomId).game.words).toEqual(seeded);
    }
  });

  it('ends early when too few players are left', async () => {
    const { roomId, alice, bob } = await playToFirstWord(harness);
    const over = waitForDailyWordState(alice, (s) => s.lastGame !== null);
    bob.emit('room:leave', roomId);

    expect((await over).lastGame).toMatchObject({
      endedEarly: true,
      rounds: 0,
    });
  });
});
