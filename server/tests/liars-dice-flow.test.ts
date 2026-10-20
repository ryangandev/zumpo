import {
  textOf,
  seatTable,
  TWO_NAMES,
  type ClientsFor,
} from './helpers/test-server.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LiarsDiceRoomState } from '../models/types.js';
import {
  collectChat,
  createLiarsDiceRoom,
  liarsDiceRoom,
  lobbyView,
  request,
  settle,
  startGame,
  startTestServer,
  waitForChat,
  waitForLiarsDiceState,
  type TestClient,
  type TestServer,
} from './helpers/test-server.js';

/**
 * Seats `names` in a Liar's Dice room, the first as its owner, and starts the
 * game. The order of play is shuffled, so no test may assume who goes first;
 * `byId` and `first.turnPlayerId` say who it is.
 */
async function playToFirstTurn<
  const Names extends readonly [string, ...string[]] = typeof TWO_NAMES,
>(
  harness: TestServer,
  names: Names = TWO_NAMES as unknown as Names,
  dicePerPlayer = 3,
) {
  const { roomId, players, owner } = await seatTable(
    harness,
    names,
    (creator, username) =>
      createLiarsDiceRoom(creator, { username, dicePerPlayer }),
  );

  const turn = waitForLiarsDiceState(owner, (s) => s.phase === 'bidding');
  await startGame(owner, roomId);
  const first = await turn;

  const byId = (playerId: string | null) =>
    players.find((player) => player.playerId === playerId)!;
  const game = () => liarsDiceRoom(harness, roomId).game;
  /** The server's turn order, as clients. */
  const order = () => game().order.map(byId) as ClientsFor<Names>;
  return { roomId, players, owner, first, byId, game, order };
}

/** Sets every cup, in turn order, so a call can be played deliberately. */
function rig(
  game: { order: string[]; dice: Record<string, number[]> },
  cups: number[][],
) {
  game.order.forEach((playerId, index) => {
    game.dice[playerId] = cups[index]!;
  });
}

const bid = (player: TestClient, roomId: string, count: number, face: number) =>
  player.emit('ld:bid', roomId, count, face);

const turnOf = (watcher: TestClient, player: TestClient) =>
  waitForLiarsDiceState(
    watcher,
    (s) => s.phase === 'bidding' && s.turnPlayerId === player.playerId,
  );

const cupOf = (state: LiarsDiceRoomState, player: TestClient) =>
  state.cups.find((cup) => cup.playerId === player.playerId)!;

