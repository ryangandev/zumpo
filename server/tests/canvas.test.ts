import { describe, expect, it } from 'vitest';
import {
  MAX_POINTS_PER_CANVAS,
  beginStroke,
  clearCanvas,
  createRoomCanvas,
  extendStroke,
  undoStroke,
} from '../libs/drawing/canvas.js';

const at = (x: number, y: number) => ({ x, y });

describe('a room canvas', () => {
  it('builds a stroke from a first point and its continuations', () => {
    const canvas = createRoomCanvas();

    expect(beginStroke(canvas, '#ff0000', 4, at(1, 1))).toBe(true);
    expect(extendStroke(canvas, at(2, 2))).toBe(true);

    expect(canvas.strokes).toEqual([
      { color: '#ff0000', size: 4, points: [at(1, 1), at(2, 2)] },
    ]);
    expect(canvas.pointCount).toBe(2);
  });

  it('refuses to extend a stroke that was never started', () => {
    const canvas = createRoomCanvas();

    expect(extendStroke(canvas, at(1, 1))).toBe(false);
    expect(canvas.strokes).toEqual([]);
  });

  it('gives back the points of a stroke it drops', () => {
    const canvas = createRoomCanvas();
    beginStroke(canvas, '#000000', 4, at(1, 1));
    extendStroke(canvas, at(2, 2));
    beginStroke(canvas, '#000000', 4, at(3, 3));

    undoStroke(canvas);

    expect(canvas.strokes).toHaveLength(1);
    expect(canvas.pointCount).toBe(2);
  });

  it('survives an undo with nothing to undo', () => {
    const canvas = createRoomCanvas();

    undoStroke(canvas);

    expect(canvas.strokes).toEqual([]);
    expect(canvas.pointCount).toBe(0);
  });

  it('forgets everything on a clear', () => {
    const canvas = createRoomCanvas();
    beginStroke(canvas, '#000000', 4, at(1, 1));
    extendStroke(canvas, at(2, 2));

    clearCanvas(canvas);

    expect(canvas.strokes).toEqual([]);
    expect(canvas.pointCount).toBe(0);
  });

  /*
   * Payload sizes are bounded; how many of them arrive is what this bounds. A
   * client emitting `continueDrawing` in a loop would otherwise grow this array
   * for as long as the room existed.
   */
  it('stops accepting points once the canvas is full', () => {
    const canvas = createRoomCanvas();
    beginStroke(canvas, '#000000', 4, at(0, 0));
    while (canvas.pointCount < MAX_POINTS_PER_CANVAS) {
      expect(extendStroke(canvas, at(1, 1))).toBe(true);
    }

    // Refused, and - because the caller relays only what it managed to
    // store - not sent on to anybody else either.
    expect(extendStroke(canvas, at(2, 2))).toBe(false);
    expect(beginStroke(canvas, '#000000', 4, at(2, 2))).toBe(false);
    expect(canvas.pointCount).toBe(MAX_POINTS_PER_CANVAS);

    // ...and there is room again as soon as something is taken away.
    undoStroke(canvas);
    expect(beginStroke(canvas, '#000000', 4, at(2, 2))).toBe(true);
  });
});
