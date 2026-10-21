import { afterEach, describe, expect, it } from 'vitest';
import type { GomokuColor, GomokuRoomState } from '../models/types.js';
import { CENTRE, pointAt, pointName, POINTS } from '../../shared/gomoku.js';
import {
  collectChat,
  createGomokuRoom,
  gomokuRoom,
  joinRoom,
  lobbyView,
  request,
  seatTable,
  settle,
  startGame,
  startTestServer,
  syncRoom,
  textOf,
  waitForChat,
  waitForGomokuState,
  type TestClient,
  type TestServer,
} from './helpers/test-server.js';

/** The point a name such as H8 stands for. */
const named = (name: string): number =>
  pointAt('ABCDEFGHIJKLMNO'.indexOf(name[0]!), Number(name.slice(1)));

/** The draw for a new pair: below a half, the owner plays Black. */
let draw = 0;

const startServer = (options: { turn?: number; grace?: number } = {}) =>
  startTestServer(
    undefined,
    options.grace ?? 0.6,
    undefined,
    undefined,
    undefined,
    {
      gomokuRandom: () => draw,
      ...(options.turn ? { gomokuDurations: { turn: options.turn } } : {}),
    },
  );

/** Alice and Bob at a Gomoku board, Alice as its owner, before a game. */
const seatPair = async (harness: TestServer) => {
  const { roomId, players } = await seatTable(
    harness,
    ['Alice', 'Bob'],
    (creator, username) => createGomokuRoom(creator, { username }),
  );
  return { roomId, alice: players[0], bob: players[1] };
};

/** Starts a game and waits until every client has its first turn. */
const startAndWait = async (
  owner: TestClient,
  roomId: string,
  clients: readonly TestClient[],
) => {
  const views = clients.map((client) =>
    waitForGomokuState(
      client,
      (s) => s.phase === 'playing' && s.moves.length === 0,
    ),
  );
  await startGame(owner, roomId);
  return Promise.all(views);
};

/** Alice (Black) and Bob (White) at a game that has just started. */
const playToFirstMove = async (harness: TestServer) => {
  draw = 0;
  const seated = await seatPair(harness);
  await startAndWait(seated.alice, seated.roomId, [seated.alice, seated.bob]);
  return seated;
};

/**
 * Places a stone and waits until `watcher` sees it on the board; the server
 * judges it, so a stone it ignores fails the wait.
 */
const place = async (
  player: TestClient,
  roomId: string,
  point: string,
  watcher: TestClient = player,
) => {
  // A point takes one stone a game, so the stone on it is this one.
  const seen = waitForGomokuState(watcher, (s) =>
    s.moves.some((move) => move.point === named(point)),
  );
  player.emit('gomoku:place', roomId, named(point));
  return seen;
};

/** Plays the stones in turn, Black first, waiting for each to land. */
const play = async (
  roomId: string,
  black: TestClient,
  white: TestClient,
  points: readonly string[],
) => {
  let last: GomokuRoomState | undefined;
  for (const [index, point] of points.entries()) {
    const player = index % 2 === 0 ? black : white;
    last = await place(player, roomId, point, black);
  }
  return last!;
};

/**
 * A board with no five anywhere: pairs of a colour along each row, each row
 * shifted, so every row, column and diagonal changes colour within two stones.
 */
const noFiveColorAt = (point: number): GomokuColor =>
  ((point % 15) + 2 * Math.floor(point / 15)) % 4 < 2 ? 'black' : 'white';

/** Black's five along row 8, against White's stones along row 1. */
const BLACK_WINS = [
  'D8',
  'A1',
  'E8',
  'B1',
  'F8',
  'C1',
  'G8',
  'D1',
  'H8',
] as const;

