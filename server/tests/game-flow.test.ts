import { textOf } from './helpers/test-server.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DrawAndGuessRoomState } from '../models/types.js';
import {
  collectChat,
  collectStates,
  createRoom,
  joinRoom,
  playToDrawingPhase,
  request,
  seatTwoPlayers,
  serverRoom,
  settle,
  startGame,
  startTestServer,
  syncRoom,
  waitForChat,
  waitForDrawState,
  type TestClient,
  type TestServer,
  endNotices,
} from './helpers/test-server.js';

/** How many of a hint's letters are showing rather than still hidden. */
const shown = (hint: string) =>
  [...hint].filter((char) => char !== '_' && char.trim() !== '').length;

/**
 * Starts the game in a two-player room and waits for the first choosing phase,
 * reporting whose turn it is as each player's own snapshot says.
 */
const startAndAwaitChoosing = async (
  alice: TestClient,
  bob: TestClient,
  roomId: string,
) => {
  const aliceView = waitForDrawState(alice, (s) => s.phase === 'choosing');
  const bobView = waitForDrawState(bob, (s) => s.phase === 'choosing');
  await startGame(alice, roomId);
  const views = await Promise.all([aliceView, bobView]);

  const drawerIndex = views[0].currentDrawer === alice.playerId ? 0 : 1;
  const clients = [alice, bob];
  return {
    drawer: clients[drawerIndex]!,
    guesser: clients[1 - drawerIndex]!,
    drawerView: views[drawerIndex]!,
    guesserView: views[1 - drawerIndex]!,
  };
};

