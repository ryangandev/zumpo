import { USERNAME_MAX } from '../validation.js';
import { memberOf } from './seats.js';
import type { Room } from './types.js';

/** Two names a room cannot tell apart: "sam" beside "Sam" is no help. */
const sameName = (a: string, b: string): boolean =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/**
 * The name a player goes by in this room: the one they asked for or, when
 * somebody else here, playing or watching, already goes by it, that name with the first free number
 * after it ("Sam 2"), shortened to stay within the limit. Two tabs of one
 * person, or two friends who both picked the same name, can then still be
 * told apart in the scoreboard and the chat.
 */
const nameInRoom = (room: Room, playerId: string, wanted: string): string => {
  const others = [
    ...Object.entries(room.playerList),
    ...Object.entries(room.spectators),
  ]
    .filter(([id]) => id !== playerId)
    .map(([, seat]) => seat.username);
  const free = (name: string) => !others.some((other) => sameName(other, name));
  if (free(wanted)) return wanted;

  for (let n = 2; ; n += 1) {
    const suffix = ` ${n}`;
    // Whole characters only, so a name in any script is never cut mid-letter.
    let base = wanted;
    while (base.length + suffix.length > USERNAME_MAX) {
      base = Array.from(base).slice(0, -1).join('');
    }
    const candidate = `${base.trimEnd()}${suffix}`;
    if (free(candidate)) return candidate;
  }
};

/**
 * Puts a player's new name on everything a room keeps about them: their seat
 * or spectator seat,
 * the owner, and every record a game wrote naming them, such as the standings
 * or the last round's results. Games name a player in their records as a
 * `{ playerId, username }` pair, so this needs no help from them. The chat is
 * left as it is, because what was said was said under the old name.
 */
const renamePlayer = (room: Room, playerId: string, username: string): void => {
  const member = memberOf(room, playerId);
  if (member) member.username = username;

  const seen = new Set<object>();
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (value instanceof Map || value instanceof Set) {
      for (const item of value.values()) visit(item);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    // Plain data only: a game's state holds no class instances, and anything
    // that is one is not a record of a player.
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) return;
    const record = value as Record<string, unknown>;
    if (record.playerId === playerId && typeof record.username === 'string') {
      record.username = username;
    }
    for (const item of Object.values(record)) visit(item);
  };
  visit(room.owner);
  visit(room.game);
};

export { nameInRoom, renamePlayer, sameName };