describe('a Gomoku room', () => {
  let harness: TestServer;

  afterEach(async () => {
    await harness.teardown();
  });

  it('lists itself in its own lobby, with exactly two seats and nothing to choose', async () => {
    harness = await startServer();
    const client = await harness.connect();
    const create = (maxPlayers: number, settings: unknown = {}) =>
      request(client, 'room:create', {
        gameType: 'gomoku',
        roomName: 'Board',
        username: 'Ada',
        maxPlayers,
        password: '',
        settings,
      });

    expect((await create(3)).ok).toBe(false);
    expect((await create(2, { size: 19 })).ok).toBe(false);
    expect(harness.server.rooms.size).toBe(0);

    const roomId = await createGomokuRoom(client);
    expect(await lobbyView(client, roomId, 'gomoku')).toMatchObject({
      gameType: 'gomoku',
      maxPlayers: 2,
    });
  });

  it('waits with an empty board before the first game', async () => {
    harness = await startServer();
    const client = await harness.connect();
    const first = waitForGomokuState(client);
    await createGomokuRoom(client);

    expect(await first).toMatchObject({
      phase: 'waiting',
      colors: null,
      gameNumber: 0,
      moves: [],
      turnPlayerId: null,
      missedTurns: {},
      winLines: null,
      lastGame: null,
    });
  });

  it('draws the colours, gives Black the first move, and says who plays which', async () => {
    harness = await startServer();
    draw = 0.9;
    const { roomId, alice, bob } = await seatPair(harness);
    const said = waitForChat(alice, (m) => m.notice?.type === 'gomoku:started');
    const [view] = await startAndWait(alice, roomId, [alice, bob]);

    expect(view!.colors).toEqual({
      black: { playerId: bob.playerId, username: 'Bob' },
      white: { playerId: alice.playerId, username: 'Alice' },
    });
    expect(view!.turnPlayerId).toBe(bob.playerId);
    expect(view!.gameNumber).toBe(1);
    expect(view!.missedTurns).toEqual({
      [alice.playerId]: 0,
      [bob.playerId]: 0,
    });
    expect(view!.phaseEndsInMs).toBeGreaterThan(0);
    expect(textOf(await said)).toBe(
      'Game has started! Bob plays Black and Alice plays White, 2 seconds a move.',
    );
  });

  it('needs both seats taken to start', async () => {
    harness = await startServer();
    const client = await harness.connect();
    const roomId = await createGomokuRoom(client);
    const answer = await request(client, 'game:start', roomId);
    expect(answer.ok).toBe(false);
  });
});

describe('a stone', () => {
  let harness: TestServer;

  afterEach(async () => {
    await harness.teardown();
  });

  it('goes on the point the player whose turn it is chose, and passes the turn', async () => {
    harness = await startServer();
    const { roomId, alice, bob } = await playToFirstMove(harness);

    const afterBlack = await place(alice, roomId, 'H8', bob);
    expect(afterBlack.moves).toEqual([{ color: 'black', point: CENTRE }]);
    expect(afterBlack.turnPlayerId).toBe(bob.playerId);

    const afterWhite = await place(bob, roomId, 'J9', alice);
    expect(afterWhite.moves.at(-1)).toEqual({
      color: 'white',
      point: named('J9'),
    });
    expect(afterWhite.turnPlayerId).toBe(alice.playerId);
  });

  it('is ignored out of turn, on a taken point, off the board, or from a spectator', async () => {
    harness = await startServer();
    const { roomId, alice, bob } = await playToFirstMove(harness);
    const cleo = await harness.connect();
    await joinRoom(cleo, roomId, 'Cleo');

    bob.emit('gomoku:place', roomId, CENTRE);
    cleo.emit('gomoku:place', roomId, CENTRE);
    alice.emit('gomoku:place', roomId, POINTS);
    alice.emit('gomoku:place', roomId, -1);
    alice.emit('gomoku:place', roomId, 1.5);
    await settle();
    expect(gomokuRoom(harness, roomId).game.moves).toEqual([]);

    await place(alice, roomId, 'H8', bob);
    bob.emit('gomoku:place', roomId, CENTRE);
    alice.emit('gomoku:place', roomId, named('A1'));
    await settle();
    const game = gomokuRoom(harness, roomId).game;
    expect(game.moves).toHaveLength(1);
    expect(game.turnPlayerId).toBe(bob.playerId);
  });
});