describe('a Liar’s Dice room', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('lists its dice in its own lobby', async () => {
    const client = await harness.connect();
    const roomId = await createLiarsDiceRoom(client, { dicePerPlayer: 5 });

    expect(await lobbyView(client, roomId, 'liars-dice')).toMatchObject({
      gameType: 'liars-dice',
      dicePerPlayer: 5,
    });
  });

  it('refuses any other number of dice, and more than six seats', async () => {
    const client = await harness.connect();
    const create = (settings: unknown, maxPlayers = 4) =>
      request(client, 'room:create', {
        gameType: 'liars-dice',
        roomName: 'Tavern',
        username: 'Ada',
        maxPlayers,
        password: '',
        settings,
      });

    expect((await create({ dicePerPlayer: 4 })).error?.type).toBe(
      'invalidRequest',
    );
    expect((await create({ dicePerPlayer: '3' })).ok).toBe(false);
    expect((await create({ dicePerPlayer: 3 }, 7)).ok).toBe(false);
    expect(harness.server.rooms.size).toBe(0);
  });

  it('waits with nobody at the table before the first game', async () => {
    const client = await harness.connect();
    const first = waitForLiarsDiceState(client);
    await createLiarsDiceRoom(client);

    expect(await first).toMatchObject({
      phase: 'waiting',
      dicePerPlayer: 3,
      round: 0,
      cups: [],
      bids: [],
      turnPlayerId: null,
      nextPlayerId: null,
      reveal: null,
      lastGame: null,
    });
  });

  it('rolls everybody their dice, and shows each player only their own', async () => {
    const { players, first, byId } = await playToFirstTurn(
      harness,
      ['Alice', 'Bob', 'Cleo'],
      5,
    );

    await settle();
    expect(first.round).toBe(1);
    expect(first.phaseEndsInMs).toBeGreaterThan(0);
    expect(first.cups).toHaveLength(3);
    expect(first.cups.every((cup) => cup.diceLeft === 5)).toBe(true);
    for (const player of players) {
      const view = player.state as LiarsDiceRoomState;
      const own = cupOf(view, player).dice!;
      expect(own).toHaveLength(5);
      expect(own.every((die) => die >= 1 && die <= 6)).toBe(true);
      const others = view.cups.filter((cup) => cup !== cupOf(view, player));
      expect(others.map((cup) => cup.dice)).toEqual([null, null]);
      expect(view.playerList[player.playerId]!.points).toBe(5);
    }
    // The table is in turn order, and the first in it opens.
    expect(first.turnPlayerId).toBe(first.cups[0]!.playerId);
    expect(first.nextPlayerId).toBe(first.cups[1]!.playerId);
    expect(byId(first.turnPlayerId)).toBeDefined();
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

  it('takes a raise from the player whose turn it is, and passes the turn', async () => {
    const { roomId, owner, order } = await playToFirstTurn(harness);
    const [opener, second] = order();

    const passed = turnOf(owner, second);
    bid(opener, roomId, 2, 4);
    const state = await passed;

    expect(state.bids).toEqual([
      { playerId: opener.playerId, count: 2, face: 4 },
    ]);
    expect(state.nextPlayerId).toBe(opener.playerId);
  });

  it('ignores a bid out of turn, a bid that is not a raise, and an early call', async () => {
    const { roomId, owner, order } = await playToFirstTurn(harness);
    const [opener, second] = order();

    bid(second, roomId, 2, 4);
    opener.emit('ld:call', roomId);
    bid(opener, roomId, 7, 4); // more dice than the table's six
    bid(opener, roomId, 2, 1); // ones are never bid
    await settle();
    expect((owner.state as LiarsDiceRoomState).bids).toEqual([]);

    const passed = turnOf(owner, second);
    bid(opener, roomId, 3, 4);
    await passed;
    bid(second, roomId, 3, 3);
    bid(second, roomId, 2, 6);
    await settle();
    expect((owner.state as LiarsDiceRoomState).bids).toHaveLength(1);
    expect((owner.state as LiarsDiceRoomState).turnPlayerId).toBe(
      second.playerId,
    );
  });
});

describe('a call', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('opens every cup, and costs the caller a die when the bid stands', async () => {
    const { roomId, owner, players, order, game } =
      await playToFirstTurn(harness);
    const [opener, second] = order();
    rig(game(), [
      [5, 1, 3],
      [5, 2, 6],
    ]);

    const passed = turnOf(owner, second);
    bid(opener, roomId, 3, 5);
    await passed;

    const said = waitForChat(owner, (m) => textOf(m).includes('called Liar'));
    const revealed = waitForLiarsDiceState(owner, (s) => s.phase === 'reveal');
    second.emit('ld:call', roomId);
    const state = await revealed;

    expect(state.reveal).toEqual({
      bid: { playerId: opener.playerId, count: 3, face: 5 },
      callerId: second.playerId,
      matched: 3,
      wild: 1,
      loserId: second.playerId,
      out: false,
    });
    expect(state.turnPlayerId).toBeNull();
    expect(cupOf(state, second).diceLeft).toBe(2);
    expect(cupOf(state, opener).diceLeft).toBe(3);
    await settle();
    // Every cup is open to everybody, as rolled.
    for (const player of players) {
      const view = player.state as LiarsDiceRoomState;
      expect(cupOf(view, opener).dice).toEqual([5, 1, 3]);
      expect(cupOf(view, second).dice).toEqual([5, 2, 6]);
    }
    expect(textOf(await said)).toMatch(
      /called Liar on three 5s: there were three\. \w+ loses a die\./,
    );
  });

  it('costs the bidder a die when it was a lie, and the loser opens the next round', async () => {
    const { roomId, owner, order, game } = await playToFirstTurn(harness);
    const [opener, second] = order();
    rig(game(), [
      [2, 3, 4],
      [6, 6, 2],
    ]);

    const passed = turnOf(owner, second);
    bid(opener, roomId, 2, 5);
    await passed;
    const revealed = waitForLiarsDiceState(owner, (s) => s.phase === 'reveal');
    second.emit('ld:call', roomId);
    expect((await revealed).reveal).toMatchObject({
      matched: 0,
      loserId: opener.playerId,
    });

    const next = await waitForLiarsDiceState(
      owner,
      (s) => s.phase === 'bidding' && s.round === 2,
    );
    expect(next.turnPlayerId).toBe(opener.playerId);
    expect(next.bids).toEqual([]);
    expect(next.reveal).toBeNull();
    expect(game().dice[opener.playerId]).toHaveLength(2);
    expect(game().dice[second.playerId]).toHaveLength(3);
    await settle();
    const openersView = opener.state as LiarsDiceRoomState;
    expect(cupOf(openersView, opener).dice).toHaveLength(2);
    expect(cupOf(openersView, second).dice).toBeNull();
  });
});

