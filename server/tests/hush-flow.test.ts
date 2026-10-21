import { textOf, seatTable, TWO_NAMES } from './helpers/test-server.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HushRoomState } from '../models/types.js';
import {
  collectChat,
  createHushRoom,
  hushRoom,
  joinRoom,
  lobbyView,
  request,
  settle,
  startGame,
  startTestServer,
  waitForChat,
  waitForHushState,
  type TestClient,
  type TestServer,
} from './helpers/test-server.js';

/** Matches the harness default; short enough to watch a seat expire. */
const GRACE_MS = 600;

/** Seats `names` in a Hush room, the first as its owner. */
function seat<const Names extends readonly [string, ...string[]]>(
  harness: TestServer,
  names: Names,
) {
  return seatTable(harness, names, (owner, username) =>
    createHushRoom(owner, { username }),
  );
}

/** Everybody presses Ready, and the level opens after its countdown. */
async function readyAll(
  players: readonly [TestClient, ...TestClient[]],
  roomId: string,
) {
  const playing = waitForHushState(players[0], (s) => s.phase === 'playing');
  for (const player of players) player.emit('hush:ready', roomId);
  return playing;
}

/** Seats `names`, starts a game and plays level 1 open. */
async function playToLevel<
  const Names extends readonly [string, ...string[]] = typeof TWO_NAMES,
>(harness: TestServer, names: Names = TWO_NAMES as unknown as Names) {
  const seated = await seat(harness, names);
  const ready = waitForHushState(seated.owner, (s) => s.phase === 'ready');
  await startGame(seated.owner, seated.roomId);
  await ready;
  const first = await readyAll(seated.players, seated.roomId);
  return { ...seated, first };
}

/**
 * Deals the level again by hand, keyed by seat, so that a test can play a
 * mistake on purpose: who holds what is decided on the server alone.
 */
function rig(
  harness: TestServer,
  roomId: string,
  players: readonly TestClient[],
  hands: readonly (readonly number[])[],
) {
  hushRoom(harness, roomId).game.hands = Object.fromEntries(
    players.map((player, index) => [player.playerId, [...hands[index]!]]),
  );
}

/** The next snapshot with `count` cards on the pile. */
const pileOf = (watcher: TestClient, count: number) =>
  waitForHushState(watcher, (s) => s.pile.length === count);

/** Plays every card still held, lowest first, as a team that never slips. */
async function playClean(
  harness: TestServer,
  roomId: string,
  players: readonly TestClient[],
) {
  const { game } = hushRoom(harness, roomId);
  const plays = Object.entries(game.hands)
    .flatMap(([playerId, cards]) => cards.map((card) => ({ playerId, card })))
    .toSorted((a, b) => a.card - b.card);
  for (const { playerId, card } of plays) {
    const landed = waitForHushState(players[0]!, (s) =>
      s.pile.some((play) => play.card === card),
    );
    players
      .find((player) => player.playerId === playerId)!
      .emit('hush:play', roomId, card);
    await landed;
  }
}

describe('a Hush room', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('is listed in its own lobby', async () => {
    const client = await harness.connect();
    const roomId = await createHushRoom(client);

    expect(await lobbyView(client, roomId, 'hush')).toMatchObject({
      gameType: 'hush',
      maxPlayers: 4,
    });
  });

  it('refuses any setting, and more than four seats or fewer than two', async () => {
    const client = await harness.connect();
    const create = (settings: unknown, maxPlayers = 4) =>
      request(client, 'room:create', {
        gameType: 'hush',
        roomName: 'Quiet corner',
        username: 'Ada',
        maxPlayers,
        password: '',
        settings,
      });

    expect((await create({ levels: 3 })).error?.type).toBe('invalidRequest');
    expect((await create({}, 5)).ok).toBe(false);
    expect((await create({}, 1)).ok).toBe(false);
    expect(Object.keys(harness.server.rooms)).toEqual([]);
  });

  it('waits with no cards, and says how long a game would be', async () => {
    const [alice, bob, cat] = [
      await harness.connect(),
      await harness.connect(),
      await harness.connect(),
    ];
    const first = waitForHushState(alice);
    const roomId = await createHushRoom(alice, { username: 'Alice' });

    expect(await first).toMatchObject({
      phase: 'waiting',
      level: 0,
      levels: 7,
      lives: 3,
      hand: [],
      pile: [],
      discards: [],
      lastMistake: null,
      lastLevel: null,
      lastGame: null,
      phaseEndsInMs: 0,
    });

    await joinRoom(bob, roomId, 'Bob');
    const three = waitForHushState(alice, (s) => s.currentPlayerCount === 3);
    await joinRoom(cat, roomId, 'Cat');
    expect((await three).levels).toBe(6);
  });

  it('starts only by its owner, and only with two players', async () => {
    const { roomId, players, owner } = await seat(harness, ['Alice', 'Bob']);
    const alone = await harness.connect();
    const lonelyRoom = await createHushRoom(alone);

    expect((await request(alone, 'game:start', lonelyRoom)).error?.type).toBe(
      'notEnoughPlayers',
    );
    expect((await request(players[1], 'game:start', roomId)).error?.type).toBe(
      'notRoomOwner',
    );

    const chat = waitForChat(owner, (m) => textOf(m).startsWith('Game has'));
    const ready = waitForHushState(owner, (s) => s.phase === 'ready');
    await startGame(owner, roomId);
    expect(await ready).toMatchObject({
      isGameStarted: true,
      level: 1,
      levels: 7,
      lives: 3,
      hand: [],
      phaseEndsInMs: 0,
    });
    expect(textOf(await chat)).toBe(
      'Game has started! 7 levels and 3 lives. Not a word while a level is played.',
    );
  });
});

