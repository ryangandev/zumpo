import { textOf } from './helpers/test-server.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectChat,
  collectStates,
  createRoom,
  joinRoom,
  playToDrawingPhase,
  seatTwoPlayers,
  serverRoom,
  settle,
  SLOW_DRAWING,
  startGame,
  startTestServer,
  syncRoom,
  waitForChat,
  waitForDrawState,
  type TestClient,
  type TestServer,
} from './helpers/test-server.js';

/**
 * Three players in a drawing phase: one drawing and two still guessing, which
 * is the smallest room where "everybody has guessed" is not the same event as
 * "somebody has guessed".
 */
const playToDrawingPhaseWithThree = async (harness: TestServer) => {
  const names = ['Alice', 'Bob', 'Carol'];
  const [alice, bob, carol] = await Promise.all([
    harness.connect(),
    harness.connect(),
    harness.connect(),
  ]);
  const clients = [alice!, bob!, carol!];

  const roomId = await createRoom(alice!, { username: 'Alice' });
  await joinRoom(bob!, roomId, 'Bob');
  await joinRoom(carol!, roomId, 'Carol');

  const views = clients.map((client) =>
    waitForDrawState(client, (s) => s.phase === 'drawing', 5000),
  );
  await startGame(alice!, roomId);
  const states = await Promise.all(views);

  const drawerIndex = clients.findIndex(
    (client) => client.playerId === states[0]!.currentDrawer,
  );

  return {
    roomId,
    drawer: clients[drawerIndex]!,
    guessers: clients.filter((_, index) => index !== drawerIndex),
    guesserName: (client: TestClient) => names[clients.indexOf(client)]!,
    word: states[drawerIndex]!.word!,
  };
};

const pointsOf = (harness: TestServer, roomId: string) =>
  Object.values(harness.server.rooms.get(roomId)!.playerList).map(
    (player) => player.points,
  );

/*
 * Every check below is about what the *server* permits. A guess is a chat
 * message, so the server is what decides whether a message is a guess, a
 * scored guess, ordinary chat, or something nobody may see.
 */