describe('the clock', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('bids one 2 for an opener who runs out of time, then calls Liar for the next', async () => {
    const { owner, order, game } = await playToFirstTurn(harness);
    const [opener, second] = order();
    rig(game(), [
      [3, 3, 3],
      [4, 4, 4],
    ]);

    const opened = await turnOf(owner, second);
    expect(opened.bids).toEqual([
      { playerId: opener.playerId, count: 1, face: 2 },
    ]);

    const revealed = await waitForLiarsDiceState(
      owner,
      (s) => s.phase === 'reveal',
    );
    // Nobody holds a 2 or a 1, so the called bid was a lie.
    expect(revealed.reveal).toMatchObject({
      callerId: second.playerId,
      matched: 0,
      loserId: opener.playerId,
    });
  });

  it('does not skip a player who is away, and plays their turn when it runs out', async () => {
    // A seat held for longer than the turn, as a real refresh would be.
    await harness.teardown();
    harness = await startTestServer(undefined, 5);
    const { roomId, owner, order, players } = await playToFirstTurn(harness, [
      'Alice',
      'Bob',
    ]);
    const [opener, second] = order();
    const watcher = players.find((p) => p !== second) ?? owner;

    second.disconnect();
    await settle();
    const away = waitForLiarsDiceState(
      watcher,
      (s) => s.phase === 'bidding' && s.bids.length === 1,
    );
    bid(opener, roomId, 1, 6);
    expect((await away).turnPlayerId).toBe(second.playerId);

    const revealed = await waitForLiarsDiceState(
      watcher,
      (s) => s.phase === 'reveal',
    );
    expect(revealed.reveal?.callerId).toBe(second.playerId);
  });
});

describe('the end of a game', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('ends when one player has dice left, placing the others by how long they lasted', async () => {
    const { roomId, owner, order, game, players } = await playToFirstTurn(
      harness,
      ['Alice', 'Bob', 'Cleo'],
    );
    const [a, b, c] = order();
    const chat = collectChat(owner);

    // b holds one die, c one die, a three; every call below is a lie.
    const server = liarsDiceRoom(harness, roomId);
    server.playerList[b.playerId]!.points = 1;
    server.playerList[c.playerId]!.points = 1;
    rig(game(), [[2, 2, 2], [3], [4]]);

    // Five dice on the table, and not one 6 or 1: four 6s is a lie.
    let next = turnOf(owner, b);
    bid(a, roomId, 4, 6);
    await next;
    // b calls: a loses a die, nobody is out.
    let revealed = waitForLiarsDiceState(owner, (s) => s.phase === 'reveal');
    b.emit('ld:call', roomId);
    expect((await revealed).reveal?.loserId).toBe(a.playerId);

    // a opens round 2; c's one die is all c has.
    await waitForLiarsDiceState(
      owner,
      (s) => s.phase === 'bidding' && s.round === 2,
    );
    rig(game(), [[2, 2], [3], [4]]);
    next = turnOf(owner, b);
    bid(a, roomId, 1, 5);
    await next;
    next = turnOf(owner, c);
    bid(b, roomId, 2, 5);
    await next;
    revealed = waitForLiarsDiceState(owner, (s) => s.phase === 'reveal');
    c.emit('ld:call', roomId);
    expect((await revealed).reveal).toMatchObject({
      loserId: b.playerId,
      out: true,
    });

    // b is out, so c, the next still in, opens round 3.
    const round3 = await waitForLiarsDiceState(
      owner,
      (s) => s.phase === 'bidding' && s.round === 3,
    );
    expect(round3.turnPlayerId).toBe(c.playerId);
    expect(cupOf(round3, b).diceLeft).toBe(0);
    expect(round3.cups).toHaveLength(3);
    rig(game(), [[2, 2], [], [4]]);
    next = turnOf(owner, a);
    bid(c, roomId, 3, 6);
    await next;

    const over = waitForLiarsDiceState(owner, (s) => s.lastGame !== null);
    a.emit('ld:call', roomId);
    const ended = await over;

    expect(ended.phase).toBe('waiting');
    expect(ended.isGameStarted).toBe(false);
    expect(ended.reveal).toMatchObject({ loserId: c.playerId, out: true });
    expect(ended.cups.map((cup) => cup.outInRound)).toEqual(
      ended.cups.map(
        (cup) =>
          ({ [a.playerId]: null, [b.playerId]: 2, [c.playerId]: 3 })[
            cup.playerId
          ],
      ),
    );
    expect(ended.lastGame).toMatchObject({
      endedEarly: false,
      dicePerPlayer: 3,
      rounds: 3,
      standings: [
        { playerId: a.playerId, points: 2, outInRound: null },
        { playerId: c.playerId, points: 0, outInRound: 3 },
        { playerId: b.playerId, points: 0, outInRound: 2 },
      ],
    });
    // The last reveal stays open on the table for everybody.
    await settle();
    for (const player of players) {
      const view = player.state as LiarsDiceRoomState;
      expect(cupOf(view, a).dice).toEqual([2, 2]);
      expect(cupOf(view, c).dice).toEqual([4]);
    }
    const winner = ['Alice', 'Bob', 'Cleo'][players.indexOf(a)];
    expect(chat.map((m) => textOf(m))).toContain(
      `Game over: ${winner} wins with 2 dice left!`,
    );
  });
});

