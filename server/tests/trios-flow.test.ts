import { textOf, seatTable, TWO_NAMES } from './helpers/test-server.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TriosRoomState } from '../models/types.js';
import { findTrios, isTrio } from '../../shared/trios.js';
import {
  collectChat,
  createTriosRoom,
  lobbyView,
  request,
  settle,
  startGame,
  startTestServer,
  triosRoom,
  waitForChat,
  waitForTriosState,
  type TestServer,
  endNotices,
} from './helpers/test-server.js';

/** The cards of a trio on the table, as a player who spotted it would send. */
const aTrio = (state: TriosRoomState) =>
  findTrios(state.table)[0]!.map((place) => state.table[place]!) as [
    number,
    number,
    number,
  ];

/** Three cards on the table that are not a trio. */
function notATrio(state: TriosRoomState): number[] {
  const { table } = state;
  for (let a = 0; a < table.length; a++) {
    for (let b = a + 1; b < table.length; b++) {
      for (let c = b + 1; c < table.length; c++) {
        if (!isTrio(table[a]!, table[b]!, table[c]!)) {
          return [table[a]!, table[b]!, table[c]!];
        }
      }
    }
  }
  throw new Error('Every three cards on this table are a trio.');
}

/** Seats `names` in a Trios room, the first as its owner, and starts it. */
async function playToFirstTable<
  const Names extends readonly [string, ...string[]] = typeof TWO_NAMES,
>(
  harness: TestServer,
  names: Names = TWO_NAMES as unknown as Names,
  trios = 10,
) {
  const { roomId, players, owner } = await seatTable(
    harness,
    names,
    (creator, username) => createTriosRoom(creator, { username, trios }),
  );

  const table = waitForTriosState(owner, (s) => s.phase === 'finding');
  await startGame(owner, roomId);
  const first = await table;
  return { roomId, players, owner, first };
}

