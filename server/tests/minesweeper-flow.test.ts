import { textOf } from './helpers/test-server.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MinesweeperRoomState } from '../models/types.js';
import {
  FAST_PHASES,
  collect,
  collectStates,
  createMinesweeperRoom,
  createRoom,
  joinRoom,
  lobbyView,
  minesweeperRoom,
  playToFirstRound,
  request,
  settle,
  startTestServer,
  syncRoom,
  waitFor,
  waitForChat,
  waitForMineState,
  type TestServer,
  collectChat,
  endNotices,
} from './helpers/test-server.js';
import { gameOverNotice } from '../libs/utils.js';
import { hiddenIndexes } from '../socket/minesweeper/board.js';
import { pointsForPick } from '../socket/minesweeper/scoring.js';

/** The snapshot that shows round `round` resolved. */
const revealOf = (round: number) => (state: MinesweeperRoomState) =>
  state.phase === 'reveal' && state.round === round;

describe('a Minesweeper room', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('appears in its own lobby, not Draw & Guess’s', async () => {
    const client = await harness.connect();
    const other = await harness.connect();
    const minefield = await createMinesweeperRoom(client, {
      roomName: 'Minefield',
      difficulty: 'Medium',
    });
    await createRoom(other, { roomName: 'Doodles' });

    const drawList = waitFor(client, 'lobby:rooms');
    client.emit('lobby:subscribe', 'draw-and-guess');
    const [, drawRooms] = await drawList;
    expect(drawRooms.map((room) => room.roomId)).not.toContain(minefield);

    const view = await lobbyView(client, minefield, 'minesweeper');
    expect(view).toMatchObject({
      gameType: 'minesweeper',
      difficulty: 'Medium',
      roomName: 'Minefield',
    });
  });

  it('refuses a difficulty that is not one of the three', async () => {
    const client = await harness.connect();

    const answer = await request(client, 'room:create', {
      gameType: 'minesweeper',
      roomName: 'Impossible',
      username: 'Ada',
      maxPlayers: 4,
      password: '',
      settings: { difficulty: 'Nightmare' },
    });

    expect(answer.error?.type).toBe('invalidRequest');
    expect(harness.server.rooms.size).toBe(0);
  });

  it('waits in its own phase before the first game', async () => {
    const client = await harness.connect();
    const first = waitForMineState(client);
    await createMinesweeperRoom(client);

    expect(await first).toMatchObject({
      phase: 'waiting',
      round: 0,
      lockedIn: [],
      myPick: null,
      lastRound: [],
      lastGame: null,
    });
  });

  it('deals a board nobody can see through', async () => {
    const { first, roomId } = await playToFirstRound(harness);
    const room = minesweeperRoom(harness, roomId);

    expect(first.round).toBe(1);
    expect(first.phase).toBe('picking');
    expect(first.phaseEndsInMs).toBeGreaterThan(0);
    expect(first.board).toHaveLength(9 * 9);
    // Every cell hidden, whatever is underneath.
    expect(first.board.every((cell) => cell === -1)).toBe(true);
    // ...and the layout really does exist on the server.
    expect(room.game.board.mines.filter(Boolean)).toHaveLength(10);
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

  /** The first hidden cell the server knows is safe. */
  const aSafeCell = (roomId: string, skip = 0): number => {
    const room = minesweeperRoom(harness, roomId);
    const safe = hiddenIndexes(room.game.board).filter(
      (index) => !room.game.board.mines[index],
    );
    return safe[skip]!;
  };

  const aMine = (roomId: string): number => {
    const room = minesweeperRoom(harness, roomId);
    return hiddenIndexes(room.game.board).find(
      (index) => room.game.board.mines[index],
    )!;
  };

  it('tells the room who has locked in, and only the picker what they picked', async () => {
    const { roomId, alice, bob } = await playToFirstRound(harness);
    const cell = aSafeCell(roomId);

    const bobSees = waitForMineState(bob, (s) => s.lockedIn.length === 1);
    const aliceSees = waitForMineState(alice, (s) => s.lockedIn.length === 1);
    alice.emit('ms:pick', roomId, cell);
    const [theirs, mine] = await Promise.all([bobSees, aliceSees]);

    expect(theirs.lockedIn).toEqual([alice.playerId]);
    expect(mine.lockedIn).toEqual([alice.playerId]);
    expect(mine.myPick).toBe(cell);
    // The cell itself is the one thing that must not travel to anybody else:
    // publishing it would let everyone else read a pick off the board, and let
    // a late chooser follow the crowd, which is what simultaneous picking
    // prevents.
    expect(theirs.myPick).toBeNull();
    expect(theirs.board.every((value) => value === -1)).toBe(true);
  });

  it('never puts the mine layout in anything it sends', async () => {
    const { roomId, alice, bob } = await playToFirstRound(harness);
    const room = minesweeperRoom(harness, roomId);
    const states = collectStates<MinesweeperRoomState>(alice);

    const resolved = waitForMineState(alice, revealOf(1));
    alice.emit('ms:pick', roomId, aSafeCell(roomId));
    bob.emit('ms:pick', roomId, aSafeCell(roomId, 1));
    await resolved;
    await settle(100);

    // A board a client sees may hold -1, 0-8 and 9, and nothing else: there
    // is no encoding of "safe but unopened" for the layout to leak through.
    const boards = states.flatMap((state) => state.board);
    expect(boards.length).toBeGreaterThan(0);
    for (const cell of boards) expect(cell).toBeGreaterThanOrEqual(-1);
    for (const cell of boards) expect(cell).toBeLessThanOrEqual(9);
    expect(room.game.board.mines.filter(Boolean)).toHaveLength(10);
  });

  it('resolves as soon as everybody has picked, without waiting out the clock', async () => {
    const { roomId, alice, bob } = await playToFirstRound(harness);

    const resolved = waitForMineState(alice, revealOf(1));
    const startedAt = Date.now();
    alice.emit('ms:pick', roomId, aSafeCell(roomId));
    bob.emit('ms:pick', roomId, aSafeCell(roomId, 1));

    const outcome = await resolved;
    // The window is 600ms; both picks were in well inside it.
    expect(Date.now() - startedAt).toBeLessThan(500);
    expect(outcome.lastRound).toHaveLength(2);
    expect(outcome.lockedIn).toEqual([]);
    expect(outcome.myPick).toBeNull();
    expect(outcome.phaseEndsInMs).toBeGreaterThan(0);
  });

  it('pays a safe pick what its risk was worth, and uncovers it', async () => {
    const { roomId, alice, bob } = await playToFirstRound(harness);
    const cell = aSafeCell(roomId);

    const resolved = waitForMineState(alice, revealOf(1));
    alice.emit('ms:pick', roomId, cell);
    bob.emit('ms:pick', roomId, aSafeCell(roomId, 1));
    const outcome = await resolved;

    const mine = outcome.lastRound.find(
      (result) => result.playerId === alice.playerId,
    )!;
    expect(mine.hitMine).toBe(false);
    expect(mine.index).toBe(cell);
    expect(mine.points).toBe(
      pointsForPick({
        risk: mine.risk,
        hitMine: false,
        sharedWith: 1,
        autoPlayed: false,
      }),
    );
    // The opening board is uniform, so the first pick is worth the density.
    expect(mine.risk).toBeCloseTo(10 / 81, 6);
    expect(outcome.board[cell]).not.toBe(-1);
    expect(outcome.playerList[alice.playerId]?.points).toBe(mine.points);
  });

  it('costs a mine its points, makes it common knowledge, and says so', async () => {
    const { roomId, alice, bob } = await playToFirstRound(harness);
    const cell = aMine(roomId);

    const resolved = waitForMineState(alice, revealOf(1));
    const announced = waitForChat(bob, (m) => textOf(m).includes('hit a mine'));
    alice.emit('ms:pick', roomId, cell);
    bob.emit('ms:pick', roomId, aSafeCell(roomId));
    const outcome = await resolved;

    const hit = outcome.lastRound.find(
      (result) => result.playerId === alice.playerId,
    )!;
    expect(hit.hitMine).toBe(true);
    expect(hit.points).toBeLessThan(0);
    // A hit mine is not hidden any more: everyone can see it, and the solver
    // counts it against the numbers around it from here on.
    expect(outcome.board[cell]).toBe(9);
    expect(outcome.minesFound).toBe(1);

    expect(await announced).toMatchObject({
      kind: 'alert',
      notice: {
        type: 'ms:mine',
        name: 'Alice',
        risk: hit.risk,
        points: hit.points,
      },
    });
  });

  /*
   * The asymmetry that keeps a crowd from hiding behind each other: the reward
   * for claiming a cell is shared, the penalty for the decision is not.
   */
  it('splits the reward when two players pick the same cell', async () => {
    const { roomId, alice, bob } = await playToFirstRound(harness);
    const cell = aSafeCell(roomId);

    const resolved = waitForMineState(alice, revealOf(1));
    alice.emit('ms:pick', roomId, cell);
    bob.emit('ms:pick', roomId, cell);
    const outcome = await resolved;

    expect(outcome.lastRound).toHaveLength(2);
    for (const result of outcome.lastRound) {
      expect(result.sharedWith).toBe(2);
      expect(result.points).toBe(
        pointsForPick({
          risk: result.risk,
          hitMine: false,
          sharedWith: 2,
          autoPlayed: false,
        }),
      );
    }
  });

  it('makes each of them pay in full when the shared cell is a mine', async () => {
    const { roomId, alice, bob } = await playToFirstRound(harness);
    const cell = aMine(roomId);

    const resolved = waitForMineState(alice, revealOf(1));
    alice.emit('ms:pick', roomId, cell);
    bob.emit('ms:pick', roomId, cell);
    const outcome = await resolved;

    const [first, second] = outcome.lastRound;
    expect(first!.points).toBe(second!.points);
    expect(first!.points).toBe(
      pointsForPick({
        risk: first!.risk,
        hitMine: true,
        sharedWith: 2,
        autoPlayed: false,
      }),
    );
  });

  it('takes one pick per player and ignores the rest', async () => {
    const { roomId, alice, bob } = await playToFirstRound(harness);
    const first = aSafeCell(roomId);
    const second = aSafeCell(roomId, 1);

    const resolved = waitForMineState(alice, revealOf(1));
    alice.emit('ms:pick', roomId, first);
    alice.emit('ms:pick', roomId, second); // ignored: already committed
    bob.emit('ms:pick', roomId, aSafeCell(roomId, 2));
    const outcome = await resolved;

    const mine = outcome.lastRound.filter(
      (result) => result.playerId === alice.playerId,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]!.index).toBe(first);
  });

  it('ignores a pick on a cell that is already resolved', async () => {
    const { roomId, alice, bob } = await playToFirstRound(harness);
    const cell = aSafeCell(roomId);

    const secondRound = waitForMineState(
      alice,
      (s) => s.phase === 'picking' && s.round === 2,
    );
    alice.emit('ms:pick', roomId, cell);
    bob.emit('ms:pick', roomId, aSafeCell(roomId, 1));
    await secondRound;

    const states = collectStates<MinesweeperRoomState>(alice);
    alice.emit('ms:pick', roomId, cell); // already uncovered
    await settle();

    expect(states.filter((s) => s.lockedIn.length > 0)).toEqual([]);
  });

  /*
   * Letting the clock run out plays the safest cell going, never nothing,
   * because a round that resolved no cells would not terminate.
   */
  it('picks the safest cell for a player who runs out of time', async () => {
    const { roomId, alice, bob } = await playToFirstRound(harness);

    const resolved = waitForMineState(alice, revealOf(1), 5000);
    alice.emit('ms:pick', roomId, aSafeCell(roomId));
    // Bob never picks.
    const outcome = await resolved;

    const bobsPick = outcome.lastRound.find(
      (result) => result.playerId === bob.playerId,
    )!;
    expect(bobsPick.autoPlayed).toBe(true);
    // Forfeits the base, so being present is worth something.
    expect(bobsPick.points).toBe(
      pointsForPick({
        risk: bobsPick.risk,
        hitMine: bobsPick.hitMine,
        sharedWith: bobsPick.sharedWith,
        autoPlayed: true,
      }),
    );
  });

  it('scores every pick against the board as it was before the round', async () => {
    const { roomId, alice, bob } = await playToFirstRound(harness);

    const resolved = waitForMineState(alice, revealOf(1));
    alice.emit('ms:pick', roomId, aSafeCell(roomId));
    bob.emit('ms:pick', roomId, aSafeCell(roomId, 1));
    const outcome = await resolved;

    // Both chose from the same untouched board, so both were quoted the same
    // risk, even though one of them may have been uncovered by the other's
    // cascade before the scoring finished.
    const [first, second] = outcome.lastRound;
    expect(first!.risk).toBeCloseTo(second!.risk, 9);
  });
});

