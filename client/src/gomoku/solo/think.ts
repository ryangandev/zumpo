import type { GomokuColor, GomokuMove } from '../../../../shared/wire-types';
import { chooseMove, PAGE_SEARCH_MS, type GomokuLevel } from './computer';

export interface MoveRequest {
  id: number;
  moves: readonly GomokuMove[];
  color: GomokuColor;
  level: GomokuLevel;
}

interface MoveAnswer {
  id: number;
  point: number;
}

let worker: Worker | null | undefined;
let asked = 0;

/** One worker for the page, made on the first move; none where there are none. */
function workerFor(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker =
      typeof Worker === 'undefined'
        ? null
        : new Worker(new URL('./worker.ts', import.meta.url), {
            type: 'module',
          });
  } catch {
    worker = null;
  }
  return worker;
}

/** The move worked out on the page's own thread, its search kept short. */
const hereFor = (
  moves: readonly GomokuMove[],
  color: GomokuColor,
  level: GomokuLevel,
) => chooseMove(moves, color, level, Math.random, undefined, PAGE_SEARCH_MS);

/**
 * The computer's move for `color` after `moves`: worked out in a Web Worker,
 * or here where the browser has none (or it fails), as the tests run it.
 * Once `signal` aborts, as when a game is left mid-thought, the move is
 * dropped and rejects with the signal's reason; a worker still busy with it
 * is stopped and a fresh one started, so the next game's first move waits
 * for nothing.
 */
export function think(
  moves: readonly GomokuMove[],
  color: GomokuColor,
  level: GomokuLevel,
  signal?: AbortSignal,
): Promise<number> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const thread = workerFor();
  if (!thread) return Promise.resolve(hereFor(moves, color, level));
  asked += 1;
  const id = asked;
  return new Promise((resolve, reject) => {
    const done = () => {
      thread.removeEventListener('message', onAnswer);
      thread.removeEventListener('error', onError);
      thread.removeEventListener('messageerror', onError);
      signal?.removeEventListener('abort', onAbort);
    };
    /** Drops `thread` for good: the next move makes a new one, if it can. */
    const drop = (next: null | undefined) => {
      if (worker !== thread) return;
      thread.terminate();
      worker = next;
    };
    const onAnswer = (event: MessageEvent<MoveAnswer>) => {
      if (event.data.id !== id) return;
      done();
      resolve(event.data.point);
    };
    // A worker that failed, say to load after a deploy, never answers again:
    // this move and every one after it is worked out here.
    const onError = () => {
      done();
      drop(null);
      resolve(hereFor(moves, color, level));
    };
    const onAbort = () => {
      done();
      drop(undefined);
      // Its successor starts loading now, ready by the next game's move.
      workerFor();
      reject(signal?.reason);
    };
    thread.addEventListener('message', onAnswer);
    thread.addEventListener('error', onError);
    thread.addEventListener('messageerror', onError);
    signal?.addEventListener('abort', onAbort);
    // A worker's message has no target origin; it has nothing to transfer.
    thread.postMessage({ id, moves, color, level } satisfies MoveRequest, []);
  });
}
