import { z } from 'zod';
import { roomId } from '../validation.js';

/**
 * The inbound shapes of a drawing, the same for every game that has one: the
 * canvas is a fixed 798x598, with a small margin for rounding at the edges.
 */
const coordinate = z.object({
  x: z.number().finite().min(-10).max(1000),
  y: z.number().finite().min(-10).max(1000),
});
const brushColor = z.string().regex(/^#[0-9a-fA-F]{3,8}$/);
const brushSize = z.number().finite().min(1).max(100);

// A stroke is described in full from its first point, so any client can replay
// it without waiting to learn the colour from a later event.
const startDrawingRequest = z.tuple([
  roomId,
  coordinate,
  brushColor,
  brushSize,
]);
// Every later point belongs to that stroke, brush and all.
const continueDrawingRequest = z.tuple([roomId, coordinate]);

export { startDrawingRequest, continueDrawingRequest };