describe('the game engine', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('refuses to start with fewer than two players', async () => {
    const owner = await harness.connect();
    const roomId = await createRoom(owner);

    const answer = await request(owner, 'game:start', roomId);

    expect(answer).toEqual({
      ok: false,
      error: { type: 'notEnoughPlayers', message: expect.any(String) },
    });
    expect(harness.server.rooms.get(roomId)?.isGameStarted).toBe(false);
  });

  /*
   * The Start button is owner-only in the UI, and that has to be true on the
   * server as well: any connected client could otherwise start any room's game
   * with a room id off the lobby broadcast.
   */
  it('refuses to start a game for anybody but the room owner', async () => {
    const { bob, roomId } = await seatTwoPlayers(harness);

    const answer = await request(bob, 'game:start', roomId);

    expect(answer.error?.type).toBe('notRoomOwner');
    expect(harness.server.rooms.get(roomId)?.isGameStarted).toBe(false);
  });

  it('refuses to start a game for a client that is not even in the room', async () => {
    const { alice, roomId } = await seatTwoPlayers(harness);
    const outsider = await harness.connect();
    await settle();

    const states = collectStates(alice);
    const answer = await request(outsider, 'game:start', roomId);

    expect(answer.error?.type).toBe('notRoomOwner');
    await settle();
    expect(states).toEqual([]);
    expect(harness.server.rooms.get(roomId)?.isGameStarted).toBe(false);
  });

  it('refuses to start a game that is already running', async () => {
    const { alice, roomId } = await seatTwoPlayers(harness);
    await startGame(alice, roomId);

    const answer = await request(alice, 'game:start', roomId);

    expect(answer.error?.type).toBe('gameAlreadyStarted');
  });

  it('announces the start and the word category', async () => {
    const { alice, roomId } = await seatTwoPlayers(harness);
    const announced = waitForChat(alice, (m) => textOf(m).includes('started'));
    await startGame(alice, roomId);

    const message = await announced;
    expect(message.kind).toBe('system');
    expect(textOf(message)).toContain(
      serverRoom(harness, roomId).game.wordCategory,
    );
  });

  it('marks the start of every turn in the chat with whose it is', async () => {
    const { alice, bob, roomId } = await seatTwoPlayers(harness);
    const divider = waitForChat(bob, (m) => m.kind === 'divider');
    const { drawer } = await startAndAwaitChoosing(alice, bob, roomId);

    expect(await divider).toMatchObject({
      kind: 'divider',
      notice: {
        type: 'dg:turn',
        round: 1,
        drawer: drawer === alice ? 'Alice' : 'Bob',
      },
    });
  });

  it('opens with a choosing phase and a countdown, the choices for the drawer alone', async () => {
    const { alice, bob, roomId } = await seatTwoPlayers(harness);
    const { drawer, drawerView, guesserView } = await startAndAwaitChoosing(
      alice,
      bob,
      roomId,
    );

    for (const view of [drawerView, guesserView]) {
      expect(view.phaseEndsInMs).toBeGreaterThan(0);
      expect(view.currentDrawer).toBe(drawer.playerId);
      expect(view.currentRound).toBe(1);
      expect(view.turn).toBe(1);
      expect(view.hint).toBe('');
      expect(view.wordCategory).not.toBe('');
      expect(view).not.toHaveProperty('word');
    }

    expect(drawerView.wordChoices).toHaveLength(3);
    expect(new Set(drawerView.wordChoices).size).toBe(3);
    // The choices go to the drawer alone, not to the room.
    expect(guesserView).not.toHaveProperty('wordChoices');
    for (const choice of drawerView.wordChoices!) {
      expect(JSON.stringify(guesserView)).not.toContain(`"${choice}"`);
    }
  });

  it('sends the word to the drawer alone, and a hint to everyone else', async () => {
    const { alice, bob, roomId } = await seatTwoPlayers(harness);
    const { drawer, guesser, drawerView } = await startAndAwaitChoosing(
      alice,
      bob,
      roomId,
    );
    const word = drawerView.wordChoices![0]!;

    const drawerSees = waitForDrawState(drawer, (s) => s.phase === 'drawing');
    const guesserSees = waitForDrawState(guesser, (s) => s.phase === 'drawing');
    drawer.emit('dg:select-word', roomId, word);

    const [mine, theirs] = await Promise.all([drawerSees, guesserSees]);

    expect(mine.word).toBe(word);
    expect(mine.wordAutoPicked).toBe(false);
    expect(theirs).not.toHaveProperty('word');
    expect(theirs).not.toHaveProperty('wordChoices');
    expect(JSON.stringify(theirs)).not.toContain(`"${word}"`);
    expect(theirs.hint).toBe(buildHiddenHint(word));
    expect(mine.hint).toBe(theirs.hint);
  });

  it('ignores a word the drawer was not offered', async () => {
    const { alice, bob, roomId } = await seatTwoPlayers(harness);
    const { drawer } = await startAndAwaitChoosing(alice, bob, roomId);

    drawer.emit('dg:select-word', roomId, 'not-a-choice');
    await settle(50);

    expect(serverRoom(harness, roomId).game.phase).toBe('choosing');
  });

  it('ignores a word chosen by somebody who is not the drawer', async () => {
    const { alice, bob, roomId } = await seatTwoPlayers(harness);
    const { guesser, drawerView } = await startAndAwaitChoosing(
      alice,
      bob,
      roomId,
    );

    guesser.emit('dg:select-word', roomId, drawerView.wordChoices![0]!);
    await settle();

    expect(serverRoom(harness, roomId).game.phase).toBe('choosing');
  });

  /*
   * The fallback used to be the drawer's browser's job, so it never happened
   * if they had closed the tab; the room sat in the choosing phase forever.
   */
  it('picks a word itself when the drawer never chooses one, and says so', async () => {
    const { alice, bob, roomId } = await seatTwoPlayers(harness);
    const { drawer, guesser, drawerView } = await startAndAwaitChoosing(
      alice,
      bob,
      roomId,
    );

    // Nobody chooses. The server's own clock has to move the phase on.
    const [mine, theirs] = await Promise.all([
      waitForDrawState(drawer, (s) => s.phase === 'drawing'),
      waitForDrawState(guesser, (s) => s.phase === 'drawing'),
    ]);

    expect(mine.phaseEndsInMs).toBeGreaterThan(0);
    expect(mine.word).toBe(drawerView.wordChoices![0]);
    expect(mine.wordAutoPicked).toBe(true);
    expect(theirs.wordAutoPicked).toBe(true);
  });

  it('runs a whole turn on its own clock, revealing the word to everybody', async () => {
    const { alice, bob, roomId } = await seatTwoPlayers(harness);
    const { drawer, guesser, drawerView } = await startAndAwaitChoosing(
      alice,
      bob,
      roomId,
    );
    const word = drawerView.wordChoices![0]!;

    const revealed = Promise.all([
      waitForDrawState(drawer, (s) => s.phase === 'reveal'),
      waitForDrawState(guesser, (s) => s.phase === 'reveal'),
    ]);
    drawer.emit('dg:select-word', roomId, word);

    for (const view of await revealed) {
      expect(view.word).toBe(word);
      expect(view.phaseEndsInMs).toBeGreaterThan(0);
    }

    // ...and the next turn starts without any client asking it to.
    const next = await waitForDrawState(
      guesser,
      (s) => s.phase === 'choosing' && s.turn === 2,
    );
    expect(next.currentDrawer).toBe(guesser.playerId);
    expect(next).not.toHaveProperty('word');
  });

  /*
   * The hint gives up to a third of the letters away as the clock runs down,
   * which is what rescues a room that has stalled on a hard word.
   */
  it('uncovers letters of the word as the drawing clock runs down', async () => {
    const harnessWithHints = await startTestServer({
      wordSelecting: 0.2,
      drawing: 1.5,
      reviewing: 0.2,
    });
    try {
      const { guesser, word } = await playToDrawingPhase(harnessWithHints);
      const hints: string[] = [];
      guesser.on('room:state', (state) => {
        const view = state as DrawAndGuessRoomState;
        if (view.phase !== 'drawing') return;
        if (hints.at(-1) !== view.hint) hints.push(view.hint);
      });

      // Long enough for both reveals, at a third and two thirds of the phase.
      await settle(1300);

      // The shortest word in the bank is three letters, so every word gets at
      // least one letter given away.
      expect(hints.length).toBeGreaterThan(0);

      const letterCount = [...word].filter((char) => char.trim() !== '').length;

      let previouslyShown = 0;
      for (const hint of hints) {
        expect(hint).toHaveLength(word.length);
        // Every character is either still hidden or the word's own.
        for (const [index, char] of [...hint].entries()) {
          expect(char === '_' || char === word[index]).toBe(true);
        }
        // It only ever gets easier, and never gives the whole word away.
        expect(shown(hint)).toBeGreaterThanOrEqual(previouslyShown);
        previouslyShown = shown(hint);
      }

      expect(previouslyShown).toBe(Math.floor(letterCount / 3));

      // Every reveal tells the room something it did not know. A word with one
      // letter to give away gives it away once, not twice.
      expect(hints.length).toBe(Math.min(2, Math.floor(letterCount / 3)));
    } finally {
      await harnessWithHints.teardown();
    }
  });

  /*
   * A reveal scheduled for a turn that ended early must not go off during the
   * reveal that replaced it: the word is on screen by then.
   */
  it('stops hinting once the turn is over', async () => {
    const harnessWithHints = await startTestServer({
      wordSelecting: 0.2,
      drawing: 1.2, // reveals would be due at 0.4s and 0.8s
      reviewing: 2, // ...which land inside this, if they were still pending
    });
    try {
      const { roomId, guesser, word } =
        await playToDrawingPhase(harnessWithHints);

      // The only guesser guesses, so the phase ends before any reveal is due.
      const revealed = waitForDrawState(
        guesser,
        (s) => s.phase === 'reveal',
        1000,
      );
      guesser.emit('chat:send', roomId, word);
      const atReveal = await revealed;

      const later = collectStates(guesser);
      await settle(1000);

      expect(later.filter((s) => s.hint !== atReveal.hint)).toEqual([]);
      expect(serverRoom(harnessWithHints, roomId).game.hint).toBe(
        atReveal.hint,
      );
    } finally {
      await harnessWithHints.teardown();
    }
  });

  it('plays every player once per round, then ends the game', async () => {
    const { alice, bob, roomId } = await seatTwoPlayers(harness);
    const states = collectStates(alice);
    const ended = waitForDrawState(
      alice,
      (s) => s.lastGame !== null && !s.isGameStarted,
      9000,
    );
    const announced = waitForChat(
      alice,
      (m) => textOf(m) === 'Game has ended!',
      9000,
    );

    await startGame(alice, roomId);

    const finalState = await ended;
    const drawers = new Set(
      states.filter((s) => s.phase === 'choosing').map((s) => s.currentDrawer),
    );
    expect(drawers).toEqual(new Set([alice.playerId, bob.playerId]));
    expect(finalState).toMatchObject({
      isGameStarted: false,
      status: 'Open',
      phase: 'waiting',
      currentRound: 0,
      turn: 0,
      currentDrawer: '',
      hint: '',
      phaseEndsInMs: 0,
    });
    expect(finalState).not.toHaveProperty('word');
    expect((await announced).kind).toBe('success');
    expect(harness.server.rooms.get(roomId)?.phaseEndsAt).toBe(0);
  });

  /*
   * The seat waits for a dropped player; a turn that has not got going does
   * not. A drawer who is not there cannot choose.
   */
  it('skips to the next turn as soon as the drawer drops while choosing', async () => {
    const harness3 = await startTestServer();
    try {
      const [alice, bob, carol] = await Promise.all([
        harness3.connect(),
        harness3.connect(),
        harness3.connect(),
      ]);
      const roomId = await createRoom(alice, { username: 'Alice', rounds: 1 });
      await joinRoom(bob, roomId, 'Bob');
      await joinRoom(carol, roomId, 'Carol');

      const clients = new Map([
        [alice.playerId, alice],
        [bob.playerId, bob],
        [carol.playerId, carol],
      ]);

      const firstTurn = waitForDrawState(alice, (s) => s.phase === 'choosing');
      await startGame(alice, roomId);
      const { currentDrawer } = await firstTurn;

      const witness = currentDrawer === alice.playerId ? bob : alice;
      const nextTurn = waitForDrawState(witness, (s) => s.turn === 2);
      const skipped = waitForChat(witness, (m) =>
        textOf(m).includes('drawer lost connection'),
      );

      clients.get(currentDrawer)!.close();

      expect((await nextTurn).currentDrawer).not.toBe(currentDrawer);
      expect((await skipped).kind).toBe('alert');
      expect(harness3.server.rooms.get(roomId)?.isGameStarted).toBe(true);
    } finally {
      await harness3.teardown();
    }
  });

  it('ends the game when too few players are left to continue', async () => {
    const { alice, bob, roomId } = await seatTwoPlayers(harness);
    await startAndAwaitChoosing(alice, bob, roomId);

    const messages = collectChat(alice);
    const ended = waitForDrawState(alice, (s) => !s.isGameStarted);
    bob.emit('room:leave', roomId);

    const finalState = await ended;
    expect(finalState.currentDrawer).toBe('');
    expect(finalState.phase).toBe('waiting');
    expect(finalState.lastGame?.endedEarly).toBe(true);
    expect(harness.server.rooms.get(roomId)?.phaseEndsAt).toBe(0);
    expect(
      messages.find((m) => textOf(m).startsWith('Not enough players')),
    ).toMatchObject({ kind: 'alert' });
  });

  /*
   * A pending phase timer that fires against a deleted room used to be the
   * shape of a crash; the engine drops it with the room instead.
   */
  it('drops a pending phase timer when the room is deleted mid-turn', async () => {
    const { alice, bob, roomId } = await seatTwoPlayers(harness);
    await startAndAwaitChoosing(alice, bob, roomId);

    alice.close();
    bob.close();
    // Long enough for both seats to expire and the empty room to be collected.
    await settle(1200);

    expect(harness.server.rooms.get(roomId)).toBeUndefined();
  });
});

