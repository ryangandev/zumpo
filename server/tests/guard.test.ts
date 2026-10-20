import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoomTimers } from '../libs/rooms/timers.js';
import { onClientRequest, type IoSocket } from '../libs/rooms/emit.js';
import { asFailure, RequestError } from '../models/error.js';

/** Just enough of a socket to register a handler on and fire it. */
const fakeSocket = () => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    data: { playerId: 'p1' },
    on: (event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    },
  } as unknown as IoSocket;
  const fire = (event: string, ...args: unknown[]) =>
    handlers.get(event)?.(...args);
  return { socket, fire };
};

describe('a bug in one event or timer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is logged, and the request it broke is still answered', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { socket, fire } = fakeSocket();
    onClientRequest(socket, 'room:sync', () => {
      throw new TypeError('a bug');
    });
    const ack = vi.fn<(answer: unknown) => void>();

    expect(() => fire('room:sync', 'room-1', ack)).not.toThrow();

    expect(ack).toHaveBeenCalledWith({
      ok: false,
      error: { type: 'invalidRequest', message: 'Something went wrong.' },
    });
    expect(logged).toHaveBeenCalledWith(
      '"room:sync" from player p1 in room room-1 failed:',
      expect.any(TypeError),
    );
  });

  it('costs only its own timer', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const timers = createRoomTimers(() => true);
    const later = vi.fn<() => void>();

    timers.add('room-1', 0, () => {
      throw new TypeError('a bug');
    });
    timers.add('room-1', 5, later);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(later).toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(
      'A timer in room room-1 failed:',
      expect.any(TypeError),
    );
  });

  it('is logged when a request turns it into a refusal, and a refusal is not', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(asFailure(new RequestError('notRoomOwner', 'Not yours.'))).toEqual({
      ok: false,
      error: { type: 'notRoomOwner', message: 'Not yours.' },
    });
    expect(logged).not.toHaveBeenCalled();

    const bug = new TypeError('a bug');
    expect(asFailure(bug)).toMatchObject({ error: { type: 'invalidRequest' } });
    expect(logged).toHaveBeenCalledWith('A request failed with a bug:', bug);
  });
});
