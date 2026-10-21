import { z } from 'zod';
import { roomId } from '../../libs/validation.js';
import { POINTS } from '../../../shared/gomoku.js';

/** Gomoku's own inbound shapes. */

// Nothing to choose: the seats are always two, which the room layer checks.
const noSettings = z.object({}).strict();

// A point on the board. Whether it is empty, and whether it is this player's
// turn, is the engine's to judge.
const placeRequest = z.tuple([
  roomId,
  z
    .number()
    .int()
    .min(0)
    .max(POINTS - 1),
]);

const resignRequest = z.tuple([roomId]);

export { noSettings, placeRequest, resignRequest };
