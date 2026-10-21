import { z } from 'zod';
import { roomId } from '../../libs/validation.js';
import {
  DRAWING_SECONDS,
  MAX_PLAYERS,
  MAX_STEPS,
  SUGGESTION_COUNT,
  TEXT_MAX,
} from '../../../shared/doodle-chain.js';

/** Doodle Chain's own inbound shapes; a stroke's are in `libs/drawing/`. */

const drawingTimeSetting = z
  .object({
    drawingSeconds: z.union(
      DRAWING_SECONDS.map((seconds) => z.literal(seconds)),
    ),
  })
  .strict();

// Room for spaces around the words, which are trimmed before the limit.
const draft = z.union([
  z.object({ text: z.string().max(TEXT_MAX * 2) }).strict(),
  z
    .object({
      suggestion: z
        .number()
        .int()
        .min(0)
        .max(SUGGESTION_COUNT - 1),
    })
    .strict(),
]);

const textRequest = z.tuple([roomId, draft]);

const doneRequest = z.tuple([roomId, z.boolean()]);

// Whether it names the entries shown now is the engine's to check.
const nextRequest = z.tuple([roomId, z.number().int().min(0).max(1000)]);

const heartRequest = z.tuple([
  roomId,
  z
    .number()
    .int()
    .min(0)
    .max(MAX_PLAYERS - 1),
  z.number().int().min(1).max(MAX_STEPS).nullable(),
]);

export {
  doneRequest,
  drawingTimeSetting,
  heartRequest,
  nextRequest,
  textRequest,
};