describe('a level', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('deals nothing until everybody is ready, then counts down and opens', async () => {
    const { roomId, players, owner } = await seat(harness, [
      'Alice',
      'Bob',
      'Cat',
    ]);
    const [alice, bob, cat] = players;
    const ready = waitForHushState(owner, (s) => s.phase === 'ready');
    await startGame(owner, roomId);
    await ready;

    const marked = waitForHushState(
      cat,
      (s) => s.table[alice.playerId]!.ready && s.table[bob.playerId]!.ready,
    );
    alice.emit('hush:ready', roomId);
    alice.emit('hush:ready', roomId);
    bob.emit('hush:ready', roomId);
    const waiting = await marked;
    expect(waiting.phase).toBe('ready');
    expect(waiting.table[cat.playerId]).toEqual({ held: 0, ready: false });
    expect(hushRoom(harness, roomId).game.hands).toEqual({});

    const countdown = waitForHushState(bob, (s) => s.phase === 'countdown');
    const playing = waitForHushState(bob, (s) => s.phase === 'playing');
    cat.emit('hush:ready', roomId);
    const counting = await countdown;
    expect(counting.phaseEndsInMs).toBeGreaterThan(0);
    expect(counting.hand).toHaveLength(1);

    const open = await playing;
    expect(open.phaseEndsInMs).toBe(0);
    expect(open.level).toBe(1);
  });

  it('shows each player their own hand, and only counts of the others', async () => {
    await harness.teardown();
    harness = await startTestServer();
    const { roomId, players, owner } = await seat(harness, ['Alice', 'Bob']);
    const ready = waitForHushState(owner, (s) => s.phase === 'ready');
    await startGame(owner, roomId);
    await ready;

    const views = players.map((player) =>
      waitForHushState(player, (s) => s.phase === 'countdown'),
    );
    for (const player of players) player.emit('hush:ready', roomId);
    const seen: HushRoomState[] = await Promise.all(views);
    const { hands } = hushRoom(harness, roomId).game;

    for (const [index, player] of players.entries()) {
      const view = seen[index];
      expect(view!.hand).toEqual(hands[player.playerId]);
      expect(view!.table).toEqual({
        [players[0].playerId]: { held: 1, ready: true },
        [players[1].playerId]: { held: 1, ready: true },
      });
      // Nothing in the snapshot names the other hand.
      const other = players[1 - index]!.playerId;
      expect(JSON.stringify(view)).not.toContain(JSON.stringify(hands[other]));
    }
  });

  it('plays only your lowest card, only while the level is open', async () => {
    const { roomId, players, owner } = await seat(harness, ['Alice', 'Bob']);
    const [alice, bob] = players;
    const ready = waitForHushState(owner, (s) => s.phase === 'ready');
    await startGame(owner, roomId);
    await ready;

    // Not in `ready`, nor in the countdown.
    const countdown = waitForHushState(alice, (s) => s.phase === 'countdown');
    alice.emit('hush:ready', roomId);
    bob.emit('hush:ready', roomId);
    await countdown;
    rig(harness, roomId, players, [
      [10, 30],
      [20, 40],
    ]);
    alice.emit('hush:play', roomId, 10);
    await waitForHushState(alice, (s) => s.phase === 'playing');
    expect(hushRoom(harness, roomId).game.pile).toEqual([]);

    // Not a card you do not hold, nor one that is not your lowest.
    alice.emit('hush:play', roomId, 20);
    alice.emit('hush:play', roomId, 30);
    await settle();
    expect(hushRoom(harness, roomId).game.pile).toEqual([]);

    const landed = pileOf(bob, 1);
    alice.emit('hush:play', roomId, 10);
    // A double tap is the same card again, which is no longer held.
    alice.emit('hush:play', roomId, 10);
    const view = await landed;
    expect(view.pile).toEqual([{ card: 10, playerId: alice.playerId }]);
    expect(view.table[alice.playerId]!.held).toBe(1);
    await settle();
    expect(hushRoom(harness, roomId).game.pile).toHaveLength(1);
    expect(hushRoom(harness, roomId).game.hands[alice.playerId]).toEqual([30]);
  });

  it('has no clock while it is played: an idle table simply waits', async () => {
    const { roomId, first } = await playToLevel(harness);
    expect(first.phaseEndsInMs).toBe(0);
    await settle(800);
    expect(hushRoom(harness, roomId).game.phase).toBe('playing');
  });

  it('is cleared when every card is played, without a slip', async () => {
    const { roomId, players, owner } = await playToLevel(harness);
    const chat = waitForChat(owner, (m) => m.kind === 'score');
    const cleared = waitForHushState(owner, (s) => s.phase === 'cleared');
    await playClean(harness, roomId, players);

    const view = await cleared;
    expect(view.lastLevel).toEqual({
      level: 1,
      livesLost: 0,
      lifeBack: false,
      cleared: true,
    });
    expect(view.lives).toBe(3);
    expect(view.pile).toHaveLength(2);
    expect(view.phaseEndsInMs).toBeGreaterThan(0);
    expect(view.playerList[players[0].playerId]!.points).toBe(1);
    expect(view.playerList[players[1].playerId]!.points).toBe(1);
    expect(textOf(await chat)).toBe('Level 1 cleared without a slip!');

    const next = await waitForHushState(owner, (s) => s.phase === 'ready');
    expect(next).toMatchObject({
      level: 2,
      pile: [],
      discards: [],
      hand: [],
      lastLevel: null,
    });
  });
});

