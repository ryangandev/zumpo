import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CanvasStroke, ServerToClientEvent } from '../models/types.js';
import {
  collect,
  createRoom,
  joinRoom,
  playToDrawingPhase,
  request,
  settle,
  SLOW_DRAWING,
  startTestServer,
  waitFor,
  waitForDrawState,
  type ClientSocket,
  type TestServer,
} from './helpers/test-server.js';

const RED = '#ff0000';
const DOT = { x: 10, y: 20 };

/** What the server would hand somebody arriving in this room right now. */
const canvasSeenOnArrival = async (
  client: ClientSocket,
  roomId: string,
): Promise<CanvasStroke[]> => {
  const synced = waitFor(client, 'dg:canvas:sync');
  await request(client, 'room:sync', roomId);
  const [forRoom, strokes] = await synced;
  expect(forRoom).toBe(roomId);
  return strokes;
};

describe('the whiteboard relay', () => {
  let harness: TestServer;

  beforeEach(async () => {
    // A drawing phase long enough to make every assertion inside one.
    harness = await startTestServer(SLOW_DRAWING);
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('relays a stroke to the rest of the room, colour and size included', async () => {
    const { drawer, guesser, roomId } = await playToDrawingPhase(harness);

    const started = waitFor(guesser, 'dg:canvas:start');
    drawer.emit('dg:draw:start', roomId, DOT, RED, 8);
    expect(await started).toEqual([roomId, DOT, RED, 8]);

    const continued = waitFor(guesser, 'dg:canvas:move');
    drawer.emit('dg:draw:move', roomId, { x: 30, y: 40 });
    // The stroke already owns its colour and size, so a move carries only the point.
    expect(await continued).toEqual([roomId, { x: 30, y: 40 }]);

    // Carries nothing but the room: the stroke is already fully described.
    const stopped = waitFor(guesser, 'dg:canvas:end');
    drawer.emit('dg:draw:end', roomId);
    await expect(stopped).resolves.toEqual([roomId]);
  });

  /*
   * A stroke describes itself from its first point, so a client can replay it
   * without waiting to learn the colour from a later event. That is what makes
   * the stroke list - and so a one-byte undo - possible.
   */
  it('describes a stroke fully from its first point', async () => {
    const { drawer, guesser, roomId } = await playToDrawingPhase(harness);

    const started = waitFor(guesser, 'dg:canvas:start');
    drawer.emit('dg:draw:start', roomId, { x: 1, y: 1 }, '#00ff00', 24);

    const [, , color, size] = await started;
    expect(color).toBe('#00ff00');
    expect(size).toBe(24);
  });

  /*
   * Undo used to carry a full-canvas PNG data URL - on the order of 100KB to
   * 1MB, per undo. Every client holds the same stroke list, so "drop the last
   * one" is the entire message.
   */
  it('sends an undo with nothing but the room it is for', async () => {
    const { drawer, guesser, roomId } = await playToDrawingPhase(harness);

    const undone = collect(guesser, 'dg:canvas:undo');
    drawer.emit('dg:draw:undo', roomId);
    await settle();

    expect(undone).toEqual([[roomId]]);
  });

  it('relays a clear', async () => {
    const { drawer, guesser, roomId } = await playToDrawingPhase(harness);

    const cleared = waitFor(guesser, 'dg:canvas:clear');
    drawer.emit('dg:draw:clear', roomId);
    await expect(cleared).resolves.toEqual([roomId]);
  });

  it('does not echo a stroke back to the client that drew it', async () => {
    const { drawer, guesser, roomId } = await playToDrawingPhase(harness);

    const echoed = collect(drawer, 'dg:canvas:start');
    const relayed = collect(guesser, 'dg:canvas:start');
    drawer.emit('dg:draw:start', roomId, { x: 5, y: 5 }, RED, 4);
    await settle();

    expect(echoed).toEqual([]);
    expect(relayed).toHaveLength(1);
  });

  it('drops a stroke that could not have come from the canvas', async () => {
    const { drawer, guesser, roomId } = await playToDrawingPhase(harness);

    const relayed = collect(guesser, 'dg:canvas:start');

    const untyped = drawer as unknown as {
      emit: (...args: unknown[]) => void;
    };
    drawer.emit('dg:draw:start', roomId, { x: 1e9, y: 1e9 }, RED, 8);
    drawer.emit('dg:draw:start', roomId, { x: 1, y: 1 }, 'red', 8);
    drawer.emit('dg:draw:start', roomId, { x: 1, y: 1 }, RED, 1e6);
    untyped.emit('dg:draw:start', roomId, { x: 1, y: 1 }, RED);
    untyped.emit('dg:draw:start', roomId);
    await settle();

    expect(relayed).toEqual([]);
    expect(drawer.connected).toBe(true);
  });

  it('drops a stroke aimed at something that is not a room id', async () => {
    const { drawer, guesser } = await playToDrawingPhase(harness);

    const relayed = collect(guesser, 'dg:canvas:start');
    drawer.emit('dg:draw:start', '../../admin', { x: 1, y: 1 }, RED, 8);
    await settle();

    expect(relayed).toEqual([]);
  });
});

/*
 * The drawing used to live only in each client's memory: the server relayed
 * stroke events and kept none of them, so anyone arriving after a stroke was
 * drawn sat in front of an empty board until the drawer happened to draw again.
 */
describe('the stored drawing', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer(SLOW_DRAWING);
  });

  afterEach(async () => {
    await harness.teardown();
  });

  /*
   * A room in progress is closed to new players, so the arrival this matters
   * for is a player who is already in the room and whose page has just
   * (re)mounted - a reload, or a navigation back into the room.
   */
  it('hands the drawing so far to a player arriving mid-turn', async () => {
    const { drawer, guesser, roomId } = await playToDrawingPhase(harness);

    drawer.emit('dg:draw:start', roomId, { x: 1, y: 2 }, RED, 4);
    drawer.emit('dg:draw:move', roomId, { x: 3, y: 4 });
    drawer.emit('dg:draw:end', roomId);
    drawer.emit('dg:draw:start', roomId, { x: 9, y: 9 }, '#0000ff', 10);
    await settle();

    expect(await canvasSeenOnArrival(guesser, roomId)).toEqual([
      {
        color: RED,
        size: 4,
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
      },
      { color: '#0000ff', size: 10, points: [{ x: 9, y: 9 }] },
    ]);
  });

  it('drops the last stroke on undo, and all of them on clear', async () => {
    const { drawer, guesser, roomId } = await playToDrawingPhase(harness);

    drawer.emit('dg:draw:start', roomId, { x: 1, y: 1 }, RED, 4);
    drawer.emit('dg:draw:start', roomId, { x: 2, y: 2 }, RED, 4);
    drawer.emit('dg:draw:undo', roomId);
    await settle();

    expect(await canvasSeenOnArrival(guesser, roomId)).toEqual([
      { color: RED, size: 4, points: [{ x: 1, y: 1 }] },
    ]);

    drawer.emit('dg:draw:clear', roomId);
    await settle();

    expect(await canvasSeenOnArrival(guesser, roomId)).toEqual([]);
  });

  it('starts every turn with a blank canvas', async () => {
    const { drawer, guesser, roomId } = await playToDrawingPhase(harness);

    drawer.emit('dg:draw:start', roomId, { x: 1, y: 1 }, RED, 4);
    await settle();
    expect(await canvasSeenOnArrival(guesser, roomId)).toHaveLength(1);

    // Wait out this turn; the next one clears the board for everybody.
    await waitForDrawState(
      guesser,
      (s) => s.turn === 2 && s.phase === 'drawing',
      9000,
    );

    expect(await canvasSeenOnArrival(guesser, roomId)).toEqual([]);
  });

  /*
   * The stored drawing is built from the same events the relay broadcasts, in
   * the same place, so an event that is refused reaches neither.
   */
  it('does not record a stroke it refused to relay', async () => {
    const { drawer, guesser, roomId } = await playToDrawingPhase(harness);
    const outsider = await harness.connect();

    outsider.emit('dg:draw:start', roomId, { x: 1, y: 1 }, RED, 4);
    guesser.emit('dg:draw:start', roomId, { x: 2, y: 2 }, RED, 4);
    // A continue with no stroke of its own to extend cannot have come from a
    // canvas, and replaying it would draw from wherever the last path ended.
    drawer.emit('dg:draw:move', roomId, { x: 3, y: 3 });
    await settle();

    expect(await canvasSeenOnArrival(guesser, roomId)).toEqual([]);
  });
});

