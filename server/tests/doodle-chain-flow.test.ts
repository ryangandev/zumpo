import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CanvasStroke, DoodleChainRoomState } from '../models/types.js';
import {
  collect,
  createDoodleChainRoom,
  doodleChainRoom,
  joinRoom,
  request,
  seatTable,
  settle,
  startGame,
  startTestServer,
  syncRoom,
  waitFor,
  waitForDoodleChainState,
  type TestClient,
  type TestServer,
} from './helpers/test-server.js';

const FOUR = ['Maya', 'Ryan', 'Leo', 'Sam'] as const;
const THREE = ['Maya', 'Ryan', 'Leo'] as const;

/** Seats `names` in a Doodle Chain room, the first as its owner. */
function seat<const Names extends readonly [string, ...string[]]>(
  harness: TestServer,
  names: Names,
) {
  return seatTable(harness, names, (owner, username) =>
    createDoodleChainRoom(owner, { username }),
  );
}

/** The next snapshot in `phase` at `step`. */
const at = (
  client: TestClient,
  phase: DoodleChainRoomState['phase'],
  step = 0,
  timeoutMs = 5000,
) =>
  waitForDoodleChainState(
    client,
    (state) => state.phase === phase && (step === 0 || state.step === step),
    timeoutMs,
  );

/** Seats `names`, starts a game and waits for the write step. */
async function playToWrite<const Names extends readonly [string, ...string[]]>(
  harness: TestServer,
  names: Names,
) {
  const seated = await seat(harness, names);
  const write = at(seated.owner, 'write', 1);
  await startGame(seated.owner, seated.roomId);
  return { ...seated, first: await write };
}

/**
 * Each player writes their line and presses Done, or for null leaves it
 * empty, which Done refuses, for the clock to take.
 */
function writeAll(
  players: readonly TestClient[],
  roomId: string,
  lines: readonly (string | null)[],
) {
  players.forEach((player, index) => {
    const line = lines[index];
    if (!line) return;
    player.emit('dc:text', roomId, { text: line });
    player.emit('dc:done', roomId, true);
  });
}

/** A short line in one colour. */
function scribble(player: TestClient, roomId: string, x = 10) {
  player.emit('dc:draw:start', roomId, { x, y: 10 }, '#222222', 10);
  player.emit('dc:draw:move', roomId, { x: x + 20, y: 30 });
  player.emit('dc:draw:end', roomId);
}

/**
 * Each player draws a scribble and presses Done, or for false leaves the
 * canvas empty, for the clock to take.
 */
function drawAll(
  players: readonly TestClient[],
  roomId: string,
  draws: readonly boolean[],
) {
  players.forEach((player, index) => {
    if (!draws[index]) return;
    scribble(player, roomId, 10 + index);
    player.emit('dc:done', roomId, true);
  });
}

/** The server's chains, as the authors and what each entry holds. */
function chainsOf(harness: TestServer, roomId: string) {
  return doodleChainRoom(harness, roomId).game.chains.map((entries) =>
    entries.map((entry) => ({
      step: entry.step,
      author: entry.author.username,
      content: entry.content,
    })),
  );
}

/** Plays a game of three to its reveal, every entry made. */
async function playToReveal(harness: TestServer) {
  const seated = await playToWrite(harness, THREE);
  const { roomId, players, owner } = seated;
  writeAll(players, roomId, ['one', 'two', 'three']);
  await at(owner, 'draw', 2);
  drawAll(players, roomId, [true, true, true]);
  await at(owner, 'describe', 3);
  const reveal = at(owner, 'reveal');
  writeAll(players, roomId, ['eins', 'zwei', 'drei']);
  return { ...seated, first: await reveal };
}