describe('a mistake', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('costs one life, shows and discards every card under it, and stops play', async () => {
    const { roomId, players } = await playToLevel(harness, [
      'Maya',
      'Ryan',
      'Sam',
    ]);
    const [maya, ryan, sam] = players;
    rig(harness, roomId, players, [[52, 80], [47, 51, 90], [49]]);

    const alert = waitForChat(sam, (m) => m.kind === 'alert');
    const mistake = waitForHushState(sam, (s) => s.phase === 'mistake');
    maya.emit('hush:play', roomId, 52);
    const view = await mistake;

    const discarded = [
      { card: 47, playerId: ryan.playerId, reason: 'mistake' },
      { card: 49, playerId: sam.playerId, reason: 'mistake' },
      { card: 51, playerId: ryan.playerId, reason: 'mistake' },
    ];
    expect(view).toMatchObject({
      lives: 2,
      pile: [{ card: 52, playerId: maya.playerId }],
      discards: discarded,
      lastMistake: { playerId: maya.playerId, card: 52, discarded },
      hand: [],
    });
    expect(view.phaseEndsInMs).toBeGreaterThan(0);
    expect(view.table[ryan.playerId]!.held).toBe(1);
    expect(textOf(await alert)).toBe(
      'Maya played 52, but Ryan held 47 and 51 and Sam held 49.',
    );

    // Nobody plays while it is on show.
    maya.emit('hush:play', roomId, 80);
    await settle(100);
    expect(hushRoom(harness, roomId).game.pile).toHaveLength(1);

    const open = await waitForHushState(sam, (s) => s.phase === 'playing');
    expect(open.lastMistake).toBeNull();
    expect(open.discards).toEqual(discarded);
  });

  it('costs one life once: a play that arrives after it is nothing', async () => {
    const { roomId, players, owner } = await playToLevel(harness, [
      'Maya',
      'Ryan',
    ]);
    const [maya, ryan] = players;
    rig(harness, roomId, players, [[40, 70], [38]]);

    const mistake = waitForHushState(owner, (s) => s.phase === 'mistake');
    maya.emit('hush:play', roomId, 40);
    await mistake;
    // Ryan's 38, a moment too late: no longer his, and play is stopped.
    ryan.emit('hush:play', roomId, 38);
    const open = await waitForHushState(owner, (s) => s.phase === 'playing');
    expect(open.lives).toBe(2);
    expect(open.pile).toEqual([{ card: 40, playerId: maya.playerId }]);

    ryan.emit('hush:play', roomId, 38);
    await settle();
    expect(hushRoom(harness, roomId).game.lives).toBe(2);
    expect(hushRoom(harness, roomId).game.pile).toHaveLength(1);
  });

  it('that empties every hand clears the level, not cleanly', async () => {
    const { roomId, players, owner } = await playToLevel(harness);
    rig(harness, roomId, players, [[60], [30]]);
    const chat = collectChat(owner);

    const cleared = waitForHushState(owner, (s) => s.phase === 'cleared');
    players[0].emit('hush:play', roomId, 60);
    const view = await cleared;
    expect(view.lives).toBe(2);
    expect(view.lastLevel).toEqual({
      level: 1,
      livesLost: 1,
      lifeBack: false,
      cleared: true,
    });
    expect(chat.map((m) => textOf(m))).toEqual([
      'Alice played 60, but Bob held 30.',
      'Level 1 cleared!',
    ]);
  });

  it('is won back by a clean level, never above three lives', async () => {
    const { roomId, players, owner } = await playToLevel(harness);
    rig(harness, roomId, players, [[60], [30]]);
    players[0].emit('hush:play', roomId, 60);
    await waitForHushState(owner, (s) => s.phase === 'ready' && s.level === 2);

    await readyAll(players, roomId);
    const chat = waitForChat(owner, (m) => m.kind === 'score');
    const cleared = waitForHushState(owner, (s) => s.phase === 'cleared');
    await playClean(harness, roomId, players);
    const view = await cleared;
    expect(view.lives).toBe(3);
    expect(view.lastLevel).toMatchObject({ level: 2, lifeBack: true });
    expect(textOf(await chat)).toBe(
      'Level 2 cleared without a slip: a life back!',
    );

    await waitForHushState(owner, (s) => s.phase === 'ready' && s.level === 3);
    await readyAll(players, roomId);
    const again = waitForHushState(owner, (s) => s.phase === 'cleared');
    await playClean(harness, roomId, players);
    expect(await again).toMatchObject({
      lives: 3,
      lastLevel: { level: 3, lifeBack: false },
    });
  });
});

