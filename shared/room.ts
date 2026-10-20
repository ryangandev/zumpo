/**
 * What every room shares, whatever is played in it.
 */

/**
 * How many may watch a room at once. Watching costs the server a snapshot per
 * change, as playing does, so it is bounded like the seats are.
 */
export const MAX_SPECTATORS = 5;