describe('a Trios room', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('lists how many trios a game has in its own lobby', async () => {
    const client = await harness.connect();
    const roomId = await createTriosRoom(client, { trios: 20 });

    expect(await lobbyView(client, roomId, 'trios')).toMatchObject({
      gameType: 'trios',
      trios: 20,
    });
  });

  it('refuses any other length, and more than eight seats', async () => {
    const client = await harness.connect();
    const create = (settings: unknown, maxPlayers = 4) =>
      request(client, 'room:create', {
        gameType: 'trios',
        roomName: 'Odd ones in',
        username: 'Ada',
        maxPlayers,
        password: '',
        settings,
      });

    expect((await create({ trios: 15 })).error?.type).toBe('invalidRequest');
    expect((await create({ trios: 10 }, 9)).ok).toBe(false);
    expect(Object.keys(harness.server.rooms)).toEqual([]);
  });

  it('waits with no cards on the table before the first game', async () => {
    const client = await harness.connect();
    const first = waitForTriosState(client);
    await createTriosRoom(client);

    expect(await first).toMatchObject({
      phase: 'waiting',
      trios: 10,
      found: 0,
      table: [],
      lastTrio: null,
      hint: [],
      searchingMs: 0,
      lockedOutMs: 0,
      myMiss: [],
      lastGame: null,
    });
  });

  it('deals twelve cards with a trio, and keeps the deck to itself', async () => {
    const { roomId, first } = await playToFirstTable(harness);

    expect(first.table).toHaveLength(12);
    expect(findTrios(first.table).length).toBeGreaterThan(0);
    expect(first.deckLeft).toBe(69);
    expect(first.phaseEndsInMs).toBeGreaterThan(0);
    expect(first).not.toHaveProperty('deck');
    expect(first).not.toHaveProperty('deal');
    expect(triosRoom(harness, roomId).game.deal.deck).toHaveLength(69);
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

  it('takes a trio: +1, on show for everybody, then new cards in its places', async () => {
    const { roomId, players, first } = await playToFirstTable(harness);
    const [alice, bob] = players;
    const cards = aTrio(first);
    const places = cards.map((card) => first.table.indexOf(card));
    const chat = waitForChat(alice, (m) => m.kind === 'score');

    const taken = waitForTriosState(alice, (s) => s.phase === 'taken');
    bob.emit('trios:claim', roomId, cards);
    const view = await taken;

    expect(view.found).toBe(1);
    expect(view.playerList[bob.playerId]!.points).toBe(1);
    expect(view.lastTrio).toEqual({
      playerId: bob.playerId,
      username: 'Bob',
      cards: places.toSorted((a, b) => a - b).map((p) => first.table[p]),
      places: places.toSorted((a, b) => a - b),
    });
    // The trio stays where it lay while it is on show.
    expect(view.table).toEqual(first.table);
    expect(view.phaseEndsInMs).toBeGreaterThan(0);
    expect(textOf(await chat)).toBe('Bob found a trio, +1.');

    const refilled = await waitForTriosState(
      alice,
      (s) => s.phase === 'finding' && s.found === 1,
    );
    expect(refilled.deckLeft).toBe(66);
    expect(findTrios(refilled.table).length).toBeGreaterThan(0);
    const kept = (table: number[]) =>
      table.filter((_, place) => !places.includes(place));
    expect(kept(refilled.table)).toEqual(kept(first.table));
    expect(refilled.lastTrio?.playerId).toBe(bob.playerId);
  });

  it('locks out a wrong claim, and tells nobody else', async () => {
    const { roomId, players, first } = await playToFirstTable(harness);
    const [alice, bob] = players;
    const wrong = notATrio(first);

    const locked = waitForTriosState(bob, (s) => s.lockedOutMs > 0);
    bob.emit('trios:claim', roomId, wrong);
    const view = await locked;
    expect(view.myMiss).toEqual(wrong);
    expect(view.playerList[bob.playerId]!.points).toBe(0);
    expect(view.phase).toBe('finding');
    await settle();
    expect(alice.state).toMatchObject({ lockedOutMs: 0, myMiss: [] });

    // Locked out, even a trio is not taken.
    bob.emit('trios:claim', roomId, aTrio(first));
    await settle();
    expect(triosRoom(harness, roomId).game.found).toBe(0);

    // And when the lockout ends, it is.
    const free = await waitForTriosState(bob, (s) => s.lockedOutMs === 0);
    expect(free.myMiss).toEqual([]);
    const taken = waitForTriosState(bob, (s) => s.found === 1);
    bob.emit('trios:claim', roomId, aTrio(first));
    expect((await taken).playerList[bob.playerId]!.points).toBe(1);
  });

  it('drops a claim that lost the race, with no lockout', async () => {
    const { roomId, players, first } = await playToFirstTable(harness);
    const [alice, bob] = players;
    const cards = aTrio(first);

    const taken = waitForTriosState(bob, (s) => s.phase === 'taken');
    alice.emit('trios:claim', roomId, cards);
    // The same trio a moment later, during the taken pause.
    bob.emit('trios:claim', roomId, cards);
    await taken;
    await settle();
    expect(triosRoom(harness, roomId).game.lockouts.size).toBe(0);

    // After the refill, a card no longer on the table.
    const next = await waitForTriosState(bob, (s) => s.phase === 'finding');
    const [, b, c] = aTrio(next);
    bob.emit('trios:claim', roomId, [cards[0]!, b, c]);
    await settle();
    const game = triosRoom(harness, roomId).game;
    expect(game.found).toBe(1);
    expect(game.lockouts.size).toBe(0);
    expect(bob.state).toMatchObject({ lockedOutMs: 0 });
  });

  it('ignores the same card twice, and a claim from outside the room', async () => {
    const { roomId, players, first } = await playToFirstTable(harness);
    const [a, b] = aTrio(first);
    const room = triosRoom(harness, roomId);

    const stranger = await harness.connect();
    stranger.emit('trios:claim', roomId, aTrio(first));
    players[0].emit('trios:claim', roomId, [a, a, b]);
    await settle();
    expect(room.game.found).toBe(0);
    expect(room.game.lockouts.size).toBe(0);
  });
});

describe('the hints', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('mark one card of a trio, then a second of the same one, then stop', async () => {
    const { roomId, owner } = await playToFirstTable(harness);

    const one = await waitForTriosState(owner, (s) => s.hint.length === 1);
    expect(one.phaseEndsInMs).toBeGreaterThan(0);
    const two = await waitForTriosState(owner, (s) => s.hint.length === 2);
    expect(two.hint[0]).toBe(one.hint[0]);
    expect(two.phaseEndsInMs).toBe(0);
    // With no clock left to count down, how long the table has gone without
    // a trio: two hints' worth.
    expect(two.searchingMs).toBeGreaterThanOrEqual(1500);

    expect(
      findTrios(two.table).some((trio) =>
        two.hint.every((place) => trio.includes(place)),
      ),
    ).toBe(true);

    await settle(1000);
    expect(triosRoom(harness, roomId).game.hint).toHaveLength(2);
  });

  it('are cleared when a trio is taken', async () => {
    const { roomId, players, owner } = await playToFirstTable(harness);
    const hinted = await waitForTriosState(owner, (s) => s.hint.length === 1);

    const taken = waitForTriosState(owner, (s) => s.phase === 'taken');
    players[1].emit('trios:claim', roomId, aTrio(hinted));
    expect(await taken).toMatchObject({ hint: [], searchingMs: 0 });
    const next = await waitForTriosState(owner, (s) => s.phase === 'finding');
    expect(next.hint).toEqual([]);
    expect(next.searchingMs).toBeLessThan(800);
    expect(next.phaseEndsInMs).toBeGreaterThan(0);
  });
});