describe('the chat', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('is open before a level and locked while it is played', async () => {
    const { roomId, players, owner } = await seat(harness, ['Alice', 'Bob']);
    const [alice, bob] = players;
    const ready = waitForHushState(owner, (s) => s.phase === 'ready');
    await startGame(owner, roomId);
    await ready;

    const nudge = waitForChat(bob, (m) => m.kind === 'player');
    alice.emit('chat:send', roomId, 'ready when you are');
    expect(textOf(await nudge)).toBe('ready when you are');

    const countdown = waitForHushState(alice, (s) => s.phase === 'countdown');
    const playing = waitForHushState(alice, (s) => s.phase === 'playing');
    const heard = collectChat(bob);
    alice.emit('hush:ready', roomId);
    bob.emit('hush:ready', roomId);
    await countdown;
    alice.emit('chat:send', roomId, 'mine is low');
    await playing;
    alice.emit('chat:send', roomId, 'go now');
    await settle();
    expect(heard.filter((m) => m.kind === 'player')).toEqual([]);

    const cleared = waitForHushState(alice, (s) => s.phase === 'cleared');
    await playClean(harness, roomId, players);
    await cleared;
    const after = waitForChat(bob, (m) => m.kind === 'player');
    alice.emit('chat:send', roomId, 'nice');
    expect(textOf(await after)).toBe('nice');
  });
});

