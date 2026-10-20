import { textOf } from './helpers/test-server.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Make24RoomState, Make24Step } from '../models/types.js';
import {
  collectChat,
  createMake24Room,
  joinRoom,
  lobbyView,
  make24Room,
  playToFirstHand,
  request,
  settle,
  startTestServer,
  waitForChat,
  waitForMake24State,
  type ClientSocket,
  type TestServer,
} from './helpers/test-server.js';
import {
  combine,
  dealtCards,
  isTarget,
  OPERATORS,
  type Card,
} from '../../shared/make-24.js';
import { pointsForSolve } from '../socket/make-24/index.js';

/** Steps that make 24 from `cards`, found the long way. */
function stepsToSolve(cards: readonly Card[]): Make24Step[] | null {
  if (cards.length === 1) return isTarget(cards[0].value) ? [] : null;
  for (let left = 0; left < cards.length; left++) {
    for (let right = 0; right < cards.length; right++) {
      for (const op of OPERATORS) {
        const step = { left, op, right };
        const next = left === right ? null : combine(cards, step);
        const rest = next && stepsToSolve(next);
        if (rest) return [step, ...rest];
      }
    }
  }
  return null;
}

const solutionFor = (deal: readonly number[]) =>
  stepsToSolve(dealtCards(deal))!;

/** Three steps that use every card once and do not make 24. */
function wrongStepsFor(deal: readonly number[]): Make24Step[] {
  for (const op of OPERATORS) {
    for (const last of OPERATORS) {
      const steps: Make24Step[] = [
        { left: 0, op, right: 1 },
        { left: 0, op, right: 1 },
        { left: 0, op: last, right: 1 },
      ];
      let cards: Card[] | null = dealtCards(deal);
      for (const step of steps) cards = cards && combine(cards, step);
      if (cards && !isTarget(cards[0].value)) return steps;
    }
  }
  throw new Error(`Every way makes 24 from ${deal.join(' ')}`);
}

const solveHand = (
  client: ClientSocket,
  roomId: string,
  state: Make24RoomState,
) => client.emit('t24:solve', roomId, solutionFor(state.deal));

describe('scoring a solve', () => {
  it('is 50 for getting there, plus up to 100 for the time left', () => {
    expect(pointsForSolve(60_000, 60_000)).toBe(150);
    expect(pointsForSolve(45_000, 60_000)).toBe(125);
    expect(pointsForSolve(0, 60_000)).toBe(50);
    expect(pointsForSolve(-5, 60_000)).toBe(50);
  });
});

describe('a Make 24 room', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('lists its hands in its own lobby', async () => {
    const client = await harness.connect();
    const roomId = await createMake24Room(client, { hands: 10 });

    expect(await lobbyView(client, roomId, 'make-24')).toMatchObject({
      gameType: 'make-24',
      hands: 10,
    });
  });

  it('refuses a game of any other length than 5 or 10 hands', async () => {
    const client = await harness.connect();

    const answer = await request(client, 'room:create', {
      gameType: 'make-24',
      roomName: 'Marathon',
      username: 'Ada',
      maxPlayers: 4,
      password: '',
      settings: { hands: 7 },
    });

    expect(answer.error?.type).toBe('invalidRequest');
    expect(harness.server.rooms.size).toBe(0);
  });

  it('waits with no cards on the table before the first game', async () => {
    const client = await harness.connect();
    const first = waitForMake24State(client);
    await createMake24Room(client);

    expect(await first).toMatchObject({
      phase: 'waiting',
      hand: 0,
      deal: [],
      solved: [],
      mySolve: null,
      lastHand: [],
      lastDeal: [],
      lastSolution: '',
      lastGame: null,
    });
  });

  it('deals everybody the same solvable hand, smallest first', async () => {
    const { roomId, bob, first } = await playToFirstHand(harness);
    const bobView =
      (bob.state as Make24RoomState).hand === 1
        ? (bob.state as Make24RoomState)
        : await waitForMake24State(bob, (s) => s.hand === 1);

    expect(first.deal).toHaveLength(4);
    expect(first.deal).toEqual(first.deal.toSorted((a, b) => a - b));
    expect(solutionFor(first.deal)).toHaveLength(3);
    expect(bobView.deal).toEqual(first.deal);
    expect(first.phaseEndsInMs).toBeGreaterThan(0);
    expect(make24Room(harness, roomId).game.deals).toHaveLength(5);
  });
});

