import type { Coordinate, RoomCanvas } from '../../models/types.js';

/**
 * A drawing, kept where a late arrival can be told about it: Draw & Guess's
 * one per room, and each of Doodle Chain's entries.
 *
 * The canvas used to live only in each client's memory: the server relayed
 * stroke events and kept none of them, so anyone who arrived after a stroke was
 * drawn - a joiner, or a player coming back from a reload - sat in front of an
 * empty board until the drawer happened to draw again. It was also why a
 * reloading drawer lost their turn rather than resuming it; there was nothing
 * to resume to.
 *
 * The undo rewrite already put the drawing in a replayable form. This is the
 * same stroke list every client builds from the same events, built once more on
 * the server so it can be handed to whoever turns up next.
 */

/**
 * How many points a single drawing may hold before further ones are
 * dropped, by the drawer and by the relay alike.
 *
 * A full-tilt 90-second phase is on the order of 5,000 points, so this is well
 * clear of honest play - it is here because a modified client emitting
 * `continueDrawing` in a loop would otherwise grow this array for as long as
 * the room existed. Dropping the event rather than just declining to store it
 * is what keeps every client's copy identical to the server's.
 */
const MAX_POINTS_PER_CANVAS = 20_000;

const createRoomCanvas = (): RoomCanvas => ({ strokes: [], pointCount: 0 });

const clearCanvas = (canvas: RoomCanvas): void => {
  canvas.strokes = [];
  canvas.pointCount = 0;
};

/** Returns false when the canvas is full, which means: do not relay this. */
const beginStroke = (
  canvas: RoomCanvas,
  color: string,
  size: number,
  at: Coordinate,
): boolean => {
  if (canvas.pointCount >= MAX_POINTS_PER_CANVAS) return false;

  canvas.strokes.push({ color, size, points: [at] });
  canvas.pointCount += 1;
  return true;
};

/**
 * Returns false when the canvas is full, or when there is no stroke in
 * progress - a `continueDrawing` with no `startDrawing` before it cannot have
 * come from the canvas, and replaying it would draw a line from wherever the
 * last path happened to end.
 */
const extendStroke = (canvas: RoomCanvas, at: Coordinate): boolean => {
  if (canvas.pointCount >= MAX_POINTS_PER_CANVAS) return false;

  const current = canvas.strokes.at(-1);
  if (!current) return false;

  current.points.push(at);
  canvas.pointCount += 1;
  return true;
};

const undoStroke = (canvas: RoomCanvas): void => {
  const dropped = canvas.strokes.pop();
  if (dropped) canvas.pointCount -= dropped.points.length;
};

export {
  MAX_POINTS_PER_CANVAS,
  createRoomCanvas,
  clearCanvas,
  beginStroke,
  extendStroke,
  undoStroke,
};