describe('the end of a game', () => {
  let harness: TestServer;

  afterEach(async () => {
    await harness.teardown();
  });

  it('comes with five in a row: the line, a point for the winner, and the board left on the table', async () => {
    harness = await startServer();
    const { roomId, alice, bob } = await playToFirstMove(harness);
    const said = waitForChat(bob, (m) => m.notice?.type === 'gomoku:over');

    const end = waitForGomokuState(bob, (s) => s.phase === 'waiting');
    await play(roomId, alice, bob, BLACK_WINS.slice(0, -1));
    alice.emit('gomoku:place', roomId, named('H8'));
    const view = await end;

    expect(view.isGameStarted).toBe(false);
    expect(view.turnPlayerId).toBeNull();
    expect(view.phaseEndsInMs).toBe(0);
    expect(view.winLines?.map((line) => line.map(pointName))).toEqual([
      ['D8', 'E8', 'F8', 'G8', 'H8'],
    ]);
    expect(view.moves).toHaveLength(9);
    expect(view.playerList[alice.playerId]!.points).toBe(1);
    expect(view.playerList[bob.playerId]!.points).toBe(0);
    expect(view.lastGame).toMatchObject({
      endedEarly: false,
      ending: 'five',
      winner: 'black',
      stones: 9,
      standings: [
        { playerId: alice.playerId, points: 1 },
        { playerId: bob.playerId, points: 0 },
      ],
    });
    expect(textOf(await said)).toBe('Alice made five in a row.');

    // Nothing more goes on the board once it is over.
    bob.emit('gomoku:place', roomId, named('O15'));
    await settle();
    expect(gomokuRoom(harness, roomId).game.moves).toHaveLength(9);
  });

  it('comes with a full board and no five: a draw, and a point for nobody', async () => {
    harness = await startServer();
    const { roomId, alice, bob } = await playToFirstMove(harness);

    // All but one black point is filled, Black to move.
    const all = Array.from({ length: POINTS }, (_, point) => point);
    const blacks = all.filter((point) => noFiveColorAt(point) === 'black');
    const whites = all.filter((point) => noFiveColorAt(point) === 'white');
    // Black has the 113th stone, so it needs one more point than White.
    const [black, white] =
      blacks.length === 113 ? [blacks, whites] : [whites, blacks];
    const last = black.pop()!;
    const game = gomokuRoom(harness, roomId).game;
    game.moves = black.flatMap((point, index) => [
      { color: 'black' as const, point },
      { color: 'white' as const, point: white[index]! },
    ]);
    expect(game.moves).toHaveLength(POINTS - 1);

    const said = waitForChat(bob, (m) => m.notice?.type === 'gomoku:over');
    const end = waitForGomokuState(bob, (s) => s.phase === 'waiting');
    alice.emit('gomoku:place', roomId, last);
    const view = await end;

    expect(view.lastGame).toMatchObject({
      ending: 'draw',
      winner: null,
      stones: POINTS,
    });
    expect(view.winLines).toBeNull();
    expect(view.playerList[alice.playerId]!.points).toBe(0);
    expect(view.playerList[bob.playerId]!.points).toBe(0);
    expect(textOf(await said)).toBe('The board is full: a draw.');
  });
});

describe('a rematch', () => {
  let harness: TestServer;

  afterEach(async () => {
    await harness.teardown();
  });

  it('swaps the colours for the same pair, and draws again for a new one', async () => {
    harness = await startServer();
    const { roomId, alice, bob } = await playToFirstMove(harness);
    const end = waitForGomokuState(alice, (s) => s.phase === 'waiting');
    await play(roomId, alice, bob, BLACK_WINS.slice(0, -1));
    alice.emit('gomoku:place', roomId, named('H8'));
    await end;

    const [second] = await startAndWait(alice, roomId, [alice, bob]);
    expect(second!.colors?.black.playerId).toBe(bob.playerId);
    expect(second!.gameNumber).toBe(2);
    expect(second!.turnPlayerId).toBe(bob.playerId);
    // The last game's board is gone, and the score stays.
    expect(second!.moves).toEqual([]);
    expect(second!.winLines).toBeNull();
    expect(second!.lastGame).toBeNull();
    expect(second!.playerList[alice.playerId]!.points).toBe(1);

    const third = await startNewPairAfter(harness, roomId, alice, bob);
    expect(third.colors?.black.username).toBe('Cleo');
    expect(third.gameNumber).toBe(1);
  });

  it('starts a new pair for a player who moved to watch and sat down again', async () => {
    harness = await startServer();
    const { roomId, alice, bob } = await playToFirstMove(harness);
    const over = waitForGomokuState(alice, (s) => s.phase === 'waiting');
    bob.emit('gomoku:resign', roomId);
    expect((await over).samePair).toBe(true);

    expect((await request(alice, 'room:watch', roomId)).ok).toBe(true);
    const back = waitForGomokuState(bob, (s) => alice.playerId in s.playerList);
    expect((await request(alice, 'room:sit', roomId)).ok).toBe(true);
    expect((await back).samePair).toBe(false);

    // Alice was Black, so the same pair would have swapped her to White;
    // Bob is now seated first, so this draw gives Black to Alice.
    draw = 0.9;
    // Watching handed the room to Bob.
    const [view] = await startAndWait(bob, roomId, [alice, bob]);
    expect(view!.colors?.black.playerId).toBe(alice.playerId);
    expect(view!.gameNumber).toBe(1);
  });

  it('puts the game’s winner first on the result, whoever has won more', async () => {
    harness = await startServer();
    const { roomId, alice, bob } = await playToFirstMove(harness);
    const first = waitForGomokuState(alice, (s) => s.phase === 'waiting');
    bob.emit('gomoku:resign', roomId);
    await first;

    await startAndWait(alice, roomId, [alice, bob]);
    const second = waitForGomokuState(alice, (s) => s.phase === 'waiting');
    alice.emit('gomoku:resign', roomId);
    const view = await second;
    expect(view.lastGame?.standings).toEqual([
      { playerId: bob.playerId, username: 'Bob', points: 1 },
      { playerId: alice.playerId, username: 'Alice', points: 1 },
    ]);
  });
});

