import { textOf, seatTable, TWO_NAMES } from './helpers/test-server.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PairsRoomState } from '../models/types.js';
import {
  collectChat,
  createPairsRoom,
  lobbyView,
  pairsRoom,
  request,
  settle,
  startGame,
  startTestServer,
  waitForChat,
  waitForPairsState,
  type TestClient,
  type TestServer,
  endNotices,
} from './helpers/test-server.js';

/** The places of each symbol's two cards, read off the server's own deck. */
function placesOf(harness: TestServer, roomId: string): [number, number][] {
  const places = new Map<number, number[]>();
  pairsRoom(harness, roomId).game.deck.forEach((symbol, index) =>
    places.set(symbol, [...(places.get(symbol) ?? []), index]),
  );
  return [...places.values()] as [number, number][];
}

/** Two places, face down, that do not match. */
function aMiss(harness: TestServer, roomId: string): [number, number] {
  const { matched } = pairsRoom(harness, roomId).game;
  const open = placesOf(harness, roomId).filter(([a]) => !matched[a]);
  return [open[0]![0], open[1]![0]];
}

/**
 * Seats `names` in a Pairs room, the first as its owner, and starts the game.
 * The order of play is shuffled, so no test may assume who goes first; `turn`
 * says who it is.
 */
async function playToFirstTurn<
  const Names extends readonly [string, ...string[]] = typeof TWO_NAMES,
>(harness: TestServer, names: Names = TWO_NAMES as unknown as Names) {
  const { roomId, players, owner } = await seatTable(
    harness,
    names,
    (creator, username) => createPairsRoom(creator, { username }),
  );

  const turn = waitForPairsState(owner, (s) => s.phase === 'flipping');
  await startGame(owner, roomId);
  const first = await turn;

  const byId = (playerId: string | null) =>
    players.find((player) => player.playerId === playerId)!;
  const nameOf = (player: TestClient) => names[players.indexOf(player)]!;
  return { roomId, players, owner, first, byId, nameOf };
}

/** The next snapshot in which it is `player`'s turn, with nothing up. */
const turnOf = (watcher: TestClient, player: TestClient) =>
  waitForPairsState(
    watcher,
    (s) =>
      s.phase === 'flipping' &&
      s.turnPlayerId === player.playerId &&
      s.cards.every((card) => card.state !== 'up'),
  );

describe('a Pairs room', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('lists its board in its own lobby', async () => {
    const client = await harness.connect();
    const roomId = await createPairsRoom(client, { board: 'Large' });

    expect(await lobbyView(client, roomId, 'pairs')).toMatchObject({
      gameType: 'pairs',
      board: 'Large',
    });
  });

  it('refuses any other board, and more than six seats', async () => {
    const client = await harness.connect();
    const create = (settings: unknown, maxPlayers = 4) =>
      request(client, 'room:create', {
        gameType: 'pairs',
        roomName: 'Memory lane',
        username: 'Ada',
        maxPlayers,
        password: '',
        settings,
      });

    expect((await create({ board: 'Huge' })).error?.type).toBe(
      'invalidRequest',
    );
    expect((await create({ board: 'Small' }, 7)).ok).toBe(false);
    expect(harness.server.rooms.size).toBe(0);
  });

  it('waits with no cards on the table before the first game', async () => {
    const client = await harness.connect();
    const first = waitForPairsState(client);
    await createPairsRoom(client);

    expect(await first).toMatchObject({
      phase: 'waiting',
      cards: [],
      pairsFound: 0,
      turnPlayerId: null,
      nextPlayerId: null,
      lastMiss: [],
      lastGame: null,
    });
  });

  it('deals the board face down, and gives somebody the first turn', async () => {
    const { roomId, players, first } = await playToFirstTurn(harness);

    expect(first.cards).toHaveLength(16);
    expect(first.cards.every((card) => card.symbol === null)).toBe(true);
    expect(first.phaseEndsInMs).toBeGreaterThan(0);
    const ids = players.map((player) => player.playerId);
    expect(ids).toContain(first.turnPlayerId);
    expect(first.nextPlayerId).toBe(
      ids.find((id) => id !== first.turnPlayerId),
    );
    expect(placesOf(harness, roomId)).toHaveLength(8);
  });
});

