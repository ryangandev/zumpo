import { textOf, seatTable, TWO_NAMES } from './helpers/test-server.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SnapRoomState } from '../models/types.js';
import { matchOf, type Card } from '../../shared/snap.js';
import {
  collectChat,
  createSnapRoom,
  joinRoom,
  lobbyView,
  request,
  settle,
  snapRoom,
  startGame,
  startTestServer,
  waitForChat,
  waitForSnapState,
  type TestServer,
} from './helpers/test-server.js';

/** The symbol a player's card shares with the middle card. */
const matchFor = (state: SnapRoomState) =>
  matchOf(state.myCard as Card, state.middle!.symbols)!;

/** A symbol on the player's card that is not on the middle card. */
const onlyMine = (state: SnapRoomState) =>
  state.myCard!.find((symbol) => !state.middle!.symbols.includes(symbol))!;

/** A symbol on the middle card that is not on the player's card. */
const onlyMiddle = (state: SnapRoomState) =>
  state.middle!.symbols.find((symbol) => !state.myCard!.includes(symbol))!;

/** Seats `names` in a Snap room, the first as its owner, and starts it. */
async function playToFirstCard<
  const Names extends readonly [string, ...string[]] = typeof TWO_NAMES,
>(harness: TestServer, names: Names = TWO_NAMES as unknown as Names) {
  const { roomId, players, owner } = await seatTable(
    harness,
    names,
    (creator, username) => createSnapRoom(creator, { username }),
  );

  const views = players.map((player) =>
    waitForSnapState(player, (s) => s.phase === 'finding'),
  );
  await startGame(owner, roomId);
  const firsts = await Promise.all(views);
  return { roomId, players, owner, firsts };
}

describe('a Snap room', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('is listed in its own lobby, with nothing to choose', async () => {
    const client = await harness.connect();
    const roomId = await createSnapRoom(client);

    expect(await lobbyView(client, roomId, 'snap')).toMatchObject({
      gameType: 'snap',
      maxPlayers: 4,
    });
  });

  it('refuses settings, and more than six seats', async () => {
    const client = await harness.connect();
    const create = (settings: unknown, maxPlayers = 4) =>
      request(client, 'room:create', {
        gameType: 'snap',
        roomName: 'Spot on',
        username: 'Ada',
        maxPlayers,
        password: '',
        settings,
      });

    expect((await create({ cards: 57 })).error?.type).toBe('invalidRequest');
    expect((await create({}, 7)).ok).toBe(false);
    expect(Object.keys(harness.server.rooms)).toEqual([]);
  });

  it('waits with no cards before the first game', async () => {
    const client = await harness.connect();
    const first = waitForSnapState(client);
    await createSnapRoom(client);

    expect(await first).toMatchObject({
      phase: 'waiting',
      cards: 0,
      taken: 0,
      middle: null,
      myCard: null,
      lastTake: null,
      cardMs: 0,
      lockedOutMs: 0,
      myMiss: null,
      lastGame: null,
    });
  });

  it('deals each player a card and one to the middle, and keeps the rest to itself', async () => {
    const { roomId, players, firsts } = await playToFirstCard(harness);
    const [alice, bob] = firsts;

    expect(alice!.cards).toBe(29);
    expect(alice!.middle).toEqual(bob!.middle);
    expect(alice!.middle!.number).toBe(0);
    expect(alice!.myCard).toHaveLength(6);
    expect(alice!.myCard).not.toEqual(bob!.myCard);
    // Every two cards share one symbol: yours and the middle, yours and theirs.
    expect(matchOf(alice!.myCard!, alice!.middle!.symbols)).not.toBeNull();
    expect(matchOf(alice!.myCard!, bob!.myCard!)).not.toBeNull();
    expect(alice!.phaseEndsInMs).toBe(0);
    expect(alice).not.toHaveProperty('pile');
    expect(alice).not.toHaveProperty('hands');
    expect(JSON.stringify(alice)).not.toContain(JSON.stringify(bob!.myCard));
    const game = snapRoom(harness, roomId).game;
    expect(game.pile).toHaveLength(28);
    expect(game.hands.get(players[1].playerId)).toEqual(bob!.myCard);
  });

  it('shows a spectator the middle card and no card of their own', async () => {
    const { roomId, firsts } = await playToFirstCard(harness);
    const late = await harness.connect();
    const watching = waitForSnapState(late, (s) => s.middle !== null);
    await joinRoom(late, roomId, 'Late');
    const view = await watching;

    expect(view.spectators[late.playerId]).toBeDefined();
    expect(view.middle).toEqual(firsts[0]!.middle);
    expect(view.myCard).toBeNull();

    // And a claim from them is nobody's.
    late.emit('snap:claim', roomId, 0, view.middle!.symbols[0]!);
    await settle();
    expect(snapRoom(harness, roomId).game.taken).toBe(0);
  });
});