describe('a player away', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('pauses a level while they hold cards, and it counts down again on their return', async () => {
    const { roomId, players, owner } = await playToLevel(harness);
    const [alice, bob] = players;
    rig(harness, roomId, players, [[10], [20]]);

    const paused = waitForHushState(alice, (s) => s.phase === 'paused');
    bob.close();
    const view = await paused;
    expect(view.phaseEndsInMs).toBeGreaterThan(0);
    expect(view.phaseEndsInMs).toBeLessThanOrEqual(GRACE_MS);

    // Nobody plays, and nobody talks, around a hand that is not there.
    const heard = collectChat(alice);
    alice.emit('hush:play', roomId, 10);
    alice.emit('chat:send', roomId, 'come back');
    await settle(100);
    expect(hushRoom(harness, roomId).game.pile).toEqual([]);
    expect(heard.filter((m) => m.kind === 'player')).toEqual([]);

    const countdown = waitForHushState(owner, (s) => s.phase === 'countdown');
    const playing = waitForHushState(owner, (s) => s.phase === 'playing');
    const returned = await harness.reload(bob);
    await countdown;
    await playing;
    expect(hushRoom(harness, roomId).game.hands[returned.playerId]).toEqual([
      20,
    ]);
  });

  it('does not pause a level for a player whose hand is empty', async () => {
    const { roomId, players, owner } = await playToLevel(harness, [
      'Alice',
      'Bob',
      'Cat',
    ]);
    const [alice, bob, cat] = players;
    rig(harness, roomId, players, [[10], [20], [30]]);
    const landed = pileOf(owner, 1);
    alice.emit('hush:play', roomId, 10);
    await landed;

    const away = waitForHushState(
      bob,
      (s) => s.playerList[alice.playerId]?.isConnected === false,
    );
    alice.close();
    expect((await away).phase).toBe('playing');

    const cleared = waitForHushState(bob, (s) => s.phase === 'cleared');
    bob.emit('hush:play', roomId, 20);
    cat.emit('hush:play', roomId, 30);
    expect((await cleared).lastLevel).toMatchObject({ livesLost: 0 });
  });

  it('who loses their seat has their cards discarded with no life lost', async () => {
    const { roomId, players } = await playToLevel(harness, [
      'Alice',
      'Bob',
      'Cat',
    ]);
    const [alice, bob, cat] = players;
    rig(harness, roomId, players, [[10, 50], [20], [15, 30]]);

    const told = waitForChat(alice, (m) => textOf(m).startsWith('Their'));
    const resumed = waitForHushState(
      alice,
      (s) => s.phase === 'countdown' && !s.playerList[cat.playerId],
      GRACE_MS + 1500,
    );
    cat.close();
    const view = await resumed;
    expect(textOf(await told)).toBe(
      'Their 15 and 30 are discarded, with no life lost.',
    );
    expect(view.lives).toBe(3);
    expect(view.discards).toEqual([
      { card: 15, playerId: cat.playerId, reason: 'left' },
      { card: 30, playerId: cat.playerId, reason: 'left' },
    ]);
    expect(view.table[cat.playerId]).toBeUndefined();

    await waitForHushState(alice, (s) => s.phase === 'playing');
    const cleared = waitForHushState(alice, (s) => s.phase === 'cleared');
    await playClean(harness, roomId, [alice, bob]);
    expect((await cleared).lastLevel).toMatchObject({
      livesLost: 0,
      cleared: true,
    });
  });

  it('who leaves before a level stops holding it up', async () => {
    const { roomId, players, owner } = await seat(harness, [
      'Alice',
      'Bob',
      'Cat',
    ]);
    const [alice, bob, cat] = players;
    const ready = waitForHushState(owner, (s) => s.phase === 'ready');
    await startGame(owner, roomId);
    await ready;

    const marked = waitForHushState(alice, (s) => s.table[bob.playerId]!.ready);
    alice.emit('hush:ready', roomId);
    bob.emit('hush:ready', roomId);
    await marked;

    const countdown = waitForHushState(alice, (s) => s.phase === 'countdown');
    cat.emit('room:leave', roomId);
    const view = await countdown;
    expect(Object.keys(view.table)).toHaveLength(2);
    expect(view.levels).toBe(6);
  });

  it('who is the last but one ends the game early', async () => {
    const { roomId, players, owner } = await playToLevel(harness);
    rig(harness, roomId, players, [[10], [20]]);
    const chat = collectChat(owner);

    const over = waitForHushState(owner, (s) => s.lastGame !== null);
    players[1].emit('room:leave', roomId);
    const view = await over;
    expect(view).toMatchObject({
      phase: 'waiting',
      isGameStarted: false,
      level: 0,
      lives: 3,
      hand: [],
    });
    expect(view.lastGame).toMatchObject({
      endedEarly: true,
      won: false,
      levelsCleared: 0,
      history: [{ level: 1, livesLost: 0, lifeBack: false, cleared: false }],
      held: [{ playerId: players[0].playerId, cards: [10] }],
    });
    await settle();
    expect(chat.map((m) => textOf(m))).toContain(
      'Not enough players left to continue. Game has ended.',
    );
    expect(chat.map((m) => textOf(m))).not.toContain(
      'Their 20 is discarded, with no life lost.',
    );
  });
});

