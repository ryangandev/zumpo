import type { GomokuColor, GomokuMove } from '../../../../shared/wire-types';
import { chooseMove, type GomokuLevel } from './computer';

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

/**
 * The computer's move for `color` after `moves`: worked out in a Web Worker,
 * or here where the browser has none (or it fails), as the tests run it.
 */
export function think(
  moves: readonly GomokuMove[],
  color: GomokuColor,
  level: GomokuLevel,
): Promise<number> {
  const thread = workerFor();
  if (!thread) return Promise.resolve(chooseMove(moves, color, level));
  asked += 1;
  const id = asked;
  return new Promise((resolve) => {
    const settle = (point: number) => {
      thread.removeEventListener('message', onAnswer);
      thread.removeEventListener('error', onError);
      thread.removeEventListener('messageerror', onError);
      resolve(point);
    };
    const onAnswer = (event: MessageEvent<MoveAnswer>) => {
      if (event.data.id === id) settle(event.data.point);
    };
    // A worker that failed, say to load after a deploy, never answers again:
    // this move and every one after it is worked out here.
    const onError = () => {
      if (worker === thread) {
        thread.terminate();
        worker = null;
      }
      settle(chooseMove(moves, color, level));
    };
    thread.addEventListener('message', onAnswer);
    thread.addEventListener('error', onError);
    thread.addEventListener('messageerror', onError);
    // A worker's message has no target origin; it has nothing to transfer.
    thread.postMessage({ id, moves, color, level } satisfies MoveRequest, []);
  });
}