describe('a claim', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('takes the middle card: +1, on show for everybody, then it is the taker’s card', async () => {
    const { roomId, players, firsts } = await playToFirstCard(harness);
    const [alice, bob] = players;
    const bobFirst = firsts[1]!;
    const symbol = matchFor(bobFirst);
    const chat = waitForChat(alice, (m) => m.kind === 'success');

    const taken = waitForSnapState(alice, (s) => s.phase === 'taken');
    bob.emit('snap:claim', roomId, 0, symbol);
    const view = await taken;

    expect(view.taken).toBe(1);
    expect(view.playerList[bob.playerId]!.points).toBe(1);
    expect(view.lastTake).toEqual({
      playerId: bob.playerId,
      username: 'Bob',
      number: 0,
      symbol,
    });
    // The taken card stays in the middle while it is on show.
    expect(view.middle).toEqual(bobFirst.middle);
    expect(view.phaseEndsInMs).toBeGreaterThan(0);
    expect(textOf(await chat)).toBe('Bob took a card! (+1)');

    const [aliceNext, bobNext] = await Promise.all([
      waitForSnapState(alice, (s) => s.phase === 'finding' && s.taken === 1),
      waitForSnapState(bob, (s) => s.phase === 'finding' && s.taken === 1),
    ]);
    expect(bobNext.myCard).toEqual(bobFirst.middle!.symbols);
    expect(aliceNext.myCard).toEqual(firsts[0]!.myCard);
    expect(aliceNext.middle!.number).toBe(1);
    expect(aliceNext.middle!.symbols).not.toEqual(bobFirst.middle!.symbols);
    expect(aliceNext.lastTake?.playerId).toBe(bob.playerId);
    expect(aliceNext.cardMs).toBeLessThan(500);
  });

  it('locks out a symbol on one card only, says which, and tells nobody else', async () => {
    const { roomId, players, firsts } = await playToFirstCard(harness);
    const [alice, bob] = players;
    const bobFirst = firsts[1]!;
    const wrong = onlyMine(bobFirst);

    const locked = waitForSnapState(bob, (s) => s.lockedOutMs > 0);
    bob.emit('snap:claim', roomId, 0, wrong);
    const view = await locked;
    expect(view.myMiss).toEqual({ symbol: wrong, on: 'mine' });
    expect(view.playerList[bob.playerId]!.points).toBe(0);
    expect(view.phase).toBe('finding');
    await settle();
    expect(alice.state).toMatchObject({ lockedOutMs: 0, myMiss: null });

    // Locked out, even the match is not taken.
    bob.emit('snap:claim', roomId, 0, matchFor(bobFirst));
    await settle();
    expect(snapRoom(harness, roomId).game.taken).toBe(0);

    // And when the lockout ends, it is.
    const free = await waitForSnapState(bob, (s) => s.lockedOutMs === 0);
    expect(free.myMiss).toBeNull();
    const taken = waitForSnapState(bob, (s) => s.taken === 1);
    bob.emit('snap:claim', roomId, 0, matchFor(bobFirst));
    expect((await taken).playerList[bob.playerId]!.points).toBe(1);
  });

  it('says a miss on the middle card is on the middle card', async () => {
    const { roomId, players, firsts } = await playToFirstCard(harness);
    const wrong = onlyMiddle(firsts[0]!);
    const locked = waitForSnapState(players[0], (s) => s.lockedOutMs > 0);
    players[0].emit('snap:claim', roomId, 0, wrong);
    expect((await locked).myMiss).toEqual({ symbol: wrong, on: 'middle' });
  });

  it('drops a claim that lost the race, or was for another card, with no lockout', async () => {
    const { roomId, players, firsts } = await playToFirstCard(harness);
    const [alice, bob] = players;

    const taken = waitForSnapState(bob, (s) => s.phase === 'taken');
    alice.emit('snap:claim', roomId, 0, matchFor(firsts[0]!));
    // Bob's match a moment later, during the taken pause.
    bob.emit('snap:claim', roomId, 0, matchFor(firsts[1]!));
    await taken;
    await settle();
    expect(snapRoom(harness, roomId).game.lockouts.size).toBe(0);

    // After the next card is turned, a claim still meant for the old one.
    const next = await waitForSnapState(bob, (s) => s.phase === 'finding');
    bob.emit('snap:claim', roomId, 0, matchFor(next));
    bob.emit('snap:claim', roomId, 0, onlyMine(next));
    await settle();
    const game = snapRoom(harness, roomId).game;
    expect(game.taken).toBe(1);
    expect(game.lockouts.size).toBe(0);
    expect(bob.state).toMatchObject({ lockedOutMs: 0 });
  });

  it('ignores a symbol on neither card, and a claim from outside the room', async () => {
    const { roomId, players, firsts } = await playToFirstCard(harness);
    const view = firsts[0]!;
    const neither = Array.from({ length: 31 }, (_, s) => s).find(
      (s) => !view.myCard!.includes(s) && !view.middle!.symbols.includes(s),
    )!;
    const room = snapRoom(harness, roomId);

    const stranger = await harness.connect();
    stranger.emit('snap:claim', roomId, 0, matchFor(view));
    players[0].emit('snap:claim', roomId, 0, neither);
    players[0].emit('snap:claim', roomId, 0, 31);
    await settle();
    expect(room.game.taken).toBe(0);
    expect(room.game.lockouts.size).toBe(0);
  });

  it('keeps a lockout running through a card somebody else takes', async () => {
    const { roomId, players, firsts } = await playToFirstCard(harness);
    const [alice, bob] = players;
    const locked = waitForSnapState(bob, (s) => s.lockedOutMs > 0);
    bob.emit('snap:claim', roomId, 0, onlyMine(firsts[1]!));
    await locked;

    const next = waitForSnapState(
      bob,
      (s) => s.phase === 'finding' && s.taken === 1,
    );
    alice.emit('snap:claim', roomId, 0, matchFor(firsts[0]!));
    const view = await next;
    expect(view.lockedOutMs).toBeGreaterThan(0);
    bob.emit('snap:claim', roomId, 1, matchFor(view));
    await settle(50);
    expect(snapRoom(harness, roomId).game.taken).toBe(1);
  });
});

