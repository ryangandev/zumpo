import { z } from 'zod';
import { roomId } from '../../libs/validation.js';

/**
 * Draw & Guess's own inbound shapes, built from the same primitives the room
 * layer validates with. These used to sit in `libs/validation.ts` alongside
 * the generic ones, which is fine with one game and misleading with two - a
 * brush size is not something the room layer has an opinion about.
 */

const WORD_MAX = 64; // longest plausible word-bank entry, with room to spare

const roundsSetting = z.object({
  rounds: z.number().int().min(1).max(4),
});

const selectWordRequest = z.tuple([roomId, z.string().min(1).max(WORD_MAX)]);

// The canvas is a fixed 798x598; allow a small margin for rounding at the edges.
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

export {
  roundsSetting,
  selectWordRequest,
  startDrawingRequest,
  continueDrawingRequest,
};
