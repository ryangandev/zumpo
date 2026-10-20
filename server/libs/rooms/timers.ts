import { guard } from '../guard.js';

/**
 * Timers kept per room.
 *
 * Every game used to keep its own map of pending timeouts, with its own
 * clear, its own schedule, its own check that the room still existed when one
 * fired, and its own `disposeRoom` to empty it when a room went away. This is
 * that once. The registry makes every set of them and clears a room's from all
 * of them when the room is removed, so a timer cannot outlive its room because
 * a game forgot it.
 */
interface RoomTimers {
  /** Runs `onDue` after `ms`, replacing whatever this set has pending for the room. */
  set(roomId: string, ms: number, onDue: () => void): void;
  /** Runs `onDue` after `ms`, beside whatever this set has pending for the room. */
  add(roomId: string, ms: number, onDue: () => void): void;
  /** Drops whatever this set has pending for the room. */
  clear(roomId: string): void;
  /** Whether anything is still pending for the room. False inside `onDue`. */
  has(roomId: string): boolean;
}

/**
 * A set of room timers. `exists` is asked when one fires, and `onDue` runs only
 * if the room is still there.
 */
const createRoomTimers = (exists: (roomId: string) => boolean) => {
  const pending = new Map<string, Set<NodeJS.Timeout>>();

  const clear = (roomId: string): void => {
    for (const timer of pending.get(roomId) ?? []) clearTimeout(timer);
    pending.delete(roomId);
  };

  const add = (roomId: string, ms: number, onDue: () => void): void => {
    let timers = pending.get(roomId);
    if (!timers) {
      timers = new Set();
      pending.set(roomId, timers);
    }
    const owned = timers;
    const timer = setTimeout(() => {
      owned.delete(timer);
      if (owned.size === 0 && pending.get(roomId) === owned) {
        pending.delete(roomId);
      }
      if (exists(roomId)) guard(`A timer in room ${roomId}`, onDue);
    }, ms);
    owned.add(timer);
  };

  const set = (roomId: string, ms: number, onDue: () => void): void => {
    clear(roomId);
    add(roomId, ms, onDue);
  };

  const has = (roomId: string): boolean => (pending.get(roomId)?.size ?? 0) > 0;

  /** Drops everything pending, for a server that is closing. */
  const clearAll = (): void => {
    for (const roomId of pending.keys()) clear(roomId);
  };

  return { set, add, clear, has, clearAll };
};

type RoomTimerSet = ReturnType<typeof createRoomTimers>;

export { createRoomTimers };
export type { RoomTimers, RoomTimerSet };