/** Ends the game by resigning, sends Bob away, seats Cleo, and starts again. */
const startNewPairAfter = async (
  harness: TestServer,
  roomId: string,
  alice: TestClient,
  bob: TestClient,
) => {
  const over = waitForGomokuState(alice, (s) => s.phase === 'waiting');
  bob.emit('gomoku:resign', roomId);
  await over;
  bob.emit('room:leave', roomId);
  await settle();
  const cleo = await harness.connect();
  await joinRoom(cleo, roomId, 'Cleo', '', 'player');
  // Alice was Black last game too, so the same pair would have swapped:
  // the draw, not the swap, decides a new pair.
  draw = 0.9;
  const [view] = await startAndWait(alice, roomId, [alice, cleo]);
  return view!;
};

describe('resigning', () => {
  let harness: TestServer;

  afterEach(async () => {
    await harness.teardown();
  });

  it('gives the game to the other player, and only a player may, while it is on', async () => {
    harness = await startServer();
    const { roomId, alice, bob } = await playToFirstMove(harness);
    const cleo = await harness.connect();
    await joinRoom(cleo, roomId, 'Cleo');

    cleo.emit('gomoku:resign', roomId);
    await settle();
    expect(gomokuRoom(harness, roomId).game.phase).toBe('playing');

    const said = waitForChat(alice, (m) => m.notice?.type === 'gomoku:over');
    const end = waitForGomokuState(alice, (s) => s.phase === 'waiting');
    bob.emit('gomoku:resign', roomId);
    const view = await end;
    expect(view.lastGame).toMatchObject({
      ending: 'resigned',
      winner: 'black',
    });
    expect(view.playerList[alice.playerId]!.points).toBe(1);
    expect(textOf(await said)).toBe('Bob resigned.');

    // Between games there is nothing to resign.
    alice.emit('gomoku:resign', roomId);
    await settle();
    expect(gomokuRoom(harness, roomId).game.lastGame?.ending).toBe('resigned');
    expect(gomokuRoom(harness, roomId).playerList[bob.playerId]!.points).toBe(
      0,
    );
  });
});

describe('the clock', () => {
  let harness: TestServer;

  afterEach(async () => {
    await harness.teardown();
  });

  it('passes the turn with no stone when it runs out, and a second in a row loses', async () => {
    harness = await startServer({ turn: 0.5 });
    const { roomId, alice, bob } = await playToFirstMove(harness);
    const chat = collectChat(bob);

    const passed = await waitForGomokuState(bob, (s) => s.moves.length === 1);
    expect(passed.moves).toEqual([{ color: 'black', point: null }]);
    expect(passed.turnPlayerId).toBe(bob.playerId);
    expect(passed.missedTurns[alice.playerId]).toBe(1);

    const end = waitForGomokuState(bob, (s) => s.phase === 'waiting');
    await place(bob, roomId, 'H8');
    const view = await end;

    expect(view.moves).toEqual([
      { color: 'black', point: null },
      { color: 'white', point: CENTRE },
      { color: 'black', point: null },
    ]);
    expect(view.lastGame).toMatchObject({ ending: 'timeout', winner: 'white' });
    expect(view.playerList[bob.playerId]!.points).toBe(1);
    await settle();
    expect(chat.map(textOf)).toEqual([
      'Alice ran out of time.',
      'Alice ran out of time twice; Bob wins.',
    ]);
  });

  it('forgets a lost turn once the player places a stone', async () => {
    harness = await startServer({ turn: 0.5 });
    const { roomId, alice, bob } = await playToFirstMove(harness);

    await waitForGomokuState(bob, (s) => s.moves.length === 1);
    await place(bob, roomId, 'H8', alice);
    const placed = await place(alice, roomId, 'J9', bob);
    expect(placed.missedTurns[alice.playerId]).toBe(0);
    await place(bob, roomId, 'K10', alice);

    const passed = await waitForGomokuState(alice, (s) => s.moves.length === 5);
    expect(passed.phase).toBe('playing');
    expect(passed.missedTurns[alice.playerId]).toBe(1);
  });
});

