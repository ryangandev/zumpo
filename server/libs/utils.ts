import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type {
  PlayerInfo,
  Standing,
  RoomNotice,
} from '../../shared/wire-types.js';

/**
 * Helpers that belong to no particular game.
 *
 * The word-bank and hint helpers that used to sit here moved to
 * `socket/draw-and-guess/words.ts`, and the two `getDrawAndGuess…` builders
 * became that module's `toLobbyInfo` and `toRoomState` - the wire snapshot is
 * a thing a game defines, not a thing a utility file happens to know how to
 * build.
 */

const generateRoomId = (): string => {
  return randomUUID();
};

/**
 * A locked room's invite key: 96 random bits, 16 URL-safe characters, short
 * enough to go where a password goes and too long to guess.
 */
const generateInviteKey = (): string => randomBytes(12).toString('base64url');

/**
 * Whether `given` is `secret`, in a time that does not say how much of it
 * matched. An empty secret is matched by nothing.
 */
const matchesSecret = (given: string, secret: string): boolean => {
  if (secret === '') return false;
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(secret, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
};

const getRandomInt = (min: number, max: number) => {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min) + min); // The maximum is exclusive and the minimum is inclusive
};

/**
 * Time left in a room's current phase. Sent to clients as a duration rather
 * than an absolute timestamp so that a client with a skewed clock still counts
 * down correctly - it anchors this against its own `Date.now()`.
 *
 * Takes the field rather than the room so that neither this file nor its test
 * has to know what a room is.
 */
const getRemainingPhaseMs = (room: { phaseEndsAt: number }): number => {
  return Math.max(0, room.phaseEndsAt - Date.now());
};

const getRandomElementFromSet = (set: Set<string>): string | undefined => {
  if (set.size === 0) return undefined;

  const randomIndex = getRandomInt(0, set.size);
  return [...set][randomIndex];
};

const resetPoints = (
  playerList: Record<string, PlayerInfo>,
): Record<string, PlayerInfo> => {
  return Object.fromEntries(
    Object.entries(playerList).map(([playerId, playerInfo]) => {
      return [playerId, { ...playerInfo, points: 0 }];
    }),
  );
};

/**
 * Every seated player, most points first, ties in seat order. `pointsOf`
 * reads a player's points when they are not the game's running score, as a
 * round's are.
 */
const standingsOf = (
  playerList: Readonly<Record<string, PlayerInfo>>,
  pointsOf: (playerId: string, player: PlayerInfo) => number = (_, player) =>
    player.points,
): Standing[] =>
  Object.entries(playerList)
    .map(([playerId, player]) => ({
      playerId,
      username: player.username,
      points: pointsOf(playerId, player),
    }))
    .toSorted((a, b) => b.points - a.points);

/** The public standings' result, with wording left to each viewer. */
const gameOverNotice = (
  standings: readonly Standing[],
  unit: Extract<RoomNotice, { type: 'game:over' }>['unit'] = 'point',
): RoomNotice => {
  const top = standings[0];
  if (!top) return { type: 'game:ended' };
  return {
    type: 'game:over',
    names: standings
      .filter((standing) => standing.points === top.points)
      .map((standing) => standing.username),
    points: top.points,
    unit,
  };
};

export {
  gameOverNotice,
  standingsOf,
  generateRoomId,
  generateInviteKey,
  matchesSecret,
  getRandomInt,
  getRemainingPhaseMs,
  getRandomElementFromSet,
  resetPoints,
};
