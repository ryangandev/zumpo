import { afterEach, describe, expect, it, vi } from 'vitest';
import { CENTRE } from '../../../../shared/gomoku';

/** A worker that fails to load: it says so once, then never answers. */
class BrokenWorker extends EventTarget {
  static made = 0;
  terminated = false;
  constructor() {
    super();
    BrokenWorker.made += 1;
  }
  postMessage() {
    if (this.terminated) return;
    queueMicrotask(() => this.dispatchEvent(new Event('error')));
    this.terminated = true;
  }
  terminate() {
    this.terminated = true;
  }
}

/** A worker that takes its time: it answers only when the test says so. */
class SlowWorker extends EventTarget {
  static made: SlowWorker[] = [];
  asked: { id: number }[] = [];
  terminated = false;
  constructor() {
    super();
    SlowWorker.made.push(this);
  }
  postMessage(request: { id: number }) {
    this.asked.push(request);
  }
  answer(point: number) {
    const { id } = this.asked.at(-1)!;
    this.dispatchEvent(new MessageEvent('message', { data: { id, point } }));
  }
  terminate() {
    this.terminated = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('the computer’s thinking', () => {
  it('works every move out here once its worker has failed', async () => {
    vi.stubGlobal('Worker', BrokenWorker);
    const { think } = await import('./think');

    expect(await think([], 'black', 'easy')).toBe(CENTRE);
    const reply = await think(
      [{ color: 'black', point: CENTRE }],
      'white',
      'medium',
    );
    expect(reply).not.toBe(CENTRE);
    expect(BrokenWorker.made).toBe(1);
  });

  it('keeps its search short on the page’s own thread', async () => {
    vi.stubGlobal('Worker', BrokenWorker);
    const computer = await import('./computer');
    const chooseMove = vi.spyOn(computer, 'chooseMove');
    const { think } = await import('./think');

    await think([], 'black', 'hard');
    expect(chooseMove).toHaveBeenCalledWith(
      [],
      'black',
      'hard',
      expect.any(Function),
      undefined,
      computer.PAGE_SEARCH_MS,
    );
  });

  it('stops a busy worker when its move is dropped, for a fresh one', async () => {
    SlowWorker.made = [];
    vi.stubGlobal('Worker', SlowWorker);
    const { think } = await import('./think');

    const leaving = new AbortController();
    const dropped = think([], 'black', 'hard', leaving.signal);
    leaving.abort();
    await expect(dropped).rejects.toHaveProperty('name', 'AbortError');
    expect(SlowWorker.made[0]?.terminated).toBe(true);
    // The next worker is on its way before the next move is asked.
    expect(SlowWorker.made).toHaveLength(2);

    const next = think([], 'black', 'hard');
    expect(SlowWorker.made).toHaveLength(2);
    SlowWorker.made[1]?.answer(CENTRE);
    expect(await next).toBe(CENTRE);
  });

  it('keeps its worker for the next move once a move is answered', async () => {
    SlowWorker.made = [];
    vi.stubGlobal('Worker', SlowWorker);
    const { think } = await import('./think');

    const playing = new AbortController();
    const first = think([], 'black', 'hard', playing.signal);
    SlowWorker.made[0]?.answer(CENTRE);
    expect(await first).toBe(CENTRE);
    playing.abort();

    void think([{ color: 'black', point: CENTRE }], 'white', 'hard');
    expect(SlowWorker.made).toHaveLength(1);
    expect(SlowWorker.made[0]?.terminated).toBe(false);
  });
});
