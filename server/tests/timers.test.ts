import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IoServer } from '../libs/rooms/emit.js';
import { createRoomRegistry } from '../libs/rooms/registry.js';
import { createRoomTimers } from '../libs/rooms/timers.js';
import type { Room } from '../libs/rooms/types.js';

/** A registry whose sends go nowhere, to drive its clocks directly. */
const makeRegistry = () => {
  const io = { to: () => ({ emit: () => true }) } as unknown as IoServer;
  return createRoomRegistry(io);
};

const makeRoom = (roomId = 'room-1'): Room => ({
  gameType: 'pairs',
  roomId,
  roomName: 'Room',
  owner: { username: 'Owner', playerId: 'owner' },
  maxPlayers: 4,
  password: '',
  inviteKey: '',
  playerList: { owner: { username: 'Owner', points: 0, isConnected: true } },
  spectators: {},
  isGameStarted: true,
  phaseEndsAt: 0,
  chat: { nextId: 1, messages: [] },
  game: {},
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('room timers', () => {
  it('replaces what was pending for a room when set again', () => {
    const timers = createRoomTimers(() => true);
    const fired: string[] = [];
    timers.set('a', 100, () => fired.push('first'));
    timers.set('a', 200, () => fired.push('second'));

    vi.advanceTimersByTime(300);
    expect(fired).toEqual(['second']);
  });

  it('keeps several for one room when added, and clears them together', () => {
    const timers = createRoomTimers(() => true);
    const fired: number[] = [];
    timers.add('a', 100, () => fired.push(1));
    timers.add('a', 200, () => fired.push(2));
    timers.add('a', 300, () => fired.push(3));

    vi.advanceTimersByTime(150);
    expect(timers.has('a')).toBe(true);
    timers.clear('a');
    vi.advanceTimersByTime(500);

    expect(fired).toEqual([1]);
    expect(timers.has('a')).toBe(false);
  });

  it('reports nothing pending from inside the last one to fire', () => {
    const timers = createRoomTimers(() => true);
    let pendingWhileDue: boolean | undefined;
    timers.set('a', 100, () => {
      pendingWhileDue = timers.has('a');
    });

    vi.advanceTimersByTime(100);
    expect(pendingWhileDue).toBe(false);
  });

  it('does nothing for a room that is gone by the time it fires', () => {
    let exists = true;
    const timers = createRoomTimers(() => exists);
    const fired = vi.fn<() => void>();
    timers.set('a', 100, fired);

    exists = false;
    vi.advanceTimersByTime(100);
    expect(fired).not.toHaveBeenCalled();
  });
});

describe('a room’s clock', () => {
  it('sets when the phase ends and ends it then', () => {
    vi.setSystemTime(1_000_000);
    const registry = makeRegistry();
    const room = makeRoom();
    registry.add(room);
    const ended = vi.fn<() => void>();

    registry.lookup.startPhase(room, 2, ended);
    expect(room.phaseEndsAt).toBe(1_002_000);

    vi.advanceTimersByTime(1999);
    expect(ended).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(ended).toHaveBeenCalledOnce();
  });

  it('stops, clearing the time it counted down to', () => {
    const registry = makeRegistry();
    const room = makeRoom();
    registry.add(room);
    const ended = vi.fn<() => void>();

    registry.lookup.startPhase(room, 2, ended);
    registry.lookup.stopPhase(room);
    vi.advanceTimersByTime(5000);

    expect(room.phaseEndsAt).toBe(0);
    expect(ended).not.toHaveBeenCalled();
  });

  it('ends with its room, along with every timer a game set for it', () => {
    const registry = makeRegistry();
    const room = makeRoom();
    const other = makeRoom('room-2');
    registry.add(room);
    registry.add(other);
    const hints = registry.lookup.timers();
    const fired: string[] = [];

    registry.lookup.startPhase(room, 1, () => fired.push('phase'));
    hints.add(room.roomId, 500, () => fired.push('hint'));
    hints.add(other.roomId, 500, () => fired.push('other room'));
    registry.remove(room);
    vi.advanceTimersByTime(5000);

    expect(fired).toEqual(['other room']);
  });
});