describe('Doodle Chain', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer();
  });

  afterEach(async () => {
    await harness.teardown();
  });

  describe('starting', () => {
    it('needs three players, and plays one step each', async () => {
      const { roomId, owner } = await seat(harness, ['Maya', 'Ryan']);
      const refused = await request(owner, 'game:start', roomId);
      expect(refused).toMatchObject({
        ok: false,
        error: { type: 'notEnoughPlayers' },
      });

      const third = await harness.connect();
      await joinRoom(third, roomId, 'Leo');
      const write = at(owner, 'write', 1);
      await startGame(owner, roomId);
      const state = await write;
      expect(state.steps).toBe(3);
      expect(state.order.map((player) => player.username)).toEqual(THREE);
      expect(state.task).toEqual({ kind: 'prompt', chain: 0, sitsOut: false });
      expect(state.phaseEndsInMs).toBeGreaterThan(0);
    });

    it('takes 45, 60 or 90 seconds of drawing, and nothing else', async () => {
      const owner = await harness.connect();
      const make = (drawingSeconds: number) =>
        request(owner, 'room:create', {
          gameType: 'doodle-chain',
          roomName: 'Room',
          username: 'Maya',
          maxPlayers: 8,
          password: '',
          settings: { drawingSeconds },
        });
      expect(await make(50)).toMatchObject({ ok: false });
      expect(await make(90)).toMatchObject({ ok: true });
    });
  });

  describe('who sees what', () => {
    it('shows each player only the step before theirs, and a spectator nothing', async () => {
      const { roomId, players, owner } = await playToWrite(harness, THREE);
      const [maya, ryan, leo] = players;
      const spectator = await harness.connect();
      await joinRoom(spectator, roomId, 'Noor', '', 'spectator');

      const draw = Promise.all(players.map((p) => at(p, 'draw', 2)));
      const watching = at(spectator, 'draw', 2);
      writeAll(players, roomId, [
        'a turtle on a skateboard',
        'a dragon at the dentist',
        'a cat riding a bicycle',
      ]);
      const [mayaView, ryanView, leoView] = (await draw) as [
        DoodleChainRoomState,
        DoodleChainRoomState,
        DoodleChainRoomState,
      ];

      // You get the chain of the player before you, and the first player the
      // last player's.
      expect(ryanView.task?.given?.content).toEqual({
        type: 'text',
        text: 'a turtle on a skateboard',
      });
      expect(ryanView.task?.given?.author.username).toBe('Maya');
      expect(leoView.task?.given?.author.username).toBe('Ryan');
      expect(mayaView.task?.given?.author.username).toBe('Leo');

      // Nobody's snapshot holds a line but the one they were given.
      expect(JSON.stringify(ryanView)).not.toContain('dragon');
      expect(JSON.stringify(ryanView)).not.toContain('bicycle');
      const spectatorView = await watching;
      expect(spectatorView.task).toBeUndefined();
      expect(spectatorView.draft).toBeUndefined();
      for (const line of ['turtle', 'dragon', 'bicycle']) {
        expect(JSON.stringify(spectatorView)).not.toContain(line);
      }

      // Once the step is over, what you were given is gone from your view.
      const passing = at(owner, 'passing', 2);
      drawAll([maya, ryan, leo], roomId, [true, true, true]);
      const after = await passing;
      expect(after.task?.given).toBeUndefined();
      expect(JSON.stringify(after)).not.toContain('turtle');
    });

    it('sends a drawing only to whoever describes it', async () => {
      const { roomId, players, owner } = await playToWrite(harness, THREE);
      writeAll(players, roomId, ['one', 'two', 'three']);
      await at(owner, 'draw', 2);

      const received = players.map((player) => collect(player, 'dc:drawing'));
      const describing = Promise.all(players.map((p) => at(p, 'describe', 3)));
      drawAll(players, roomId, [true, true, true]);
      const views = await describing;
      await settle();

      // At step 3 Leo describes Ryan's drawing of Maya's line.
      const leoGiven = views[2]!.task?.given;
      expect(leoGiven?.author.username).toBe('Ryan');
      expect(leoGiven?.content.type).toBe('drawing');
      const id =
        leoGiven?.content.type === 'drawing' ? leoGiven.content.drawing : '';
      expect(received[2]!.map(([, drawing]) => drawing)).toEqual([id]);
      const [[, , strokes]] = received[2]! as [
        [string, string, CanvasStroke[]],
      ];
      expect(strokes[0]?.points).toEqual([
        { x: 11, y: 10 },
        { x: 31, y: 30 },
      ]);
      // And Maya and Ryan were sent only their own.
      for (const index of [0, 1]) expect(received[index]).toHaveLength(1);
      expect(received[0]![0]![1]).not.toBe(id);
    });
  });

  describe('a step', () => {
    it('ends early once everybody with something to do is done', async () => {
      const { roomId, players, owner } = await playToWrite(harness, THREE);
      const [maya, ryan, leo] = players;
      for (const player of players) {
        player.emit('dc:text', roomId, { text: 'a line' });
      }
      maya.emit('dc:done', roomId, true);
      ryan.emit('dc:done', roomId, true);
      const table = await waitForDoodleChainState(
        owner,
        (s) => s.table[ryan.playerId]?.done === true,
      );
      expect(table.phase).toBe('write');
      expect(table.table[maya.playerId]?.done).toBe(true);
      expect(table.table[leo.playerId]?.done).toBe(false);

      // Keep editing takes it back.
      maya.emit('dc:done', roomId, false);
      await waitForDoodleChainState(
        owner,
        (s) => s.table[maya.playerId]?.done === false,
      );
      const passing = at(owner, 'passing', 1);
      for (const player of [maya, leo]) player.emit('dc:done', roomId, true);
      const done = await passing;
      expect(done.phaseEndsInMs).toBeLessThanOrEqual(150);
    });

    it('refuses Done on an empty entry, so empty means the time ran out', async () => {
      const { roomId, players, owner } = await playToWrite(harness, THREE);
      const [maya, ryan, leo] = players;
      maya.emit('dc:text', roomId, { text: '   ' });
      maya.emit('dc:done', roomId, true);
      ryan.emit('dc:done', roomId, true);
      leo.emit('dc:text', roomId, { suggestion: 4 });
      leo.emit('dc:done', roomId, true);
      const table = await waitForDoodleChainState(
        owner,
        (s) => s.table[leo.playerId]?.done === true,
      );
      expect(table.table[maya.playerId]?.done).toBe(false);
      expect(table.table[ryan.playerId]?.done).toBe(false);

      writeAll([maya, ryan], roomId, ['one', 'two']);
      await at(owner, 'draw', 2);
      // A blank canvas cannot be Done, and nor can one cleared after a stroke.
      maya.emit('dc:done', roomId, true);
      scribble(ryan, roomId);
      ryan.emit('dc:draw:clear', roomId);
      ryan.emit('dc:done', roomId, true);
      scribble(leo, roomId);
      leo.emit('dc:done', roomId, true);
      const drawing = await waitForDoodleChainState(
        owner,
        (s) => s.table[leo.playerId]?.done === true,
      );
      expect(drawing.table[maya.playerId]?.done).toBe(false);
      expect(drawing.table[ryan.playerId]?.done).toBe(false);
    });

    it('keeps whatever is there when the clock runs out, and fills an empty prompt', async () => {
      const { roomId, players, owner } = await playToWrite(harness, THREE);
      const [maya, ryan] = players;
      // Maya never presses Done; Ryan picks a suggestion; Leo writes nothing.
      maya.emit('dc:text', roomId, { text: '  a half-finished thou' });
      ryan.emit('dc:text', roomId, { suggestion: 7 });
      await at(owner, 'draw', 2, 6000);

      const chains = chainsOf(harness, roomId);
      expect(chains[0]![0]!.content).toEqual({
        type: 'text',
        text: 'a half-finished thou',
      });
      expect(chains[1]![0]!.content).toEqual({
        type: 'suggestion',
        suggestion: 7,
      });
      expect(chains[2]![0]!.content.type).toBe('suggestion');
    });

    it('gives a writer their words back, and ignores them once Done', async () => {
      const { roomId, players } = await playToWrite(harness, THREE);
      const [maya] = players;
      maya.emit('dc:text', roomId, { text: 'a cat riding a bicycle' });
      await settle();
      let { state } = await syncRoom(maya, roomId);
      expect((state as DoodleChainRoomState).draft).toEqual({
        text: 'a cat riding a bicycle',
      });

      maya.emit('dc:done', roomId, true);
      maya.emit('dc:text', roomId, { text: 'something else' });
      await settle();
      ({ state } = await syncRoom(maya, roomId));
      expect((state as DoodleChainRoomState).draft).toEqual({
        text: 'a cat riding a bicycle',
      });
    });

    it('refuses a suggestion outside the write step, and words while drawing', async () => {
      const { roomId, players } = await playToWrite(harness, THREE);
      writeAll(players, roomId, ['one', 'two', 'three']);
      await at(players[0], 'draw', 2);
      const [maya, ryan, leo] = players;
      maya.emit('dc:text', roomId, { text: 'not a drawing' });
      scribble(ryan, roomId);
      drawAll([maya, ryan, leo], roomId, [false, false, true]);
      const describing = await at(maya, 'describe', 3);
      // Maya's chain at step 2 was Leo's; she sent words, which a drawing
      // step ignores, so her drawing is empty.
      const chains = chainsOf(harness, roomId);
      expect(chains[2]![1]).toMatchObject({
        author: 'Maya',
        content: { type: 'empty', reason: 'time' },
      });
      expect(describing.step).toBe(3);

      // Ryan sits Leo's chain out; Leo describes Ryan's drawing, in words.
      leo.emit('dc:text', roomId, { suggestion: 3 });
      await settle();
      const { state } = await syncRoom(leo, roomId);
      expect((state as DoodleChainRoomState).draft).toEqual({ text: '' });
    });
  });

  describe('sitting a step out', () => {
    it('skips a describing step after an empty drawing, and draws the line before', async () => {
      // Ryan's chain: Ryan writes, Leo's drawing is empty, Sam sits out the
      // describing step, and Maya draws Ryan's original prompt.
      const { roomId, players, owner } = await playToWrite(harness, FOUR);
      const [maya, ryan, leo, sam] = players;
      writeAll(players, roomId, [
        'one',
        'a dragon at the dentist',
        'three',
        'four',
      ]);
      await at(owner, 'draw', 2);
      drawAll(players, roomId, [true, true, false, true]);
      const describing = await Promise.all(
        players.map((p) => at(p, 'describe', 3)),
      );

      const samView = describing[3]!;
      expect(samView.task).toMatchObject({ chain: 1, sitsOut: true });
      expect(samView.task?.given).toBeUndefined();
      expect(samView.task?.skipped).toMatchObject({
        author: { username: 'Leo' },
        content: { type: 'empty', reason: 'time' },
      });
      expect(describing[0]!.table[sam.playerId]).toEqual({
        done: false,
        sitsOut: true,
      });

      // Sam has nothing to do, so the step ends without him.
      const drawAgain = Promise.all(players.map((p) => at(p, 'draw', 4)));
      writeAll([maya, ryan, leo], roomId, ['a', 'b', 'c']);
      const step4 = await drawAgain;
      expect(step4[0]!.task?.chain).toBe(1);
      expect(step4[0]!.task?.given?.content).toEqual({
        type: 'text',
        text: 'a dragon at the dentist',
      });
    });
  });

  describe('leaving and coming back', () => {
    it('sends a leaver who came back to watch no drawing to describe', async () => {
      const { roomId, players, owner } = await playToWrite(harness, FOUR);
      const [maya, ryan, leo, sam] = players;
      writeAll(players, roomId, ['one', 'two', 'three', 'four']);
      await at(owner, 'draw', 2);

      // Leo leaves and comes straight back, as a spectator of the game.
      leo.emit('room:leave', roomId);
      await settle();
      await joinRoom(leo, roomId, 'Leo', '', 'spectator');
      const received = collect(leo, 'dc:drawing');
      const describing = at(leo, 'describe', 3);
      drawAll([maya, ryan, sam], roomId, [true, true, true]);
      const view = await describing;
      await settle();

      // At step 3 his place would describe Ryan's drawing of Maya's line.
      expect(view.task).toBeUndefined();
      expect(received).toHaveLength(0);
    });

    it('keeps what a leaver made, and makes their later steps empty', async () => {
      const { roomId, players, owner } = await playToWrite(harness, FOUR);
      const [maya, ryan, leo, sam] = players;
      writeAll(players, roomId, ['one', 'two', 'three', 'four']);
      await at(owner, 'draw', 2);

      // Leo draws a line and leaves before pressing Done.
      scribble(leo, roomId);
      await settle();
      leo.emit('room:leave', roomId);
      const describing = at(owner, 'describe', 3);
      drawAll([maya, ryan, sam], roomId, [true, true, true]);
      await describing;
      const chains = chainsOf(harness, roomId);
      expect(chains[1]![1]).toMatchObject({
        author: 'Leo',
        content: { type: 'drawing' },
      });

      // At step 3 Leo would describe Maya's chain: it is empty, so at step 4
      // Sam sits it out.
      const step4 = at(owner, 'draw', 4);
      writeAll([maya, ryan, sam], roomId, ['x', 'y', 'z']);
      const view = await step4;
      expect(chainsOf(harness, roomId)[0]![2]).toMatchObject({
        author: 'Leo',
        content: { type: 'empty', reason: 'left' },
      });
      expect(view.table[sam.playerId]?.sitsOut).toBe(true);
      // Leo stays in the order, and in the reveal under his name.
      expect(view.order.map((player) => player.username)).toEqual(FOUR);
    });

    it('gives a returning drawer their strokes back', async () => {
      const { roomId, players, owner } = await playToWrite(harness, THREE);
      writeAll(players, roomId, ['one', 'two', 'three']);
      await at(owner, 'draw', 2);
      const ryan = players[1];
      scribble(ryan, roomId, 50);
      await settle();

      const back = await harness.reload(ryan);
      const synced = waitFor(back, 'dc:canvas:sync');
      const { state } = await syncRoom(back, roomId);
      const [, strokes] = await synced;
      expect((state as DoodleChainRoomState).task?.given?.author.username).toBe(
        'Maya',
      );
      expect(strokes.map((stroke) => stroke.points.length)).toEqual([2]);
    });

    it('goes straight to the reveal when fewer than two are left', async () => {
      const { roomId, players } = await playToWrite(harness, THREE);
      const [maya, ryan, leo] = players;
      maya.emit('dc:text', roomId, { text: 'kept' });
      await settle();
      const reveal = at(maya, 'reveal');
      ryan.emit('room:leave', roomId);
      leo.emit('room:leave', roomId);
      const state = await reveal;
      expect(state.reveal?.entries[0]?.[0]?.content).toEqual({
        type: 'text',
        text: 'kept',
      });
      // Ryan's and Leo's chains still start with something.
      expect(state.reveal?.chains.map((chain) => chain.length)).toEqual([
        1, 1, 1,
      ]);
    });
  });

  describe('the reveal', () => {
    it('shows one entry at a time, only for the host, only the one it names', async () => {
      const { roomId, players, owner, first } = await playToReveal(harness);
      const [, ryan] = players;
      expect(first.reveal).toMatchObject({ chain: 0, shown: 1, total: 1 });
      expect(first.reveal?.entries).toHaveLength(1);
      expect(first.reveal?.entries[0]).toHaveLength(1);
      expect(first.phaseEndsInMs).toBe(0);

      ryan.emit('dc:reveal:next', roomId, 1);
      await settle();
      expect((doodleChainRoom(harness, roomId).game.reveal ?? {}).shown).toBe(
        1,
      );

      const drawings = collect(ryan, 'dc:drawing');
      const second = waitForDoodleChainState(
        ryan,
        (s) => s.reveal?.total === 2,
      );
      // A double tap names the same entry twice, and shows it once.
      owner.emit('dc:reveal:next', roomId, 1);
      owner.emit('dc:reveal:next', roomId, 1);
      const shown = await second;
      await settle();
      expect(shown.reveal?.shown).toBe(2);
      expect(shown.reveal?.entries[0]?.[1]?.content.type).toBe('drawing');
      expect(drawings).toHaveLength(1);
    });

    it('takes one heart per chain, never on your own entry, and counts them', async () => {
      const { roomId, players, owner } = await playToReveal(harness);
      const [maya, ryan, leo] = players;
      // Show the whole of Maya's chain: her line, Ryan's drawing, Leo's words.
      for (const total of [1, 2]) owner.emit('dc:reveal:next', roomId, total);
      await waitForDoodleChainState(owner, (s) => s.reveal?.shown === 3);

      // Maya cannot heart her own line; a step not shown cannot be hearted.
      maya.emit('dc:heart', roomId, 0, 1);
      leo.emit('dc:heart', roomId, 1, 1);
      leo.emit('dc:heart', roomId, 0, 2);
      const given = await waitForDoodleChainState(
        owner,
        (s) => s.reveal?.entries[0]?.[1]?.hearts === 1,
      );
      expect(given.reveal?.entries[0]?.[0]?.hearts).toBe(0);
      expect(given.playerList[ryan.playerId]?.points).toBe(1);

      // Moving the heart moves the point.
      leo.emit('dc:heart', roomId, 0, 1);
      const moved = await waitForDoodleChainState(
        leo,
        (s) => s.reveal?.entries[0]?.[0]?.hearts === 1,
      );
      expect(moved.reveal?.entries[0]?.[1]?.hearts).toBe(0);
      expect(moved.reveal?.hearts).toEqual({ 0: 1 });
      expect(moved.playerList[maya.playerId]?.points).toBe(1);
      expect(moved.playerList[ryan.playerId]?.points).toBe(0);

      // And pressing it again takes it back.
      leo.emit('dc:heart', roomId, 0, null);
      const back = await waitForDoodleChainState(
        leo,
        (s) => s.reveal?.entries[0]?.[0]?.hearts === 0,
      );
      expect(back.reveal?.hearts).toEqual({});
    });

    it('gives a spectator the drawings but no heart', async () => {
      const { roomId, owner } = await playToReveal(harness);
      const spectator = await harness.connect();
      await joinRoom(spectator, roomId, 'Noor', '', 'spectator');
      owner.emit('dc:reveal:next', roomId, 1);
      await waitForDoodleChainState(owner, (s) => s.reveal?.shown === 2);

      const drawings = waitFor(spectator, 'dc:drawing');
      await syncRoom(spectator, roomId);
      await drawings;
      spectator.emit('dc:heart', roomId, 0, 2);
      await settle();
      expect(doodleChainRoom(harness, roomId).game.hearts.size).toBe(0);
    });

    it('ends in the album, with the crowd favourite and the hearts ranked', async () => {
      const { roomId, players, owner } = await playToReveal(harness);
      const [, ryan, leo] = players;
      // Every chain has three entries; show all nine, at a host's pace, as
      // the host's clicks share the room budget of four a second.
      for (let total = 1; total < 9; total += 1) {
        await settle(250);
        const next = waitForDoodleChainState(
          owner,
          (s) => s.reveal?.total === total + 1,
        );
        owner.emit('dc:reveal:next', roomId, total);
        await next;
        if (total === 2) leo.emit('dc:heart', roomId, 0, 2);
        if (total === 2) owner.emit('dc:heart', roomId, 0, 2);
      }
      const album = at(ryan, 'waiting');
      await settle(250);
      owner.emit('dc:reveal:next', roomId, 9);
      const state = await album;
      expect(state.isGameStarted).toBe(false);
      expect(state.lastGame?.endedEarly).toBe(false);
      expect(state.lastGame?.chains.map((c) => c.entries.length)).toEqual([
        3, 3, 3,
      ]);
      expect(state.lastGame?.favourites).toEqual([{ chain: 0, step: 2 }]);
      expect(state.lastGame?.standings[0]).toMatchObject({
        username: 'Ryan',
        points: 2,
      });
      expect(state.reveal).toBeUndefined();
    });
  });
});
