import type { AnyRoomState, PlayerInfo } from '../../../shared/wire-types';
import type { Messages } from '../i18n';
import type { Standing } from '../ui';

/** What a race shows on a phone's standings strip in place of points. */
export type RaceStanding = Pick<Standing, 'value' | 'mark'>;

export interface Seat extends PlayerInfo {
  playerId: string;
}

/**
 * The room's players, highest score first; ties keep the order they sat down
 * in, which is the order the server lists them.
 */
export function rankedPlayers(state: AnyRoomState): Seat[] {
  return Object.entries(state.playerList)
    .map(([playerId, player]) => ({ playerId, ...player }))
    .toSorted((a, b) => b.points - a.points);
}

/**
 * Each standing's place, best first: a shared score shares a place, and the
 * next one skips past it (1, 1, 3).
 */
export function placesOf(standings: readonly { points: number }[]): number[] {
  return standings.map(
    ({ points }) => standings.findIndex((s) => s.points === points) + 1,
  );
}

/**
 * A room's name: the one its creator typed, or for a room that kept the
 * suggested one, its host's, so it follows the crown ("Ben's room").
 */
export function roomNameOf(
  room: { roomName: string; owner: { username: string } },
  m: Messages,
): string {
  return room.roomName || m.createRoom.defaultName(room.owner.username);
}

/**
 * A race's standing on a phone's strip, where nobody scores until somebody
 * solves it: the guesses used of the most, checked once solved and crossed
 * once every guess is used.
 */
export function raceStanding(
  board: { rows: readonly unknown[]; status: string } | undefined,
  most: number,
  m: Messages,
): RaceStanding {
  const used = board?.rows.length ?? 0;
  const value = m.ui.standings.guesses(used, most);
  if (board?.status === 'found' || board?.status === 'cracked') {
    return { value, mark: 'solved' };
  }
  if (board?.status === 'out') return { value, mark: 'missed' };
  return { value };
}

/** "Ryan", "Ryan and Maya", "Ryan, Maya and Sam". */
export function listNames(names: readonly string[], m: Messages): string {
  return m.room.listNames(names);
}

/** "1st", "2nd", "3rd", "4th"… */
export function ordinal(place: number, m: Messages): string {
  return m.room.ordinal(place);
}