/*
 * A player who refreshed mid-round used to be asked for a pick they had
 * already made, or to lose the reveal: the snapshot had no phase, and their
 * own pick lived only in the page they had just thrown away.
 */
describe('refreshing during a round', () => {
  let harness: TestServer;

  beforeEach(async () => {
    // A long pick window, so the round is still open after the reload.
    harness = await startTestServer(FAST_PHASES, 5, { round: 5, reveal: 3 });
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('gives a refreshed player their own pick back, and nobody else', async () => {
    const { roomId, alice, bob } = await playToFirstRound(harness);
    const room = minesweeperRoom(harness, roomId);
    const cell = hiddenIndexes(room.game.board)[0]!;

    const locked = waitForMineState(bob, (s) => s.lockedIn.length === 1);
    alice.emit('ms:pick', roomId, cell);
    await locked;

    const returned = await harness.reload(alice);
    const { state } = await syncRoom(returned, roomId);
    const view = state as MinesweeperRoomState;

    expect(view.phase).toBe('picking');
    expect(view.round).toBe(1);
    expect(view.myPick).toBe(cell);
    expect(view.lockedIn).toEqual([alice.playerId]);
    expect(view.phaseEndsInMs).toBeGreaterThan(0);

    // Bob, who has not picked, still sees only that Alice has chosen. (He is
    // not reloaded too: a round stops waiting for a player who drops, so his
    // reload would resolve it.)
    const bobView = bob.state as MinesweeperRoomState;
    expect(bobView.phase).toBe('picking');
    expect(bobView.myPick).toBeNull();
    expect(bobView.lockedIn).toEqual([alice.playerId]);
  });

  it('gives a player who refreshed before picking an open round to pick in', async () => {
    const { roomId, alice } = await playToFirstRound(harness);

    const returned = await harness.reload(alice);
    const { state } = await syncRoom(returned, roomId);

    expect(state).toMatchObject({ phase: 'picking', round: 1, myPick: null });
  });

  it('shows a player who refreshed during the reveal what the round came to', async () => {
    const { roomId, alice, bob } = await playToFirstRound(harness);
    const room = minesweeperRoom(harness, roomId);
    const [first, second] = hiddenIndexes(room.game.board);

    const revealed = waitForMineState(alice, revealOf(1));
    alice.emit('ms:pick', roomId, first!);
    bob.emit('ms:pick', roomId, second!);
    const atReveal = await revealed;

    const returned = await harness.reload(alice);
    const { state } = await syncRoom(returned, roomId);
    const view = state as MinesweeperRoomState;

    expect(view.phase).toBe('reveal');
    expect(view.round).toBe(1);
    expect(view.myPick).toBeNull();
    expect(view.lastRound).toEqual(atReveal.lastRound);
    expect(view.board).toEqual(atReveal.board);
    expect(view.phaseEndsInMs).toBeGreaterThan(0);
  });
});

describe('a Minesweeper game', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('needs two players, and only the owner may start it', async () => {
    const alice = await harness.connect();
    const roomId = await createMinesweeperRoom(alice, { username: 'Alice' });

    const tooFew = await request(alice, 'game:start', roomId);
    expect(tooFew.error?.type).toBe('notEnoughPlayers');

    const bob = await harness.connect();
    await joinRoom(bob, roomId, 'Bob');

    const notOwner = await request(bob, 'game:start', roomId);
    expect(notOwner.error?.type).toBe('notRoomOwner');
  });

  /*
   * Termination is a property of the board rather than a rule: every round
   * resolves at least one cell, so a game of a finite board always ends.
   */
  it('runs to the end of the board and declares a winner', async () => {
    const { roomId, alice, bob } = await playToFirstRound(harness);
    const ended = waitForMineState(alice, (s) => s.lastGame !== null, 20_000);
    const announced = waitForChat(
      alice,
      (m) => textOf(m).startsWith('Game over'),
      20_000,
    );

    // Play it out by having both clients pick whatever is left.
    const playOn = () => {
      const room = minesweeperRoom(harness, roomId);
      if (!room?.isGameStarted) return;
      const left = hiddenIndexes(room.game.board);
      if (left.length === 0) return;
      alice.emit('ms:pick', roomId, left[0]!);
      bob.emit('ms:pick', roomId, left[left.length - 1]!);
    };

    // A round opens with nobody locked in; that snapshot is the cue to pick.
    alice.on('room:state', (state) => {
      const view = state as MinesweeperRoomState;
      if (view.phase === 'picking' && view.lockedIn.length === 0) playOn();
    });
    playOn();

    const final = await ended;
    const message = await announced;

    expect(final).toMatchObject({
      isGameStarted: false,
      status: 'Open',
      phase: 'waiting',
      round: 0,
      phaseEndsInMs: 0,
    });
    // The final board and the last round stay up for the results screen.
    expect(final.board.includes(-1)).toBe(false);
    expect(final.lastRound.length).toBeGreaterThan(0);

    const summary = final.lastGame!;
    expect(summary.endedEarly).toBe(false);
    expect(summary.difficulty).toBe('Small');
    expect(summary.rounds).toBeGreaterThan(0);
    expect(summary.standings.map((s) => s.playerId).toSorted()).toEqual(
      [alice.playerId, bob.playerId].toSorted(),
    );
    expect(summary.standings[0]!.points).toBeGreaterThanOrEqual(
      summary.standings[1]!.points,
    );
    for (const standing of summary.standings) {
      expect(standing.points).toBe(final.playerList[standing.playerId]!.points);
    }

    expect(message).toMatchObject({
      kind: 'system',
      notice: gameOverNotice(summary.standings),
    });
    expect(hiddenIndexes(minesweeperRoom(harness, roomId).game.board)).toEqual(
      [],
    );
  }, 25_000);

  it('ends when the room drops below two players, and says it ended early', async () => {
    const { roomId, alice, bob } = await playToFirstRound(harness);

    const endChat = collectChat(alice);
    const ended = waitForMineState(alice, (s) => s.lastGame !== null);
    bob.emit('room:leave', roomId);

    const final = await ended;
    // One notice says it ended early; no result for a game nobody finished.
    await settle();
    expect(endNotices(endChat)).toEqual(['game:interrupted']);
    expect(final.isGameStarted).toBe(false);
    expect(final.phase).toBe('waiting');
    expect(final.lastGame).toMatchObject({
      endedEarly: true,
      difficulty: 'Small',
      // The round still open for picks was never played.
      rounds: 0,
      standings: [{ playerId: alice.playerId, username: 'Alice', points: 0 }],
    });
  });

  it('clears the last game when the next one starts', async () => {
    const { roomId, alice, bob } = await playToFirstRound(harness);

    const ended = waitForMineState(alice, (s) => s.lastGame !== null);
    bob.emit('room:leave', roomId);
    await ended;

    const carol = await harness.connect();
    await joinRoom(carol, roomId, 'Carol');
    const restarted = waitForMineState(alice, (s) => s.phase === 'picking');
    expect((await request(alice, 'game:start', roomId)).ok).toBe(true);

    const fresh = await restarted;
    expect(fresh.lastGame).toBeNull();
    expect(fresh.lastRound).toEqual([]);
    expect(fresh.round).toBe(1);
  });
});

/*
 * A room id is public (it goes out in every lobby broadcast), so a handler that
 * trusted the id it was handed would be reading another game's state through
 * its own type. `ofType` is what stops that, and this is the test for it.
 */
describe('one game cannot reach into another', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('ignores a Minesweeper pick aimed at a Draw & Guess room', async () => {
    const alice = await harness.connect();
    const bob = await harness.connect();
    const roomId = await createRoom(alice, { username: 'Alice' });
    await joinRoom(bob, roomId, 'Bob');
    await settle();

    const states = collect(alice, 'room:state');
    alice.emit('ms:pick', roomId, 0);
    await settle();

    expect(states).toEqual([]);
    expect(alice.connected).toBe(true);
  });

  it('ignores a Draw & Guess word aimed at a Minesweeper room', async () => {
    const { roomId, alice } = await playToFirstRound(harness);

    const states = collect(alice, 'room:state');
    alice.emit('dg:select-word', roomId, 'Banana');
    await settle();

    expect(states).toEqual([]);
    expect(minesweeperRoom(harness, roomId).isGameStarted).toBe(true);
  });
});
