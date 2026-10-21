import type { AnyRoomState, PlayerInfo } from '../../../shared/wire-types';
import type { Messages } from '../i18n';

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
 * A race board's place in the phone's standings strip, Daily Word's or Code
 * Breaker's: guesses used so far, solved in so many, or out of guesses.
 */
export function raceStanding(
  board: { rows: readonly unknown[]; status: string } | undefined,
  most: number,
  m: Messages,
): string {
  const used = board?.rows.length ?? 0;
  if (board?.status === 'found' || board?.status === 'cracked') {
    return m.ui.standings.solved(used, most);
  }
  if (board?.status === 'out') return m.ui.standings.missed(most);
  return m.ui.standings.guesses(used, most);
}

/** "Ryan", "Ryan and Maya", "Ryan, Maya and Sam". */
export function listNames(names: readonly string[], m: Messages): string {
  return m.room.listNames(names);
}

/** "1st", "2nd", "3rd", "4th"… */
export function ordinal(place: number, m: Messages): string {
  return m.room.ordinal(place);
}