/*
 * The relay used to check the *shape* of a payload and nothing else - not that
 * the sender was in the room, not that they were the drawer, not that a drawing
 * phase was even running. Room ids are not secret: the lobby list is broadcast
 * to every connected client and carries the id of every room, locked ones
 * included. A client that had never joined could therefore draw on a stranger's
 * canvas, undo their last stroke, or wipe the whole thing mid-turn - and `clear`
 * costs the attacker exactly one emit.
 */
describe('canvas authority', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer(SLOW_DRAWING);
  });

  afterEach(async () => {
    await harness.teardown();
  });

  const everyCanvasEvent: ServerToClientEvent[] = [
    'dg:canvas:start',
    'dg:canvas:move',
    'dg:canvas:end',
    'dg:canvas:undo',
    'dg:canvas:clear',
  ];

  /** Fires all five canvas events at a room and reports what got through. */
  const stormTheCanvas = async (
    client: ClientSocket,
    witness: ClientSocket,
    roomId: string,
  ) => {
    const seen = everyCanvasEvent.map((event) => collect(witness, event));

    client.emit('dg:draw:start', roomId, DOT, RED, 8);
    client.emit('dg:draw:move', roomId, { x: 11, y: 21 });
    client.emit('dg:draw:end', roomId);
    client.emit('dg:draw:undo', roomId);
    client.emit('dg:draw:clear', roomId);
    await settle();

    return seen.flat();
  };

  it('ignores every canvas event from a client that never joined the room', async () => {
    const { drawer, roomId } = await playToDrawingPhase(harness);
    const outsider = await harness.connect();

    expect(await stormTheCanvas(outsider, drawer, roomId)).toEqual([]);
  });

  it('ignores canvas events from a player who is in the room but not drawing', async () => {
    const { guesser, drawer, roomId } = await playToDrawingPhase(harness);

    expect(await stormTheCanvas(guesser, drawer, roomId)).toEqual([]);
  });

  it('ignores canvas events from the drawer once their turn is over', async () => {
    // A reveal long enough to outlast the storm: a short one hands the turn on
    // mid-storm, and the next turn's own canvas clear reads as a leak.
    await harness.teardown();
    harness = await startTestServer({ ...SLOW_DRAWING, reviewing: 5 });
    const { drawer, guesser, roomId } = await playToDrawingPhase(harness);

    // The reveal is not a drawing phase, and neither is anything after it.
    await waitForDrawState(drawer, (s) => s.phase === 'reveal', 9000);

    expect(await stormTheCanvas(drawer, guesser, roomId)).toEqual([]);
  });

  it('ignores canvas events before any game has started', async () => {
    const owner = await harness.connect();
    const guest = await harness.connect();
    const roomId = await createRoom(owner, { username: 'Owner' });
    await joinRoom(guest, roomId, 'Guest');

    expect(await stormTheCanvas(owner, guest, roomId)).toEqual([]);
  });
});
