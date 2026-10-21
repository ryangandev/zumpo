import { z } from 'zod';
import { roomId } from '../../libs/validation.js';
import { CODE_LENGTH } from '../../../shared/code-breaker.js';

/** Code Breaker's own inbound shapes. */

const roundsSetting = z.object({
  rounds: z.union([z.literal(1), z.literal(3)]),
});

// Four digits; whether they are all different is the engine's to check.
const guessRequest = z.tuple([
  roomId,
  z.string().regex(new RegExp(`^[0-9]{${CODE_LENGTH}}$`)),
]);

export { roundsSetting, guessRequest };
