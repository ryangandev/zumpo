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
});