describe('a turn', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('is only the turn player’s, and shows everybody only the card turned', async () => {
    const { roomId, players, first, byId } = await playToFirstTurn(harness);
    const mover = byId(first.turnPlayerId);
    const other = players.find((player) => player !== mover)!;
    const [a] = placesOf(harness, roomId)[0]!;

    other.emit('pairs:flip', roomId, a);
    await settle();
    expect(pairsRoom(harness, roomId).game.up).toEqual([]);

    const seen = waitForPairsState(other, (s) => s.cards[a]!.state === 'up');
    mover.emit('pairs:flip', roomId, a);
    const view = await seen;
    expect(view.cards[a]!.symbol).toBe(pairsRoom(harness, roomId).game.deck[a]);
    expect(
      view.cards.filter((card, index) => index !== a && card.symbol !== null),
    ).toEqual([]);

    // The same card again, or one past the board, is not a second card.
    mover.emit('pairs:flip', roomId, a);
    mover.emit('pairs:flip', roomId, 20);
    await settle();
    expect(pairsRoom(harness, roomId).game.up).toEqual([a]);
  });

  it('keeps a pair up, scores it and goes again', async () => {
    const { roomId, owner, first, byId, nameOf } =
      await playToFirstTurn(harness);
    const mover = byId(first.turnPlayerId);
    const [a, b] = placesOf(harness, roomId)[0]!;
    const chat = waitForChat(owner, (m) => m.kind === 'score');

    const found = waitForPairsState(owner, (s) => s.pairsFound === 1);
    mover.emit('pairs:flip', roomId, a);
    mover.emit('pairs:flip', roomId, b);
    const view = await found;

    expect(view.cards[a]).toEqual({
      state: 'matched',
      symbol: pairsRoom(harness, roomId).game.deck[a],
    });
    expect(view.cards[b]!.state).toBe('matched');
    expect(view.phase).toBe('flipping');
    expect(view.turnPlayerId).toBe(mover.playerId);
    expect(view.playerList[mover.playerId]!.points).toBe(1);
    expect(textOf(await chat)).toBe(`${nameOf(mover)} found a pair! (+1)`);

    // A matched card cannot be turned over again.
    mover.emit('pairs:flip', roomId, a);
    await settle();
    expect(pairsRoom(harness, roomId).game.up).toEqual([]);
  });

  it('shows a miss to everybody, then turns it back and passes the turn', async () => {
    const { roomId, players, first, byId } = await playToFirstTurn(harness);
    const mover = byId(first.turnPlayerId);
    const other = players.find((player) => player !== mover)!;
    const [a, b] = aMiss(harness, roomId);

    const showing = waitForPairsState(other, (s) => s.phase === 'showing');
    mover.emit('pairs:flip', roomId, a);
    mover.emit('pairs:flip', roomId, b);
    const view = await showing;
    expect(view.lastMiss).toEqual([a, b]);
    expect(view.cards[a]!.state).toBe('up');
    expect(view.cards[b]!.state).toBe('up');
    expect(view.turnPlayerId).toBe(mover.playerId);
    expect(view.nextPlayerId).toBe(other.playerId);

    // Nobody turns a card over while a miss is on show.
    const [c] = aMiss(harness, roomId).filter((p) => p !== a && p !== b);
    if (c !== undefined) mover.emit('pairs:flip', roomId, c);

    const passed = await turnOf(other, other);
    expect(passed.lastMiss).toEqual([]);
    expect(passed.cards.every((card) => card.state === 'down')).toBe(true);
    expect(passed.playerList[mover.playerId]!.points).toBe(0);
  });

  it('turns a lone card back when the clock runs out, and passes the turn', async () => {
    const { roomId, players, first, byId } = await playToFirstTurn(harness);
    const mover = byId(first.turnPlayerId);
    const other = players.find((player) => player !== mover)!;
    const [a] = placesOf(harness, roomId)[0]!;

    mover.emit('pairs:flip', roomId, a);
    const passed = await turnOf(other, other);
    expect(passed.cards[a]).toEqual({ state: 'down', symbol: null });
  });

  it('skips a player who is not connected', async () => {
    const { roomId, players, first, byId } = await playToFirstTurn(harness, [
      'Alice',
      'Bob',
      'Cat',
    ]);
    const mover = byId(first.turnPlayerId);
    const skipped = byId(first.nextPlayerId);
    const third = players.find((p) => p !== mover && p !== skipped)!;

    const told = waitForPairsState(
      mover,
      (s) => s.nextPlayerId === third.playerId,
    );
    skipped.close();
    expect((await told).playerList[skipped.playerId]!.isConnected).toBe(false);

    const [a, b] = aMiss(harness, roomId);
    mover.emit('pairs:flip', roomId, a);
    mover.emit('pairs:flip', roomId, b);
    expect((await turnOf(third, third)).nextPlayerId).toBe(mover.playerId);
  });
});

