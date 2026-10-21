/**
 * What every room shares, whatever is played in it.
 */

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
