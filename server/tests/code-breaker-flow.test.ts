import { textOf } from './helpers/test-server.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CodeBreakerRoomState } from '../models/types.js';
import {
  codeBreakerRoom,
  collectChat,
  createCodeBreakerRoom,
  joinRoom,
  lobbyView,
  playToFirstCode,
  request,
  settle,
  startTestServer,
  waitForChat,
  waitForCodeBreakerState,
  type ClientSocket,
  type TestServer,
  endNotices,
} from './helpers/test-server.js';
import {
  ALL_CODES,
  MAX_GUESSES,
  markGuess,
  roomCodes,
} from '../../shared/code-breaker.js';
import { seededRandom, seedNumber } from '../../shared/seed.js';

type Answer = { ok: boolean; error?: { type: string; message: string } };

/** The open code, read off the server: the one thing a client never has. */
const codeOf = (harness: TestServer, roomId: string) => {
  const game = codeBreakerRoom(harness, roomId).game;
  return game.codes[game.round - 1]!;
};

/** Valid guesses that are not `code`, to miss with. */
const missesFor = (code: string, count = MAX_GUESSES) =>
  ALL_CODES.filter((guess) => guess !== code).slice(0, count);

const guess = (client: ClientSocket, roomId: string, digits: string) =>
  request<Answer>(client, 'cb:guess', roomId, digits);

/**
 * Misses ten times. Ten guesses in a row is more than a socket's burst of
 * requests, so one turned back for that is sent again a moment later, as a
 * player typing them would.
 */
const missEveryGuess = async (
  client: ClientSocket,
  roomId: string,
  code: string,
) => {
  for (const miss of missesFor(code)) {
    let answer = await guess(client, roomId, miss);
    while (answer.error?.message.startsWith('Too many requests')) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      answer = await guess(client, roomId, miss);
    }
    expect(answer).toEqual({ ok: true });
  }
};

const boardOf = (state: CodeBreakerRoomState, playerId: string) =>
  state.boards.find((board) => board.playerId === playerId)!;

/** Whether a snapshot names `code` anywhere, as a value of its own. */
const mentions = (state: CodeBreakerRoomState, code: string) =>
  JSON.stringify(state).includes(`"${code}"`);

