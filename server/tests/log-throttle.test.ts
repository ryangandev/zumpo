import { describe, expect, it, vi } from 'vitest';
import { createLogThrottle } from '../libs/log-throttle.js';

describe('a log line a client can repeat', () => {
  it('is written once a while per key, with a count of the rest', () => {
    let nowMs = 0;
    const write = vi.fn<(line: string) => void>();
    const warn = createLogThrottle(5000, write, () => nowMs);

    for (let i = 0; i < 100; i++) warn('chat:send', () => 'Rejected chat');
    warn('room:join', () => 'Rejected join');
    nowMs = 5000;
    warn('chat:send', () => 'Rejected chat');

    expect(write.mock.calls.map(([line]) => line)).toEqual([
      'Rejected chat',
      'Rejected join',
      'Rejected chat (and 99 more like it)',
    ]);
  });
});