describe('guess authority', () => {
  let harness: TestServer;

  beforeEach(async () => {
    // Long enough to make the assertions inside a single drawing phase.
    harness = await startTestServer(SLOW_DRAWING);
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('awards points for a correct guess, ignoring case and padding', async () => {
    const { roomId, guesser, guesserName, drawer, word } =
      await playToDrawingPhase(harness);

    const scored = waitForDrawState(drawer, (s) =>
      s.scoredThisTurn.includes(guesser.playerId),
    );
    const announced = waitForChat(drawer, (m) => m.kind === 'success');
    guesser.emit('chat:send', roomId, ` ${word.toUpperCase()} `);

    const state = await scored;
    const guesserPoints = state.playerList[guesser.playerId]!.points;
    const drawerPoints = state.playerList[drawer.playerId]!.points;
    // Guessed at once, so near the top of the range: the guesser takes the
    // floor plus almost the whole bonus, and the drawer two fifths of that.
    expect(guesserPoints).toBeGreaterThan(140);
    expect(drawerPoints).toBe(Math.round(guesserPoints * 0.4));
    expect(state.turnPoints).toEqual({
      [guesser.playerId]: guesserPoints,
      [drawer.playerId]: drawerPoints,
    });
    expect(textOf(await announced)).toBe(
      `${guesserName} guessed the word, +${guesserPoints}.`,
    );
  });

  it('never shows a correct guess as chat, to anybody', async () => {
    const { roomId, guesser, drawer, word } = await playToDrawingPhase(harness);

    const drawerHeard = collectChat(drawer);
    const guesserHeard = collectChat(guesser);
    guesser.emit('chat:send', roomId, word);
    await settle();

    for (const heard of [drawerHeard, guesserHeard]) {
      expect(heard.filter((m) => m.kind === 'player')).toEqual([]);
      expect(JSON.stringify(heard)).not.toContain(word);
    }
  });

  it('shows a wrong guess as ordinary chat, to the guesser as well', async () => {
    const { roomId, guesser, guesserName, drawer } =
      await playToDrawingPhase(harness);

    const drawerHeard = waitForChat(drawer, (m) => m.kind === 'player');
    const guesserHeard = waitForChat(guesser, (m) => m.kind === 'player');
    guesser.emit('chat:send', roomId, 'definitely wrong');

    for (const message of await Promise.all([drawerHeard, guesserHeard])) {
      expect(message).toMatchObject({
        kind: 'player',
        playerId: guesser.playerId,
        username: guesserName,
        text: 'definitely wrong',
      });
    }
  });

  /*
   * Anything the drawer types while the word is in play could be the word, or
   * a hint at it.
   */
  it('silences the drawer while the word is in play', async () => {
    const { roomId, drawer, word, guesser } = await playToDrawingPhase(harness);

    const heard = collectChat(guesser);
    const states = collectStates(guesser);
    drawer.emit('chat:send', roomId, word);
    drawer.emit('chat:send', roomId, 'it is a fruit');
    await settle();

    expect(heard).toEqual([]);
    expect(states).toEqual([]);
    expect(pointsOf(harness, roomId).every((points) => points === 0)).toBe(
      true,
    );
  });

  it('silences the drawer while they are still choosing, too', async () => {
    const { alice, bob, roomId } = await seatTwoPlayers(harness);
    const choosing = waitForDrawState(alice, (s) => s.phase === 'choosing');
    await startGame(alice, roomId);
    const { currentDrawer } = await choosing;
    const [drawer, other] =
      currentDrawer === alice.playerId ? [alice, bob] : [bob, alice];

    const heard = collectChat(other);
    drawer.emit('chat:send', roomId, 'one of these is easy');
    // ...while everybody else may talk.
    const otherHeard = waitForChat(drawer, (m) => m.kind === 'player');
    other.emit('chat:send', roomId, 'good luck');

    expect(textOf(await otherHeard)).toBe('good luck');
    await settle();
    expect(heard.filter((m) => m.playerId === drawer.playerId)).toEqual([]);
  });

  /*
   * A guess is worth what is left on the clock: the same score for getting it
   * in three seconds and in the last one would make a turn pass/fail.
   */
  it('pays a fast guess more than a slow one', async () => {
    const early = await playToDrawingPhase(harness);
    const earlyScored = waitForDrawState(early.drawer, (s) =>
      s.scoredThisTurn.includes(early.guesser.playerId),
    );
    early.guesser.emit('chat:send', early.roomId, early.word);
    const earlyPoints = (await earlyScored).playerList[early.guesser.playerId]!
      .points;

    const late = await playToDrawingPhase(harness);
    // Most of the five-second phase spent staring at the canvas.
    await settle(3500);
    const lateScored = waitForDrawState(late.drawer, (s) =>
      s.scoredThisTurn.includes(late.guesser.playerId),
    );
    late.guesser.emit('chat:send', late.roomId, late.word);
    const latePoints = (await lateScored).playerList[late.guesser.playerId]!
      .points;

    expect(earlyPoints).toBeGreaterThan(latePoints);
    // ...but getting there at all is still worth something.
    expect(latePoints).toBeGreaterThanOrEqual(50);
    expect(earlyPoints).toBeLessThanOrEqual(150);
  });

  /*
   * A player who has scored knows the word, so they are silenced until the
   * next turn starts, and they can never score twice in one.
   */
  it('refuses to let one player score twice, or speak again, in a turn', async () => {
    const { roomId, drawer, guessers, word } =
      await playToDrawingPhaseWithThree(harness);
    const [scorer, other] = guessers as [TestClient, TestClient];

    const successes = collectChat(drawer);
    scorer.emit('chat:send', roomId, word);
    await waitForChat(drawer, (m) => m.kind === 'success');

    for (let i = 0; i < 5; i++) scorer.emit('chat:send', roomId, word);
    scorer.emit('chat:send', roomId, 'it was easy');
    await settle(300);

    expect(successes.filter((m) => m.kind === 'success')).toHaveLength(1);
    expect(successes.filter((m) => m.playerId === scorer.playerId)).toEqual([]);
    expect(
      harness.server.rooms.get(roomId)!.playerList[scorer.playerId]!.points,
    ).toBeLessThanOrEqual(150);

    // Somebody still guessing is unaffected.
    const stillTalking = waitForChat(drawer, (m) => m.kind === 'player');
    other.emit('chat:send', roomId, 'no idea');
    expect((await stillTalking).playerId).toBe(other.playerId);
  });

  it('keeps a scorer silenced through the reveal, and lets them talk next turn', async () => {
    const { roomId, drawer, guessers, word } =
      await playToDrawingPhaseWithThree(harness);

    const revealed = waitForDrawState(drawer, (s) => s.phase === 'reveal');
    for (const guesser of guessers) guesser.emit('chat:send', roomId, word);
    await revealed;

    const heard = collectChat(drawer);
    for (const guesser of guessers) guesser.emit('chat:send', roomId, 'easy');
    await settle();
    expect(heard).toEqual([]);

    // The next turn starts with nobody having scored. One of the two scorers
    // is drawing it, and so silenced for a different reason; the other may
    // talk again.
    const next = await waitForDrawState(drawer, (s) => s.turn === 2);
    const speaker = guessers.find(
      (guesser) => guesser.playerId !== next.currentDrawer,
    )!;
    const spoken = waitForChat(drawer, (m) => m.kind === 'player');
    speaker.emit('chat:send', roomId, 'my turn to guess');
    expect(await spoken).toMatchObject({
      playerId: speaker.playerId,
      text: 'my turn to guess',
    });
  });

  it('never writes the word in the server log', async () => {
    const logged = vi.spyOn(console, 'log');
    const { word } = await playToDrawingPhase(harness);

    const lines = logged.mock.calls.map((args) => args.join(' '));
    logged.mockRestore();
    expect(lines.some((line) => line.includes('is drawing'))).toBe(true);
    expect(lines.filter((line) => line.includes(word))).toEqual([]);
  });

  it('refuses a message from somebody who is not in the room', async () => {
    const { roomId, word, drawer } = await playToDrawingPhase(harness);
    const outsider = await harness.connect();

    const heard = collectChat(drawer);
    outsider.emit('chat:send', roomId, word);
    outsider.emit('chat:send', roomId, 'let me in');
    await settle();

    expect(heard).toEqual([]);
    expect(pointsOf(harness, roomId).every((points) => points === 0)).toBe(
      true,
    );
  });

  /*
   * The reveal shows the word to the whole room. Typing it then is chat, not
   * a guess.
   */
  it('scores nothing outside the drawing phase', async () => {
    const { alice, bob, roomId } = await seatTwoPlayers(harness);

    // Before the game has started at all.
    bob.emit('chat:send', roomId, 'anything');
    await settle();

    // ...and during the reveal, when everyone can read the word.
    const reveal = waitForDrawState(alice, (s) => s.phase === 'reveal', 9000);
    await startGame(alice, roomId);
    const { word, currentDrawer } = await reveal;
    const notDrawer = currentDrawer === alice.playerId ? bob : alice;

    const heard = waitForChat(alice, (m) => textOf(m) === word);
    notDrawer.emit('chat:send', roomId, word!);

    expect((await heard).kind).toBe('player');
    expect(pointsOf(harness, roomId).every((points) => points === 0)).toBe(
      true,
    );
  }, 15_000);

  /*
   * The rest of a drawing phase whose word everyone has guessed is dead time:
   * the drawer has nothing left to draw for, and every guesser is watching a
   * countdown for a word they already know.
   */
  it('ends the turn as soon as everybody has guessed', async () => {
    const { roomId, guesser, drawer, word } = await playToDrawingPhase(harness);

    const reveal = waitForDrawState(
      drawer,
      (s) => s.phase === 'reveal',
      1000, // far inside the five-second drawing phase
    );
    const announced = waitForChat(drawer, (m) =>
      textOf(m).includes('Everybody guessed'),
    );
    guesser.emit('chat:send', roomId, word);

    expect((await reveal).word).toBe(word);
    expect((await announced).kind).toBe('system');
  });

  it('waits for the players who have not guessed yet', async () => {
    const { roomId, drawer, guessers, word } =
      await playToDrawingPhaseWithThree(harness);

    const states = collectStates(drawer);
    guessers[0]!.emit('chat:send', roomId, word);
    await settle(300);

    // One of the two has guessed; the other is still trying.
    expect(states.filter((s) => s.phase === 'reveal')).toEqual([]);
    expect(states.at(-1)?.scoredThisTurn).toEqual([guessers[0]!.playerId]);

    const reveal = waitForDrawState(drawer, (s) => s.phase === 'reveal', 1000);
    guessers[1]!.emit('chat:send', roomId, word);

    const revealed = await reveal;
    expect(revealed.word).toBe(word);
    // Both guessers scored, and the drawer took a cut of each.
    const points = revealed.turnPoints;
    expect(Object.keys(points)).toHaveLength(3);
    expect(points[drawer.playerId]).toBe(
      Math.round(points[guessers[0]!.playerId]! * 0.4) +
        Math.round(points[guessers[1]!.playerId]! * 0.4),
    );
  });

  /*
   * A player inside their reconnect grace still holds a seat but cannot guess,
   * so waiting for them would cost the room the whole rest of the phase.
   */
  it('does not wait for a player who is away', async () => {
    const { roomId, drawer, guessers, word } =
      await playToDrawingPhaseWithThree(harness);

    guessers[1]!.close();
    await settle(100);
    // Still seated, just away, and so still in the room's player list.
    expect(
      harness.server.rooms.get(roomId)?.playerList[guessers[1]!.playerId]
        ?.isConnected,
    ).toBe(false);

    const reveal = waitForDrawState(drawer, (s) => s.phase === 'reveal', 1000);
    guessers[0]!.emit('chat:send', roomId, word);

    expect((await reveal).word).toBe(word);
  });

  it('resets what everybody made at the start of every turn', async () => {
    const { roomId, guesser, drawer, word } = await playToDrawingPhase(harness);

    guesser.emit('chat:send', roomId, word);
    const reveal = await waitForDrawState(drawer, (s) => s.phase === 'reveal');
    expect(Object.keys(reveal.turnPoints)).toHaveLength(2);

    const next = await waitForDrawState(drawer, (s) => s.turn === 2);
    expect(next.turnPoints).toEqual({});
    expect(next.scoredThisTurn).toEqual([]);
  });

  /*
   * A guess a letter off the word all but spells it, so the room must never
   * read it: it goes back to the guesser alone, and the room is told who is
   * close, once a turn for each guesser.
   */
  it('shows a close guess to the guesser alone, and tells the room once', async () => {
    const { roomId, drawer, guessers, guesserName } =
      await playToDrawingPhaseWithThree(harness);
    const [close, other] = guessers as [TestClient, TestClient];
    // The word is random; the rule is about its letters.
    serverRoom(harness, roomId).game.word = 'Turtle';

    const drawerHeard = collectChat(drawer);
    const otherHeard = collectChat(other);
    const closeHeard = collectChat(close);
    const notice = waitForChat(drawer, (m) => m.notice?.type === 'dg:close');
    const own = waitForChat(close, (m) => m.kind === 'player');
    close.emit('chat:send', roomId, 'turtel');

    expect(await own).toEqual({
      id: expect.any(Number),
      kind: 'player',
      playerId: close.playerId,
      username: guesserName(close),
      text: 'turtel',
      audience: 'sender',
      close: true,
    });
    expect((await notice).kind).toBe('system');
    expect(textOf(await notice)).toBe(`${guesserName(close)} is close!`);

    // A second close guess that turn is the guesser's alone, with no notice.
    close.emit('chat:send', roomId, 'turtl');
    // ...while a guess further off is ordinary chat.
    const ordinary = waitForChat(drawer, (m) => m.kind === 'player');
    close.emit('chat:send', roomId, 'tortoise');
    expect(textOf(await ordinary)).toBe('tortoise');
    await settle();

    for (const heard of [drawerHeard, otherHeard]) {
      expect(JSON.stringify(heard)).not.toContain('turtel');
      expect(JSON.stringify(heard)).not.toContain('turtl"');
      expect(heard.filter((m) => m.notice?.type === 'dg:close')).toHaveLength(
        1,
      );
    }
    expect(closeHeard.filter((m) => m.close).map(textOf)).toEqual([
      'turtel',
      'turtl',
    ]);
    expect(
      closeHeard.filter((m) => m.notice?.type === 'dg:close'),
    ).toHaveLength(1);
    // Nobody scored, and the turn goes on.
    expect(pointsOf(harness, roomId).every((points) => points === 0)).toBe(
      true,
    );

    // A refresh gives the guesser their lines back, and nobody else.
    const ownHistory = (await syncRoom(close, roomId)).messages;
    expect(ownHistory.filter((m) => m.close).map(textOf)).toEqual([
      'turtel',
      'turtl',
    ]);
    for (const client of [drawer, other]) {
      const { messages } = await syncRoom(client, roomId);
      expect(messages.some((m) => m.close)).toBe(false);
      expect(JSON.stringify(messages)).not.toContain('turtel');
    }
  });

  it('counts a word run together as close, not correct', async () => {
    const { roomId, guesser, drawer } = await playToDrawingPhase(harness);
    serverRoom(harness, roomId).game.word = 'Ice Cream';

    const own = waitForChat(guesser, (m) => m.close === true);
    const notice = waitForChat(drawer, (m) => m.notice?.type === 'dg:close');
    guesser.emit('chat:send', roomId, 'icecream');

    expect(textOf(await own)).toBe('icecream');
    await notice;
    expect(
      serverRoom(harness, roomId).game.scoredThisTurn.has(guesser.playerId),
    ).toBe(false);
  });

  it('tells the room again in the next turn', async () => {
    const { roomId, drawer, guessers } =
      await playToDrawingPhaseWithThree(harness);
    const [close] = guessers as [TestClient, TestClient];
    serverRoom(harness, roomId).game.word = 'Turtle';
    const first = waitForChat(drawer, (m) => m.notice?.type === 'dg:close');
    close.emit('chat:send', roomId, 'turtel');
    await first;

    const next = await waitForDrawState(
      drawer,
      (s) => s.turn === 2 && s.phase === 'drawing',
      15_000,
    );
    const nextDrawer = [drawer, ...guessers].find(
      (client) => client.playerId === next.currentDrawer,
    )!;
    const guesser = guessers.find((client) => client !== nextDrawer)!;
    serverRoom(harness, roomId).game.word = 'Turtle';
    const again = waitForChat(nextDrawer, (m) => m.notice?.type === 'dg:close');
    guesser.emit('chat:send', roomId, 'turtel');
    expect((await again).notice).toMatchObject({ type: 'dg:close' });
  }, 30_000);

  it('leaves the drawer, a scorer and a spectator out of it', async () => {
    const { roomId, drawer, guessers, word } =
      await playToDrawingPhaseWithThree(harness);
    const [scorer, other] = guessers as [TestClient, TestClient];
    const carol = await harness.connect();
    await joinRoom(carol, roomId, 'Dave');

    scorer.emit('chat:send', roomId, word);
    await waitForChat(other, (m) => m.notice?.type === 'dg:guessed');
    serverRoom(harness, roomId).game.word = 'Turtle';

    const heard = collectChat(other);
    drawer.emit('chat:send', roomId, 'turtel');
    scorer.emit('chat:send', roomId, 'turtel');
    // A spectator's guess stays among the spectators, as any line does then.
    const stands = waitForChat(carol, (m) => m.kind === 'player');
    carol.emit('chat:send', roomId, 'turtel');
    expect(await stands).toMatchObject({
      audience: 'spectators',
      text: 'turtel',
    });
    expect((await stands).close).toBeUndefined();
    await settle();

    expect(heard).toEqual([]);
  });

  it('posts room chat to everyone, under the name on the seat', async () => {
    const alice = await harness.connect();
    const bob = await harness.connect();
    const roomId = await createRoom(alice, { username: 'Alice' });
    await joinRoom(bob, roomId, 'Bob');
    await settle();

    const bobHeard = waitForChat(bob, (m) => m.kind === 'player');
    const aliceHeard = waitForChat(alice, (m) => m.kind === 'player');
    alice.emit('chat:send', roomId, 'hello room');

    const [toBob, toAlice] = await Promise.all([bobHeard, aliceHeard]);
    expect(toBob).toEqual({
      id: expect.any(Number),
      kind: 'player',
      playerId: alice.playerId,
      username: 'Alice',
      text: 'hello room',
    });
    expect(toAlice).toEqual(toBob);
  });
});