/*
 * The results screen is drawn from `lastGame`, which outlives the reset that
 * ends a game so a client arriving afterwards can still show it.
 */
describe('the last game', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  /** Plays a two-player game until bob walks out during the first turn. */
  const endEarly = async (rounds = 1) => {
    const { alice, bob, roomId } = await seatTwoPlayers(harness, rounds);
    const started = waitForDrawState(alice, (s) => s.phase === 'choosing');
    await startGame(alice, roomId);
    const { wordCategory } = await started;

    const endChat = collectChat(alice);
    const ended = waitForDrawState(alice, (s) => s.lastGame !== null);
    bob.emit('room:leave', roomId);
    const final = await ended;
    // One notice says it ended early; no result for a game nobody finished.
    await settle();
    expect(endNotices(endChat)).toEqual(['game:interrupted']);
    return { alice, roomId, wordCategory, final };
  };

  it('sums up a game played to the end, best score first', async () => {
    const { alice, bob, roomId } = await seatTwoPlayers(harness);

    // Whoever is guessing gets the word in as soon as the drawing starts, so
    // the standings have somebody ahead.
    for (const client of [alice, bob]) {
      client.on('room:state', (state) => {
        const view = state as DrawAndGuessRoomState;
        if (view.phase !== 'drawing') return;
        if (view.currentDrawer === client.playerId) return;
        if (view.scoredThisTurn.includes(client.playerId)) return;
        const word = serverRoom(harness, roomId)?.game.word;
        if (word) client.emit('chat:send', roomId, word);
      });
    }

    const started = waitForDrawState(alice, (s) => s.phase === 'choosing');
    const ended = waitForDrawState(alice, (s) => s.lastGame !== null, 9000);
    await startGame(alice, roomId);
    const { wordCategory } = await started;
    const final = await ended;

    const summary = final.lastGame!;
    expect(summary).toMatchObject({
      endedEarly: false,
      wordCategory,
      rounds: 1,
      turns: 2,
    });
    expect(summary.standings.map((s) => s.playerId).toSorted()).toEqual(
      [alice.playerId, bob.playerId].toSorted(),
    );
    for (let i = 1; i < summary.standings.length; i++) {
      expect(summary.standings[i - 1]!.points).toBeGreaterThanOrEqual(
        summary.standings[i]!.points,
      );
    }
    for (const standing of summary.standings) {
      const seat = final.playerList[standing.playerId]!;
      expect(standing.points).toBe(seat.points);
      expect(standing.username).toBe(seat.username);
    }
    expect(summary.standings[0]!.points).toBeGreaterThan(0);
  });

  it('marks a game cut short, counting only what was played', async () => {
    const { alice, wordCategory, final } = await endEarly(3);

    expect(final.lastGame).toEqual({
      endedEarly: true,
      wordCategory,
      rounds: 1,
      turns: 1,
      standings: [{ playerId: alice.playerId, username: 'Alice', points: 0 }],
    });
  });

  it('keeps the summary for a player who arrives after the game', async () => {
    const { roomId, final } = await endEarly();

    const carol = await harness.connect();
    await joinRoom(carol, roomId, 'Carol');
    const { state } = await syncRoom(carol, roomId);

    expect((state as DrawAndGuessRoomState).lastGame).toEqual(final.lastGame);
  });

  it('clears the summary when the next game starts', async () => {
    const { alice, roomId } = await endEarly();

    const carol = await harness.connect();
    await joinRoom(carol, roomId, 'Carol');
    const restarted = waitForDrawState(alice, (s) => s.phase === 'choosing');
    await startGame(alice, roomId);

    expect((await restarted).lastGame).toBeNull();
  });
});

/** The hint at the start of a drawing: every letter hidden, spaces kept. */
const buildHiddenHint = (word: string) =>
  [...word].map((char) => (/\s/.test(char) ? char : '_')).join('');