describe('leaving and dropping', () => {
  let harness: TestServer;

  afterEach(async () => {
    await harness.teardown();
  });

  it('loses the game for a player who leaves mid-game', async () => {
    harness = await startServer();
    const { roomId, alice, bob } = await playToFirstMove(harness);
    await place(alice, roomId, 'H8', bob);

    const said = waitForChat(alice, (m) => m.notice?.type === 'gomoku:over');
    const end = waitForGomokuState(alice, (s) => s.phase === 'waiting');
    bob.emit('room:leave', roomId);
    const view = await end;

    expect(view.lastGame).toMatchObject({
      endedEarly: true,
      ending: 'left',
      winner: 'black',
      standings: [{ playerId: alice.playerId, points: 1 }],
    });
    // The board and both names stay on the table for the result.
    expect(view.moves).toHaveLength(1);
    expect(view.colors?.white.username).toBe('Bob');
    expect(textOf(await said)).toBe('Bob left; Alice wins.');
  });

  it('loses the game for a player whose seat’s grace runs out', async () => {
    harness = await startServer();
    const { roomId, alice, bob } = await playToFirstMove(harness);

    const end = waitForGomokuState(alice, (s) => s.phase === 'waiting');
    bob.disconnect();
    const view = await end;
    expect(view.lastGame).toMatchObject({ ending: 'left', winner: 'black' });
    expect(
      gomokuRoom(harness, roomId).playerList[bob.playerId],
    ).toBeUndefined();
  });

  it('keeps the game for a player who comes back in time, and their turn did not wait', async () => {
    harness = await startServer({ grace: 5, turn: 1 });
    const { roomId, alice, bob } = await playToFirstMove(harness);
    await place(alice, roomId, 'H8', bob);

    bob.disconnect();
    // Bob's turn runs out while Bob is away, as it would for anybody.
    await waitForGomokuState(alice, (s) => s.moves.length === 2);
    await place(alice, roomId, 'J9');
    const back = await harness.reload(bob);
    const { state } = await syncRoom(back, roomId);
    expect((state as GomokuRoomState).turnPlayerId).toBe(back.playerId);

    const view = await place(back, roomId, 'K10', alice);
    expect(view.phase).toBe('playing');
    expect(view.moves.at(-1)).toEqual({ color: 'white', point: named('K10') });
    expect(view.missedTurns[back.playerId]).toBe(0);
  });

  it('changes nothing when a spectator leaves', async () => {
    harness = await startServer();
    const { roomId, alice, bob } = await playToFirstMove(harness);
    const cleo = await harness.connect();
    await joinRoom(cleo, roomId, 'Cleo');
    cleo.emit('room:leave', roomId);
    await settle();

    const view = await place(alice, roomId, 'H8', bob);
    expect(view.phase).toBe('playing');
    expect(view.spectators).toEqual({});
  });
});

describe('a spectator', () => {
  let harness: TestServer;

  afterEach(async () => {
    await harness.teardown();
  });

  it('sees the same game as the players, live, and cannot take a seat until it ends', async () => {
    harness = await startServer();
    const { roomId, alice, bob } = await playToFirstMove(harness);
    const cleo = await harness.connect();
    await joinRoom(cleo, roomId, 'Cleo');

    const [bobs, cleos] = await Promise.all([
      place(alice, roomId, 'H8', bob),
      waitForGomokuState(cleo, (s) => s.moves.length === 1),
    ]);
    expect(cleos.spectators[cleo.playerId]).toBeDefined();
    expect(cleos.playerList[cleo.playerId]).toBeUndefined();
    const { phaseEndsInMs: _a, ...seenByBob } = bobs;
    const { phaseEndsInMs: _b, ...seenByCleo } = cleos;
    expect(seenByCleo).toEqual(seenByBob);

    const sit = await request(cleo, 'room:sit', roomId);
    expect(sit.ok).toBe(false);
  });
});
