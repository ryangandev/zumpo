/**
 * Runs `work`, and logs what it throws instead of letting it escape.
 *
 * Everything the server does starts from a socket event or a timer, and an
 * exception escaping either is uncaught: the process ends, and every room in
 * it with it, for a bug in one. Caught here, the bug costs the one event or
 * timer it was in, and the log says which.
 *
 * `what` names the work for the log; a function is only called on a failure.
 * Returns whether `work` finished.
 */
const guard = (what: string | (() => string), work: () => void): boolean => {
  try {
    work();
    return true;
  } catch (error) {
    console.error(`${typeof what === 'string' ? what : what()} failed:`, error);
    return false;
  }
};

export { guard };
