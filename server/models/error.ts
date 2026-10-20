import type { ErrorType, RoomError } from '../../shared/wire-types.js';

/**
 * A request the server refuses, with the reason a client is told.
 *
 * Thrown inside a handler (a module's `startGame`, say) and caught by the room
 * layer, which answers it through the request's acknowledgement as
 * `{ ok: false, error }`. Thrown rather than returned because the refusal is
 * usually several calls deep, and every caller in between would otherwise have
 * to pass it along by hand.
 */
class RequestError extends Error {
  readonly type: ErrorType;

  constructor(type: ErrorType, message: string) {
    super(message);
    this.name = 'RequestError';
    this.type = type;
  }
}

/** The failing half of a `Result`. */
interface Failure {
  ok: false;
  error: RoomError;
}

const failure = (type: ErrorType, message: string): Failure => ({
  ok: false,
  error: { type, message },
});

/** What a request that does not fit its schema is answered with. */
const invalidRequest = (message = 'That request was not valid.'): Failure =>
  failure('invalidRequest', message);

/**
 * Turns whatever was thrown into an answer a client can be told about.
 *
 * A `catch` binding is `unknown`, and it is not always one of ours: a bug in a
 * handler throws a `TypeError` down the same path. That is reported as an
 * invalid request with a message that gives nothing away, rather than with
 * whatever the error happened to say about the server's insides - and logged,
 * since it is a bug and this is the only place that sees it.
 */
const asFailure = (error: unknown): Failure => {
  if (error instanceof RequestError) return failure(error.type, error.message);
  console.error('A request failed with a bug:', error);
  return invalidRequest('Something went wrong.');
};

export { RequestError, failure, invalidRequest, asFailure };
export type { Failure };
export type { ErrorType, RoomError } from '../../shared/wire-types.js';