describe('a Trios game', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('ends with its last trio, and reopens the room', async () => {
    const { roomId, players, owner, first } = await playToFirstTable(harness);
    const [alice, bob] = players;
    const messages = collectChat(owner);

    let state = first;
    for (let trio = 1; trio <= 10; trio++) {
      const finder = trio % 3 === 0 ? alice : bob;
      const done = waitForTriosState(
        owner,
        (s) => s.found === trio && s.phase !== 'finding',
      );
      finder.emit('trios:claim', roomId, aTrio(state));
      const taken = await done;
      if (trio < 10) {
        state = await waitForTriosState(
          owner,
          (s) => s.phase === 'finding' && s.found === trio,
        );
      } else {
        state = taken;
      }
    }

    const over = await waitForTriosState(owner, (s) => s.lastGame !== null);
    expect(over).toMatchObject({
      phase: 'waiting',
      isGameStarted: false,
      status: 'Open',
      found: 10,
      hint: [],
    });
    // The last table stays, with the last trio still on it.
    expect(over.table).toHaveLength(12);
    expect(
      over.lastTrio?.cards.every((card) => over.table.includes(card)),
    ).toBe(true);
    expect(over.lastGame).toMatchObject({
      endedEarly: false,
      trios: 10,
      found: 10,
    });
    expect(over.lastGame!.standings).toEqual([
      { playerId: bob.playerId, username: 'Bob', points: 7 },
      { playerId: alice.playerId, username: 'Alice', points: 3 },
    ]);
    await settle();
    expect(messages.filter((m) => m.kind === 'score')).toHaveLength(10);
    expect(messages.at(-1)!.kind).toBe('success');
    expect(textOf(messages.at(-1)!)).toBe('Game over: Bob wins with 7 trios!');
  });

  it('ends early when too few players are left', async () => {
    const { roomId, players, owner, first } = await playToFirstTable(harness);
    const found = waitForTriosState(owner, (s) => s.found === 1);
    players[1].emit('trios:claim', roomId, aTrio(first));
    await found;

    const endChat = collectChat(owner);
    const over = waitForTriosState(owner, (s) => s.lastGame !== null);
    players[1].emit('room:leave', roomId);
    expect((await over).lastGame).toMatchObject({ endedEarly: true, found: 1 });
    // One notice says it ended early; no result for a game nobody finished.
    await settle();
    expect(endNotices(endChat)).toEqual(['game:interrupted']);
  });

  it('keeps a lockout through a refresh', async () => {
    const { roomId, players, first } = await playToFirstTable(harness);
    const bob = players[1];
    const locked = waitForTriosState(bob, (s) => s.lockedOutMs > 0);
    bob.emit('trios:claim', roomId, notATrio(first));
    await locked;

    const again = await harness.reload(bob);
    const synced = waitForTriosState(again, (s) => s.lockedOutMs > 0);
    await request(again, 'room:sync', roomId);
    expect((await synced).myMiss).toHaveLength(3);
  });
});