describe('a Hush game', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('is won together by clearing the last level', async () => {
    const { roomId, players, owner } = await playToLevel(harness, [
      'Alice',
      'Bob',
      'Cat',
      'Dan',
    ]);
    const chat = collectChat(owner);
    const over = waitForHushState(owner, (s) => s.lastGame !== null, 10000);

    for (let level = 1; level <= 5; level++) {
      if (level > 1) {
        await waitForHushState(
          owner,
          (s) => s.phase === 'ready' && s.level === level,
        );
        // A player's events share one budget, sized for people: a level's
        // cards in a row fit its burst, but not five levels with no pause.
        await settle(500);
        await readyAll(players, roomId);
      }
      await playClean(harness, roomId, players);
    }
    const view = await over;

    expect(view).toMatchObject({
      phase: 'waiting',
      isGameStarted: false,
      status: 'Full',
      lives: 3,
    });
    // The last pile stays on the table under the results.
    expect(view.pile).toHaveLength(20);
    expect(view.lastGame).toMatchObject({
      endedEarly: false,
      won: true,
      levels: 5,
      levelsCleared: 5,
      lives: 3,
      held: [],
    });
    expect(view.lastGame!.history).toEqual(
      [1, 2, 3, 4, 5].map((level) => ({
        level,
        livesLost: 0,
        lifeBack: false,
        cleared: true,
      })),
    );
    expect(view.lastGame!.standings.map((s) => s.points)).toEqual([5, 5, 5, 5]);
    await settle();
    expect(textOf(chat.at(-1)!)).toBe('All 5 levels cleared. Well played!');
    // Four quiet level lines, then the one that matters.
    expect(chat.filter((m) => m.kind === 'score')).toHaveLength(4);
    expect(chat.at(-1)!.kind).toBe('success');
  });

  it('is lost with the last life, and shows every card still held', async () => {
    const { roomId, players, owner } = await playToLevel(harness);
    const [alice, bob] = players;
    rig(harness, roomId, players, [
      [1, 11, 21, 90],
      [10, 20, 30],
    ]);
    const chat = collectChat(owner);
    const over = waitForHushState(owner, (s) => s.lastGame !== null);

    for (const card of [10, 20]) {
      const mistake = waitForHushState(owner, (s) => s.phase === 'mistake');
      bob.emit('hush:play', roomId, card);
      await mistake;
      await waitForHushState(owner, (s) => s.phase === 'playing');
    }
    bob.emit('hush:play', roomId, 30);
    const view = await over;

    expect(view).toMatchObject({
      phase: 'waiting',
      isGameStarted: false,
      lives: 3,
      lastMistake: null,
    });
    expect(view.pile.map((play) => play.card)).toEqual([10, 20, 30]);
    expect(view.lastGame).toMatchObject({
      endedEarly: false,
      won: false,
      levels: 7,
      levelsCleared: 0,
      lives: 0,
      history: [{ level: 1, livesLost: 3, lifeBack: false, cleared: false }],
      held: [{ playerId: alice.playerId, cards: [90] }],
    });
    await settle();
    expect(textOf(chat.at(-1)!)).toBe(
      'Out of lives on level 1: 0 of 7 levels cleared.',
    );
  });

  it('can be played again, from level 1 with three lives', async () => {
    const { roomId, players, owner } = await playToLevel(harness);
    rig(harness, roomId, players, [
      [5, 15, 25],
      [10, 20, 30],
    ]);
    for (const card of [10, 20]) {
      const mistake = waitForHushState(owner, (s) => s.phase === 'mistake');
      players[1].emit('hush:play', roomId, card);
      await mistake;
      await waitForHushState(owner, (s) => s.phase === 'playing');
    }
    const over = waitForHushState(owner, (s) => s.lastGame !== null);
    players[1].emit('hush:play', roomId, 30);
    await over;

    const ready = waitForHushState(owner, (s) => s.phase === 'ready');
    await startGame(owner, roomId);
    expect(await ready).toMatchObject({
      level: 1,
      lives: 3,
      pile: [],
      discards: [],
      lastGame: null,
    });
  });
});
