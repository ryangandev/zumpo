/**
 * What every room shares, whatever is played in it.
 */

import { SEATS } from './seats.js';
import type { DoodleChainPhase, GameType } from './wire-types.js';

/**
 * What a player leaving a game under way does to it: it plays on without
 * them, it is cut short (game:interrupted, no result), or it is decided, and
 * `winner` wins it.
 */
export type Departure =
  | { kind: 'plays-on' }
  | { kind: 'cut-short' }
  | { kind: 'decided'; winner: string };

/**
 * The table a departure leaves behind: the seats still taken, with their
 * points, and what the game needs besides to judge it.
 */
export type TableLeft =
  | {
      gameType: Exclude<GameType, 'doodle-chain'>;
      /** Points are dice left in Liar's Dice. */
      seats: Readonly<Record<string, { points: number }>>;
    }
  | {
      gameType: 'doodle-chain';
      seats: Readonly<Record<string, { points: number }>>;
      phase: DoodleChainPhase;
      step: number;
      steps: number;
    };

/** Below this many players a Doodle Chain stops playing steps. */
const DOODLE_CHAIN_PLAYS_ON = 2;

/**
 * What a departure mid-game does, as the game's rules have it. The engines
 * act on it and a leaving player's dialog says it, so the two agree.
 *
 * - Gomoku: the one left wins, as if the leaver had resigned.
 * - Liar's Dice: below two seats the game is cut short; with one player left
 *   holding dice, it is theirs.
 * - Doodle Chain: plays on down to two players, and a departure during the
 *   reveal, or the passing after the last step, ends nothing early.
 * - Every other game: cut short below its fewest players.
 */
export function departureFrom(table: TableLeft): Departure {
  const seated = Object.keys(table.seats);
  switch (table.gameType) {
    case 'gomoku': {
      const [winner] = seated;
      return winner === undefined
        ? { kind: 'cut-short' }
        : { kind: 'decided', winner };
    }
    case 'liars-dice': {
      if (seated.length < SEATS['liars-dice'].min) return { kind: 'cut-short' };
      const holding = seated.filter((id) => (table.seats[id]?.points ?? 0) > 0);
      if (holding.length > 1) return { kind: 'plays-on' };
      const [winner] = holding;
      return winner === undefined
        ? { kind: 'cut-short' }
        : { kind: 'decided', winner };
    }
    case 'doodle-chain': {
      if (table.phase === 'reveal') return { kind: 'plays-on' };
      if (seated.length >= DOODLE_CHAIN_PLAYS_ON) return { kind: 'plays-on' };
      const allPlayed = table.phase === 'passing' && table.step >= table.steps;
      return allPlayed ? { kind: 'plays-on' } : { kind: 'cut-short' };
    }
    default:
      return seated.length < SEATS[table.gameType].min
        ? { kind: 'cut-short' }
        : { kind: 'plays-on' };
  }
}

/**
 * How many may watch a room at once. Watching costs the server a snapshot per
 * change, as playing does, so it is bounded like the seats are.
 */
export const MAX_SPECTATORS = 5;

/** The first of `members` who is here, else the first away; none if empty. */
function firstHere(
  members: Readonly<Record<string, { isConnected: boolean }>>,
): string | undefined {
  const entries = Object.entries(members);
  return (entries.find(([, member]) => member.isConnected) ?? entries[0])?.[0];
}

/**
 * Who the crown passes to: somebody at the table before a spectator, and in
 * either somebody here before somebody away, who could not start a game.
 * `undefined` when nobody is left to take it. The server hands it on with
 * this, and a leaving host's dialog names the same player.
 */
export function heirOf(
  room: {
    playerList: Readonly<Record<string, { isConnected: boolean }>>;
    spectators: Readonly<Record<string, { isConnected: boolean }>>;
  },
  { playersOnly = false }: { playersOnly?: boolean } = {},
): string | undefined {
  return (
    firstHere(room.playerList) ??
    (playersOnly ? undefined : firstHere(room.spectators))
  );
}