describe('a Code Breaker room', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('lists its codes in its own lobby', async () => {
    const client = await harness.connect();
    const roomId = await createCodeBreakerRoom(client, { rounds: 1 });

    expect(await lobbyView(client, roomId, 'code-breaker')).toMatchObject({
      gameType: 'code-breaker',
      rounds: 1,
    });
  });

  it('refuses a game of any other length than 1 or 3 codes', async () => {
    const client = await harness.connect();

    const answer = await request(client, 'room:create', {
      gameType: 'code-breaker',
      roomName: 'Marathon',
      username: 'Ada',
      maxPlayers: 4,
      password: '',
      settings: { rounds: 5 },
    });

    expect(answer.error?.type).toBe('invalidRequest');
    expect(Object.keys(harness.server.rooms)).toEqual([]);
  });

  it('waits with no boards before the first game', async () => {
    const client = await harness.connect();
    const first = waitForCodeBreakerState(client);
    await createCodeBreakerRoom(client);

    expect(await first).toMatchObject({
      phase: 'waiting',
      round: 0,
      boards: [],
      lastRound: null,
      lastGame: null,
    });
  });

  it('gives everybody an empty board, and the code to nobody', async () => {
    const { roomId, first } = await playToFirstCode(harness);

    expect(first.boards).toHaveLength(2);
    expect(first.boards.every((board) => board.rows.length === 0)).toBe(true);
    expect(first.phaseEndsInMs).toBeGreaterThan(0);
    expect(mentions(first, codeOf(harness, roomId))).toBe(false);
    expect(first).not.toHaveProperty('codes');
    expect(codeBreakerRoom(harness, roomId).game.codes).toHaveLength(3);
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

  it('marks a guess, and shows the others its marks, never its digits', async () => {
    const { roomId, alice, bob } = await playToFirstCode(harness);
    const code = codeOf(harness, roomId);
    const [miss] = missesFor(code, 1);

    const aliceSees = waitForCodeBreakerState(
      alice,
      (s) => boardOf(s, alice.playerId).rows.length === 1,
    );
    const bobSees = waitForCodeBreakerState(
      bob,
      (s) => boardOf(s, alice.playerId).rows.length === 1,
    );
    expect(await guess(alice, roomId, miss!)).toEqual({ ok: true });

    const [mine, theirs] = await Promise.all([aliceSees, bobSees]);
    expect(boardOf(mine, alice.playerId).rows).toEqual([
      { guess: miss, mark: markGuess(miss!, code) },
    ]);
    expect(boardOf(theirs, alice.playerId)).toMatchObject({
      status: 'guessing',
      rows: [{ guess: null, mark: markGuess(miss!, code) }],
    });
    expect(mentions(theirs, miss!)).toBe(false);
    expect(mentions(mine, code)).toBe(false);
    expect(mentions(theirs, code)).toBe(false);
  });

  it('shows a spectator marks only, and lets them talk', async () => {
    const { roomId, alice } = await playToFirstCode(harness);
    const [miss] = missesFor(codeOf(harness, roomId), 1);
    await guess(alice, roomId, miss!);

    const carol = await harness.connect();
    const watching = waitForCodeBreakerState(carol, (s) => s.round === 1);
    await joinRoom(carol, roomId, 'Carol');
    const view = await watching;

    expect(view.spectators[carol.playerId]).toBeDefined();
    expect(boardOf(view, alice.playerId).rows[0]!.guess).toBeNull();
    expect(mentions(view, miss!)).toBe(false);
    expect(mentions(view, codeOf(harness, roomId))).toBe(false);

    // A guess from them is nobody's.
    expect((await guess(carol, roomId, miss!)).error?.message).toBe(
      'You are not in this room.',
    );

    const heard = waitForChat(alice, (m) => m.kind === 'player');
    carol.emit('chat:send', roomId, 'go Alice');
    expect(textOf(await heard)).toBe('go Alice');
  });

  it('turns back a repeated digit, a repeat, and a short row', async () => {
    const { roomId, alice } = await playToFirstCode(harness);
    const [miss] = missesFor(codeOf(harness, roomId), 1);

    const repeatedDigit = await guess(alice, roomId, '1123');
    expect(repeatedDigit.error).toMatchObject({
      type: 'invalidRequest',
      message: expect.stringContaining('repeatedDigit'),
    });

    await guess(alice, roomId, miss!);
    const repeat = await guess(alice, roomId, miss!);
    expect(repeat.error?.message).toContain('alreadyGuessed');

    expect((await guess(alice, roomId, '012')).error?.type).toBe(
      'invalidRequest',
    );
    expect((await guess(alice, roomId, '01a3')).error?.type).toBe(
      'invalidRequest',
    );
    const game = codeBreakerRoom(harness, roomId).game;
    expect(game.boards.get(alice.playerId)!.guesses).toEqual([miss]);
  });

  it('scores the code cracked, and announces it', async () => {
    const { roomId, alice, bob } = await playToFirstCode(harness);
    const code = codeOf(harness, roomId);
    const [miss] = missesFor(code, 1);

    await guess(alice, roomId, miss!);
    const announced = waitForChat(bob, (m) => m.kind === 'score');
    const cracked = waitForCodeBreakerState(
      bob,
      (s) => boardOf(s, alice.playerId).status === 'cracked',
    );
    await guess(alice, roomId, code);

    const [state, message] = await Promise.all([cracked, announced]);
    const board = boardOf(state, alice.playerId);
    // Two guesses: 900, plus up to 50 for the time left.
    expect(board.points).toBeGreaterThan(900);
    expect(board.points).toBeLessThanOrEqual(950);
    expect(board.secondsLeft).toBeGreaterThan(0);
    expect(state.playerList[alice.playerId]!.points).toBe(board.points);
    expect(textOf(message)).toBe(`Alice cracked it in 2, +${board.points}.`);
    expect(mentions(state, code)).toBe(false);
  });

  it('takes no more guesses from a player who is done', async () => {
    const { roomId, alice } = await playToFirstCode(harness);
    const code = codeOf(harness, roomId);
    await guess(alice, roomId, code);

    const after = await guess(alice, roomId, missesFor(code, 1)[0]!);
    expect(after.error?.message).toBe('You are done with this code.');
  });

  it('keeps a player who has cracked the code out of the chat until it ends', async () => {
    const { roomId, alice, bob } = await playToFirstCode(harness);
    await guess(alice, roomId, codeOf(harness, roomId));

    const bobHears = collectChat(bob);
    alice.emit('chat:send', roomId, 'it starts with');
    await settle();
    expect(bobHears.filter((m) => m.kind === 'player')).toEqual([]);

    // Bob, still guessing, may talk.
    const heard = waitForChat(alice, (m) => m.kind === 'player');
    bob.emit('chat:send', roomId, 'hmm');
    expect(textOf(await heard)).toBe('hmm');
  });

  it('lets a player who is out of guesses talk, and says so on their board', async () => {
    const { roomId, alice, bob } = await playToFirstCode(harness);
    await missEveryGuess(bob, roomId, codeOf(harness, roomId));
    const out = await waitForCodeBreakerState(
      alice,
      (s) => boardOf(s, bob.playerId).status === 'out',
    );
    expect(boardOf(out, bob.playerId).rows).toHaveLength(MAX_GUESSES);

    const heard = waitForChat(alice, (m) => m.kind === 'player');
    bob.emit('chat:send', roomId, 'no idea');
    expect(textOf(await heard)).toBe('no idea');
  });

  it('ends early once everybody is done, and reveals every board', async () => {
    const { roomId, alice, bob } = await playToFirstCode(harness);
    const code = codeOf(harness, roomId);
    const reveal = waitForCodeBreakerState(
      alice,
      (s) => s.phase === 'reveal' && s.round === 1,
    );
    const said = waitForChat(alice, (m) =>
      textOf(m).startsWith('The code was'),
    );
    await guess(alice, roomId, code);
    await missEveryGuess(bob, roomId, code);

    const results = await reveal;
    expect(results.boards).toEqual([]);
    expect(results.lastRound!.code).toBe(code);
    // Best first, with everybody's digits now.
    expect(results.lastRound!.boards.map((b) => b.username)).toEqual([
      'Alice',
      'Bob',
    ]);
    expect(results.lastRound!.boards[1]).toMatchObject({
      status: 'out',
      points: 0,
    });
    expect(results.lastRound!.boards[1]!.rows[0]!.guess).toBe(
      missesFor(code)[0],
    );
    expect(textOf(await said)).toBe(`The code was ${code}.`);

    const next = await waitForCodeBreakerState(
      alice,
      (s) => s.phase === 'guessing' && s.round === 2,
    );
    expect(next.boards.every((board) => board.rows.length === 0)).toBe(true);
    expect(mentions(next, codeOf(harness, roomId))).toBe(false);
  });

  it('ends on time for those still guessing, at no cost', async () => {
    const { roomId, alice } = await playToFirstCode(harness);
    await guess(alice, roomId, codeOf(harness, roomId));

    const results = await waitForCodeBreakerState(
      alice,
      (s) => s.phase === 'reveal',
      5000,
    );
    expect(results.lastRound!.boards[1]).toMatchObject({
      username: 'Bob',
      status: 'guessing',
      points: 0,
      rows: [],
    });
  });
});

describe('leaving and coming back', () => {
  let harness: TestServer;

  // A grace long enough that a dropped player is still holding their seat
  // when they come back, however slow the machine.
  beforeEach(async () => {
    harness = await startTestServer(undefined, 5);
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('keeps the guesses through a refresh', async () => {
    const { roomId, alice } = await playToFirstCode(harness);
    const [miss] = missesFor(codeOf(harness, roomId), 1);
    await guess(alice, roomId, miss!);

    const again = await harness.reload(alice);
    const state = waitForCodeBreakerState(again);
    await request(again, 'room:sync', roomId);
    expect(boardOf(await state, alice.playerId).rows[0]!.guess).toBe(miss);
  });

  it('does not wait for a dropped player, who comes back to their seat', async () => {
    const { roomId, alice, bob } = await playToFirstCode(harness);
    const code = codeOf(harness, roomId);
    const [miss] = missesFor(code, 1);
    await guess(bob, roomId, miss!);

    const dropped = waitForCodeBreakerState(
      alice,
      (s) => s.playerList[bob.playerId]?.isConnected === false,
    );
    bob.disconnect();
    await dropped;

    // Alice is the only one still connected, so cracking it ends the round.
    const reveal = waitForCodeBreakerState(alice, (s) => s.phase === 'reveal');
    await guess(alice, roomId, code);
    const results = await reveal;
    const bobsBoard = results.lastRound!.boards.find(
      (board) => board.playerId === bob.playerId,
    );
    expect(bobsBoard!.rows).toEqual([
      { guess: miss, mark: markGuess(miss!, code) },
    ]);

    const again = await harness.reload(bob);
    const back = waitForCodeBreakerState(
      again,
      (s) => s.playerList[bob.playerId]?.isConnected === true,
    );
    await request(again, 'room:sync', roomId);
    const view = await back;
    expect(view.isGameStarted).toBe(true);
    expect(view.lastRound!.code).toBe(code);
  });

  it('ends early when too few players are left', async () => {
    const { roomId, alice, bob } = await playToFirstCode(harness);
    await guess(alice, roomId, codeOf(harness, roomId));
    const endChat = collectChat(alice);
    const over = waitForCodeBreakerState(alice, (s) => s.lastGame !== null);
    bob.emit('room:leave', roomId);

    // A round still open when the game stopped was never finished.
    expect((await over).lastGame).toMatchObject({
      endedEarly: true,
      rounds: 0,
      cracked: { [alice.playerId]: 1 },
    });
    // One notice says it ended early; no result for a game nobody finished.
    await settle();
    expect(endNotices(endChat)).toEqual(['game:interrupted']);
  });
});

describe('leaving mid-game', () => {
  let harness: TestServer;

  // A reveal long enough to leave inside it.
  beforeEach(async () => {
    harness = await startTestServer(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { codeBreakerDurations: { round: 3, reveal: 1.5 } },
    );
  });

  afterEach(async () => {
    await harness.teardown();
  });

  const playThreeToFirstCode = async () => {
    const { carol, ...rest } = await playToFirstCode(harness, 3, {
      carol: true,
    });
    return { ...rest, carol: carol! };
  };

  it('ends the round early when the one still guessing leaves', async () => {
    const { roomId, alice, bob, carol } = await playThreeToFirstCode();
    const code = codeOf(harness, roomId);
    await guess(alice, roomId, code);
    await missEveryGuess(bob, roomId, code);
    expect(codeBreakerRoom(harness, roomId).game.phase).toBe('guessing');

    const reveal = waitForCodeBreakerState(alice, (s) => s.phase === 'reveal');
    carol.emit('room:leave', roomId);
    const results = await reveal;

    // Two are still seated, so the game goes on without Carol's board.
    expect(results.isGameStarted).toBe(true);
    expect(results.lastRound!.code).toBe(code);
    expect(results.lastRound!.boards.map((b) => b.username)).toEqual([
      'Alice',
      'Bob',
    ]);
    const next = await waitForCodeBreakerState(
      alice,
      (s) => s.phase === 'guessing' && s.round === 2,
      5000,
    );
    expect(Object.keys(next.playerList)).not.toContain(carol.playerId);
  });

  it('keeps a cracker who leaves and comes back to watch out of the chat', async () => {
    const { roomId, alice, bob } = await playThreeToFirstCode();
    await guess(alice, roomId, codeOf(harness, roomId));
    alice.emit('room:leave', roomId);
    const watching = waitForCodeBreakerState(
      alice,
      (s) => alice.playerId in s.spectators,
    );
    await joinRoom(alice, roomId, 'Alice');
    await watching;

    const bobHears = collectChat(bob);
    alice.emit('chat:send', roomId, 'it starts with');
    await settle();
    expect(bobHears.filter((m) => m.kind === 'player')).toEqual([]);

    // Once the code is out, they may talk again.
    await missEveryGuess(bob, roomId, codeOf(harness, roomId));
    await waitForCodeBreakerState(alice, (s) => s.phase === 'reveal');
    const heard = waitForChat(bob, (m) => m.kind === 'player');
    alice.emit('chat:send', roomId, 'nice');
    expect(textOf(await heard)).toBe('nice');
  });

  it('goes on to the next code when one of three leaves during the reveal', async () => {
    const { roomId, alice, bob, carol } = await playThreeToFirstCode();
    const code = codeOf(harness, roomId);
    const reveal = waitForCodeBreakerState(alice, (s) => s.phase === 'reveal');
    await guess(alice, roomId, code);
    await guess(bob, roomId, code);
    await guess(carol, roomId, code);
    await reveal;

    const gone = waitForCodeBreakerState(
      alice,
      (s) => !(carol.playerId in s.playerList),
    );
    carol.emit('room:leave', roomId);
    const left = await gone;
    expect(left.phase).toBe('reveal');
    expect(left.lastGame).toBeNull();

    const next = await waitForCodeBreakerState(
      alice,
      (s) => s.phase === 'guessing' && s.round === 2,
      5000,
    );
    expect(next.boards.map((b) => b.username).toSorted()).toEqual([
      'Alice',
      'Bob',
    ]);
    // Carol's crack left with her: only those still seated have codes.
    const over = waitForCodeBreakerState(alice, (s) => s.lastGame !== null);
    bob.emit('room:leave', roomId);
    expect((await over).lastGame!.cracked).toEqual({ [alice.playerId]: 1 });
  });

  it('ends the game, with the code just revealed counted, when one of two leaves during the reveal', async () => {
    const { roomId, alice, bob } = await playToFirstCode(harness);
    const code = codeOf(harness, roomId);
    const reveal = waitForCodeBreakerState(alice, (s) => s.phase === 'reveal');
    await guess(alice, roomId, code);
    await guess(bob, roomId, code);
    await reveal;

    const over = waitForCodeBreakerState(alice, (s) => s.lastGame !== null);
    bob.emit('room:leave', roomId);
    const ended = await over;
    expect(ended.lastGame).toMatchObject({
      endedEarly: true,
      rounds: 1,
      cracked: { [alice.playerId]: 1 },
    });
    expect(ended.lastRound!.code).toBe(code);
  });
});

describe('a Code Breaker game', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('ends after its last code, with the codes each player cracked', async () => {
    const { roomId, alice, bob } = await playToFirstCode(harness);
    for (let round = 1; round <= 3; round++) {
      const code = codeOf(harness, roomId);
      await guess(alice, roomId, code);
      if (round === 2) {
        await missEveryGuess(bob, roomId, code);
      } else {
        await guess(bob, roomId, code);
      }
      if (round < 3) {
        await waitForCodeBreakerState(
          alice,
          (s) => s.phase === 'guessing' && s.round === round + 1,
        );
      }
    }

    const over = await waitForCodeBreakerState(
      alice,
      (s) => s.lastGame !== null,
    );
    expect(over).toMatchObject({
      phase: 'waiting',
      isGameStarted: false,
      round: 0,
      boards: [],
    });
    expect(over.lastGame).toMatchObject({
      endedEarly: false,
      rounds: 3,
      cracked: { [alice.playerId]: 3, [bob.playerId]: 2 },
    });
    expect(over.lastGame!.standings[0]!.username).toBe('Alice');
    // The last round stays up with the summary.
    expect(over.lastRound!.boards).toHaveLength(2);
  });

  it('never deals the same code twice in a game', async () => {
    const { roomId } = await playToFirstCode(harness);
    const { codes } = codeBreakerRoom(harness, roomId).game;
    expect(new Set(codes).size).toBe(3);
  });

  it('deals the same codes every game when given a seed', async () => {
    await harness.teardown();
    harness = await startTestServer(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { codeBreakerSeed: 'figma' },
    );
    const seeded = roomCodes(seededRandom(seedNumber('figma')), 3, new Date());
    for (let game = 0; game < 2; game++) {
      const { roomId } = await playToFirstCode(harness);
      expect(codeBreakerRoom(harness, roomId).game.codes).toEqual(seeded);
    }
  });
});
