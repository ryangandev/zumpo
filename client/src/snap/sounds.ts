import type { SnapRoomState } from '../../../shared/wire-types';
import type {
  DeriveSounds,
  IsNewGame,
  SoundBank,
  SoundEvent,
  SteppedId,
} from '../audio';
import { snapSounds } from '../audio/generated/snap';
import { uiSounds } from '../audio/generated/ui';
import { gameSounds, ROOM_SOUNDS } from '../room/sounds';
import { SOLO_BANK } from '../solo/sounds';
import { summary, type SoloRun } from './solo/run';

/*
 * What Snap sounds like. The middle card taken, and the next one dealt in
 * quietly, on your own or in a room; a wrong tap's buzz, from the state it
 * makes (the run's on your own, the server's in a room, which says whose it
 * was). In a room, beyond what every room does (`room/sounds.ts`): somebody
 * else taking the middle card, softer, and your lockout ending. Other
 * players' wrong claims are never sent, so they are silent. A tap makes no
 * sound of its own: in a race the answer is the take, and it follows within
 * a round trip. Nothing ticks: the time on a card is information, not a
 * deadline.
 */

/** The room's bank and Snap's own. */
export const SNAP_BANK = {
  ...ROOM_SOUNDS,
  ...snapSounds,
  'ui-nope': uiSounds['ui-nope'],
  'ui-lockout-end': uiSounds['ui-lockout-end'],
} satisfies SoundBank;

/** On your own: the solo stingers, Snap's own and a wrong tap's buzz. */
export const SNAP_SOLO_BANK = {
  ...SOLO_BANK,
  ...snapSounds,
  'ui-nope': uiSounds['ui-nope'],
} satisfies SoundBank;

type Id = keyof typeof SNAP_BANK & string;
type Stepped = SteppedId<typeof SNAP_BANK>;
type SoloId = keyof typeof SNAP_SOLO_BANK & string;

/**
 * A move of a run on your own: the middle card taken, a wrong tap, the next
 * card dealt once the take has been shown. The cards taken and the wrong
 * taps so far only grow, whatever the open card has been reset to, so each
 * one's number names it. The thirtieth take is heard as a take, and the
 * run's end follows when it is shown, not with it.
 */
export const deriveSnapSolo: DeriveSounds<SoloRun, SoloId> = (prev, next) => {
  const events: SoundEvent<SoloId>[] = [];
  const before = summary(prev);
  const after = summary(next);
  if (after.taken > before.taken) {
    events.push({ sound: 'snap-take', key: `take:${after.taken}` });
  }
  if (after.wrongTaps > before.wrongTaps) {
    events.push({ sound: 'ui-nope', key: `wrong:${after.wrongTaps}` });
  }
  // The card turned after a take: the clock starts again on it.
  if (prev.cardStartedAt === null && next.cardStartedAt !== null) {
    events.push({ sound: 'snap-deal', key: `deal:${after.taken}` });
  }
  return events;
};

/**
 * Across a reconnection, with a game under way on both sides: another game,
 * with another number of cards, a middle card that is earlier in the deck
 * or other cards where it is the same (within a game a middle card is the
 * same until the next is turned), or somebody with fewer points, which
 * within a game only ever grow.
 */
export const isNewSnapGame: IsNewGame<SnapRoomState> = (prev, next) =>
  next.cards !== prev.cards ||
  next.taken < prev.taken ||
  (next.middle?.number ?? 0) < (prev.middle?.number ?? 0) ||
  (next.middle?.number === prev.middle?.number &&
    next.middle?.symbols.join() !== prev.middle?.symbols.join()) ||
  Object.entries(next.playerList).some(
    ([id, player]) => player.points < (prev.playerList[id]?.points ?? 0),
  );

/**
 * What a Snap snapshot adds for `viewer`: the middle card taken (the
 * viewer's full, anybody else's softer), the next one turned, and the
 * viewer's own wrong tap and the end of its lockout. How many cards are
 * taken names a take and the middle card's number a deal; a lockout has no
 * count of its own, so its key adds how long the middle card has been in
 * play, which only grows while it is open and so tells one lockout from the
 * next on the same card.
 */
export function deriveSnapSounds(
  viewer: string,
): DeriveSounds<SnapRoomState, Id, Stepped> {
  return (prev, next) => {
    const events: SoundEvent<Id, Stepped>[] = [];
    if (!next.isGameStarted) return events;
    const sameGame = prev.isGameStarted;

    const take = next.lastTake;
    if (take && next.taken > (sameGame ? prev.taken : 0)) {
      events.push({
        sound: 'snap-take',
        key: `take:${next.taken}`,
        other: take.playerId !== viewer,
      });
    }
    if (!sameGame) return events;

    if (prev.middle && next.middle && next.middle.number > prev.middle.number) {
      events.push({ sound: 'snap-deal', key: `deal:${next.middle.number}` });
    }
    const lockout = `${next.middle?.number}:${next.cardMs}`;
    if (prev.lockedOutMs === 0 && next.lockedOutMs > 0) {
      events.push({ sound: 'ui-nope', key: `miss:${lockout}` });
    } else if (prev.lockedOutMs > 0 && next.lockedOutMs === 0) {
      events.push({ sound: 'ui-lockout-end', key: `free:${lockout}` });
    }
    return events;
  };
}

/** What `RoomLayout` hears a Snap room by, beside the room's own. */
export const SNAP_SOUNDS = gameSounds({
  bank: SNAP_BANK,
  derive: deriveSnapSounds,
  isNewGame: isNewSnapGame,
});
