import { chooseMove } from './computer';
import type { MoveRequest } from './think';

/** The worker's own scope, which the page's DOM types do not describe. */
const scope = self as unknown as {
  postMessage: (message: unknown, transfer: Transferable[]) => void;
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<MoveRequest>) => void,
  ) => void;
};

// The computer's search, off the page's thread, so the page never freezes.
scope.addEventListener('message', (event) => {
  const { id, moves, color, level } = event.data;
  // A worker's message has no target origin; it has nothing to transfer.
  scope.postMessage({ id, point: chooseMove(moves, color, level) }, []);
});