describe('a hand', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('counts only steps that make 24, and shows nobody else how', async () => {
    const { roomId, alice, bob, first } = await playToFirstHand(harness);

    alice.emit('t24:solve', roomId, wrongStepsFor(first.deal));
    await settle();
    expect((alice.state as Make24RoomState).solved).toEqual([]);

    const announced = waitForChat(bob, (m) => m.kind === 'success');
    const aliceSees = waitForMake24State(alice, (s) => s.mySolve !== null);
    const bobSees = waitForMake24State(bob, (s) => s.solved.length === 1);
    solveHand(alice, roomId, first);

    const [mine, theirs, message] = await Promise.all([
      aliceSees,
      bobSees,
      announced,
    ]);
    expect(mine.mySolve).toMatchObject({ playerId: alice.playerId });
    expect(mine.mySolve!.expression).not.toBe('');
    expect(mine.mySolve!.points).toBeGreaterThan(50);
    expect(mine.mySolve!.points).toBeLessThanOrEqual(150);
    expect(theirs.solved).toEqual([
      expect.objectContaining({
        playerId: alice.playerId,
        points: mine.mySolve!.points,
      }),
    ]);
    // Bob is told that Alice solved it, never her expression.
    expect(theirs.mySolve).toBeNull();
    expect(JSON.stringify(theirs)).not.toContain(mine.mySolve!.expression);
    expect(textOf(message)).toBe(`Alice solved it! (+${mine.mySolve!.points})`);
    expect(theirs.playerList[alice.playerId].points).toBe(mine.mySolve!.points);
  });

  it('takes one solve each', async () => {
    const { roomId, alice, first } = await playToFirstHand(harness);
    const solved = waitForMake24State(alice, (s) => s.mySolve !== null);
    solveHand(alice, roomId, first);
    const { mySolve } = await solved;

    solveHand(alice, roomId, first);
    await settle();
    const room = make24Room(harness, roomId);
    expect(room.playerList[alice.playerId].points).toBe(mySolve!.points);
  });

  it('keeps a player who has solved it out of the chat until it ends', async () => {
    const { roomId, alice, bob, first } = await playToFirstHand(harness);
    const solved = waitForMake24State(alice, (s) => s.mySolve !== null);
    solveHand(alice, roomId, first);
    await solved;

    const bobHears = collectChat(bob);
    alice.emit('chat:send', roomId, 'that was easy');
    await settle();
    expect(bobHears.filter((m) => m.kind === 'player')).toEqual([]);

    // Bob, still solving, may talk.
    const heard = waitForChat(alice, (m) => m.kind === 'player');
    bob.emit('chat:send', roomId, 'hmm');
    expect(textOf(await heard)).toBe('hmm');
  });

  it('keeps a spectator out of the chat while a hand is being solved', async () => {
    const { roomId, alice } = await playToFirstHand(harness);
    const carol = await harness.connect();
    await joinRoom(carol, roomId, 'Carol');

    const aliceHears = collectChat(alice);
    carol.emit('chat:send', roomId, 'try 6 times 4');
    await settle();
    expect(aliceHears.filter((m) => m.kind === 'player')).toEqual([]);
  });

  it('ends early once everybody has solved it, with a way to solve it', async () => {
    const { roomId, alice, bob, first } = await playToFirstHand(harness);
    const reveal = waitForMake24State(
      alice,
      (s) => s.phase === 'reveal' && s.hand === 1,
    );
    solveHand(alice, roomId, first);
    solveHand(bob, roomId, first);

    const results = await reveal;
    expect(results.lastHand).toHaveLength(2);
    expect(results.lastHand.every((result) => result.solved)).toBe(true);
    expect(results.lastHand.every((result) => result.expression)).toBe(true);
    expect(results.lastSolution).not.toBe('');
    expect(results.deal).toEqual(first.deal);

    const next = await waitForMake24State(
      alice,
      (s) => s.phase === 'solving' && s.hand === 2,
    );
    expect(next.solved).toEqual([]);
    expect(next.mySolve).toBeNull();
  });

  it('ends on time for those who did not get there, at no cost', async () => {
    const { roomId, alice, first } = await playToFirstHand(harness);
    const solved = waitForMake24State(alice, (s) => s.mySolve !== null);
    solveHand(alice, roomId, first);
    await solved;

    const results = await waitForMake24State(
      alice,
      (s) => s.phase === 'reveal',
      3000,
    );
    const bobs = results.lastHand.find((r) => r.username === 'Bob')!;
    expect(bobs).toMatchObject({ solved: false, points: 0, expression: '' });
    // Best first.
    expect(results.lastHand[0].username).toBe('Alice');
  });

  it('keeps a solve through a refresh', async () => {
    const { roomId, alice, first } = await playToFirstHand(harness);
    const solved = waitForMake24State(alice, (s) => s.mySolve !== null);
    solveHand(alice, roomId, first);
    const { mySolve } = await solved;

    const again = await harness.reload(alice);
    const state = waitForMake24State(again);
    await request(again, 'room:sync', roomId);
    expect((await state).mySolve).toEqual(mySolve);
  });
});

describe('a Make 24 game', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('ends after its last hand, and reopens the room', async () => {
    const { roomId, alice, bob, first } = await playToFirstHand(harness);
    let hand = first;
    for (let number = 1; number <= 5; number++) {
      solveHand(alice, roomId, hand);
      solveHand(bob, roomId, hand);
      if (number < 5) {
        hand = await waitForMake24State(
          alice,
          (s) => s.phase === 'solving' && s.hand === number + 1,
        );
      }
    }

    const over = await waitForMake24State(alice, (s) => s.lastGame !== null);
    expect(over).toMatchObject({
      phase: 'waiting',
      isGameStarted: false,
      hand: 0,
      deal: [],
    });
    expect(over.lastGame).toMatchObject({ endedEarly: false, hands: 5 });
    expect(over.lastGame!.standings).toHaveLength(2);
    // The last hand's results and cards stay up with the summary.
    expect(over.lastHand).toHaveLength(2);
    expect(over.lastDeal).toEqual(hand.deal);
  });

  it('ends early when too few players are left', async () => {
    const { roomId, alice, bob } = await playToFirstHand(harness);
    const over = waitForMake24State(alice, (s) => s.lastGame !== null);
    bob.emit('room:leave', roomId);

    expect((await over).lastGame).toMatchObject({ endedEarly: true, hands: 0 });
  });
});