describe('a Snap game', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('ends when the pile runs out, and reopens the room', async () => {
    const { roomId, players, owner, firsts } = await playToFirstCard(harness);
    const [alice, bob] = players;
    const messages = collectChat(owner);

    let views = firsts;
    for (let card = 0; card < 29; card++) {
      const taker = card % 3 === 0 ? 0 : 1;
      const done = waitForSnapState(
        owner,
        (s) => s.taken === card + 1 && s.phase !== 'finding',
      );
      players[taker].emit('snap:claim', roomId, card, matchFor(views[taker]!));
      await done;
      if (card < 28) {
        views = await Promise.all(
          players.map((player) =>
            waitForSnapState(
              player,
              (s) => s.phase === 'finding' && s.taken === card + 1,
            ),
          ),
        );
      }
    }

    const over = await waitForSnapState(owner, (s) => s.lastGame !== null);
    expect(over).toMatchObject({
      phase: 'waiting',
      isGameStarted: false,
      status: 'Open',
      cards: 29,
      taken: 29,
      cardMs: 0,
    });
    // The last card stays in the middle, with who took it.
    expect(over.middle!.number).toBe(28);
    expect(over.lastTake?.number).toBe(28);
    expect(over.lastGame).toMatchObject({
      endedEarly: false,
      cards: 29,
      taken: 29,
    });
    expect(over.lastGame!.standings).toEqual([
      { playerId: bob.playerId, username: 'Bob', points: 19 },
      { playerId: alice.playerId, username: 'Alice', points: 10 },
    ]);
    await settle();
    expect(messages.filter((m) => m.kind === 'success')).toHaveLength(29);
    expect(textOf(messages.at(-1)!)).toBe('Game over: Bob wins with 19 cards!');
    expect(snapRoom(harness, roomId).game.pile).toEqual([]);
  });

  it('says how many cards a game has when it starts', async () => {
    const { roomId, players, owner } = await seatTable(
      harness,
      ['Alice', 'Bob', 'Cleo'],
      (creator, username) => createSnapRoom(creator, { username }),
    );
    const said = waitForChat(
      players[2],
      (m) => m.kind === 'system' && textOf(m).startsWith('Game has started'),
    );
    await startGame(owner, roomId);
    expect(textOf(await said)).toBe('Game has started! 28 cards to win.');
  });

  it('ends early when too few players are left', async () => {
    const { roomId, players, owner, firsts } = await playToFirstCard(harness);
    const taken = waitForSnapState(owner, (s) => s.taken === 1);
    players[1].emit('snap:claim', roomId, 0, matchFor(firsts[1]!));
    await taken;

    const over = waitForSnapState(owner, (s) => s.lastGame !== null);
    players[1].emit('room:leave', roomId);
    expect((await over).lastGame).toMatchObject({ endedEarly: true, taken: 1 });
    expect(snapRoom(harness, roomId).game.hands.has(players[1].playerId)).toBe(
      false,
    );
  });

  it('keeps a lockout and your card through a refresh', async () => {
    const { roomId, players, firsts } = await playToFirstCard(harness);
    const bob = players[1];
    const locked = waitForSnapState(bob, (s) => s.lockedOutMs > 0);
    bob.emit('snap:claim', roomId, 0, onlyMine(firsts[1]!));
    await locked;

    const again = await harness.reload(bob);
    const synced = waitForSnapState(again, (s) => s.lockedOutMs > 0);
    await request(again, 'room:sync', roomId);
    const view = await synced;
    expect(view.myMiss?.on).toBe('mine');
    expect(view.myCard).toEqual(firsts[1]!.myCard);
  });
});