describe('leaving', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it.each([
    ['the player whose turn it is', 2, 0],
    ['somebody else', 0, 2],
  ])(
    'calls a round off when %s leaves mid-bidding, and rolls again',
    async (_who, leaving, opening) => {
      const { roomId, owner, order, game } = await playToFirstTurn(harness, [
        'Alice',
        'Bob',
        'Cleo',
      ]);
      const seats = order();
      const watcher = seats[1];
      let next = turnOf(owner, seats[1]);
      bid(seats[0], roomId, 1, 3);
      await next;
      next = turnOf(owner, seats[2]);
      bid(seats[1], roomId, 2, 3);
      await next;

      const rerolled = waitForLiarsDiceState(
        watcher,
        (s) => s.bids.length === 0 && s.cups.length === 2,
      );
      seats[leaving]!.emit('room:leave', roomId);
      const state = await rerolled;

      // The bids were about dice that are gone: same round, fresh dice.
      expect(state.round).toBe(1);
      expect(state.phase).toBe('bidding');
      expect(state.reveal).toBeNull();
      expect(game().dice[seats[leaving]!.playerId]).toBeUndefined();
      expect(state.turnPlayerId).toBe(seats[opening]!.playerId);
    },
  );

  it('keeps the round going when a player already out leaves', async () => {
    const { roomId, owner, order, game } = await playToFirstTurn(harness, [
      'Alice',
      'Bob',
      'Cleo',
    ]);
    const [a, b, c] = order();
    // c is out: no dice left, and none rolled this round.
    liarsDiceRoom(harness, roomId).playerList[c.playerId]!.points = 0;
    delete game().dice[c.playerId];
    const next = turnOf(owner, b);
    bid(a, roomId, 1, 3);
    await next;

    const chat = collectChat(owner);
    c.emit('room:leave', roomId);
    await settle();

    const state = game();
    expect(state.bids).toHaveLength(1);
    expect(state.turnPlayerId).toBe(b.playerId);
    expect(chat.some((m) => m.notice?.type === 'ld:reroll')).toBe(false);
  });

  it('ends the game early when fewer than two players are left', async () => {
    const { roomId, owner, players } = await playToFirstTurn(harness);
    const guest = players.find((p) => p !== owner)!;

    const over = waitForLiarsDiceState(owner, (s) => s.lastGame !== null);
    guest.emit('room:leave', roomId);
    const ended = await over;

    expect(ended.lastGame).toMatchObject({
      endedEarly: true,
      standings: [{ playerId: owner.playerId, points: 3, outInRound: null }],
    });
    expect(ended.isGameStarted).toBe(false);
  });
});
