import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadForNewDeploy } from './stale-deploy';

describe('reloading for a new deploy', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('reloads once, and not again moments later', () => {
    const reload = vi.fn<() => void>();
    expect(reloadForNewDeploy(1_000_000, reload)).toBe(true);
    expect(reloadForNewDeploy(1_005_000, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again for a later deploy', () => {
    const reload = vi.fn<() => void>();
    reloadForNewDeploy(1_000_000, reload);
    expect(reloadForNewDeploy(1_060_000, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