describe('a Pairs game', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('ends with the last pair, and reopens the room', async () => {
    const { roomId, owner, first, byId, nameOf } =
      await playToFirstTurn(harness);
    const mover = byId(first.turnPlayerId);
    const messages = collectChat(owner);

    const over = waitForPairsState(owner, (s) => s.lastGame !== null);
    // A pair at a time, as fast as a player may turn cards over: a burst,
    // then two cards each half second.
    for (const [index, [a, b]] of placesOf(harness, roomId).entries()) {
      if (index >= 4) await settle(500);
      const found = waitForPairsState(
        owner,
        (s) => s.pairsFound === index + 1 || s.lastGame !== null,
      );
      mover.emit('pairs:flip', roomId, a);
      mover.emit('pairs:flip', roomId, b);
      await found;
    }
    const view = await over;

    expect(view).toMatchObject({
      phase: 'waiting',
      isGameStarted: false,
      status: 'Open',
      turnPlayerId: null,
      nextPlayerId: null,
    });
    // The finished board stays on the table, every card matched.
    expect(view.cards).toHaveLength(16);
    expect(view.cards.every((card) => card.state === 'matched')).toBe(true);
    expect(view.lastGame).toMatchObject({
      endedEarly: false,
      board: 'Small',
      pairs: 8,
    });
    expect(view.lastGame!.standings[0]).toMatchObject({
      playerId: mover.playerId,
      points: 8,
    });
    await settle();
    expect(messages.filter((m) => m.kind === 'score')).toHaveLength(8);
    expect(messages.at(-1)!.kind).toBe('success');
    expect(textOf(messages.at(-1)!)).toBe(
      `Game over: ${nameOf(mover)} wins with 8 pairs!`,
    );
  });

  it('ends early when too few players are left', async () => {
    const { roomId, players, owner, first, byId } =
      await playToFirstTurn(harness);
    const mover = byId(first.turnPlayerId);
    const [a, b] = placesOf(harness, roomId)[0]!;
    const found = waitForPairsState(owner, (s) => s.pairsFound === 1);
    mover.emit('pairs:flip', roomId, a);
    mover.emit('pairs:flip', roomId, b);
    await found;

    const endChat = collectChat(owner);
    const over = waitForPairsState(owner, (s) => s.lastGame !== null);
    players[1].emit('room:leave', roomId);
    const view: PairsRoomState = await over;
    expect(view.lastGame).toMatchObject({ endedEarly: true, pairs: 1 });
    // One notice says it ended early; no result for a game nobody finished.
    await settle();
    expect(endNotices(endChat)).toEqual(['game:interrupted']);
  });
});
