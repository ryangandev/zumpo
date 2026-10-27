import type { Make24RoomState } from '../../../shared/wire-types';
import type {
  DeriveSounds,
  IsNewGame,
  SoundBank,
  SoundEvent,
  SteppedId,
} from '../audio';
import { make24Sounds } from '../audio/generated/make-24';
import { uiSounds } from '../audio/generated/ui';
import { gameSounds, ROOM_SOUNDS } from '../room/sounds';
import { SOLO_BANK } from '../solo/sounds';
import type { SoloRun } from './solo/run';

/*
 * What Make 24 sounds like. Playing a hand, on your own or in a room, the
 * table plays what the player does: a card, a sign, two cards made one, a
 * last card that is not 24, an undo. A solved hand is heard from the state
 * it makes: the run's on your own, the server's in a room, which says
 * whether a solve counts. In a room, beyond what every room does
 * (`room/sounds.ts`): somebody else's solve, a step higher each, the hand's
 * reveal or your time up, and the hand's last seconds (`actingDeadline`).
 */

/** What the table plays as the player picks, on your own or in a room. */
export const MAKE_24_HAND_BANK = {
  'make-24-card': make24Sounds['make-24-card'],
  'make-24-sign': make24Sounds['make-24-sign'],
  'make-24-combine': make24Sounds['make-24-combine'],
  'ui-nope': uiSounds['ui-nope'],
  'ui-undo': uiSounds['ui-undo'],
} satisfies SoundBank;

/** The room's bank and Make 24's own. */
export const MAKE_24_BANK = {
  ...ROOM_SOUNDS,
  ...MAKE_24_HAND_BANK,
  ...make24Sounds,
} satisfies SoundBank;

/** On your own: the solo stingers and Make 24's own. */
export const MAKE_24_SOLO_BANK = {
  ...SOLO_BANK,
  ...MAKE_24_HAND_BANK,
  ...make24Sounds,
} satisfies SoundBank;

type Id = keyof typeof MAKE_24_BANK & string;
type Stepped = SteppedId<typeof MAKE_24_BANK>;
type SoloId = keyof typeof MAKE_24_SOLO_BANK & string;

/**
 * A hand of a run finished: solved, or skipped. The hands finished only
 * grow, so each one's place names it. The tenth is the run's end.
 */
export const deriveMake24Solo: DeriveSounds<SoloRun, SoloId> = (prev, next) => {
  if (next.results.length <= prev.results.length) return [];
  const index = next.results.length - 1;
  return [
    {
      sound: next.results[index]?.skipped ? 'make-24-skip' : 'make-24-solved',
      key: `hand:${index}`,
    },
  ];
};

/** The four cards of the hand a snapshot is about: open, or revealed. */
const dealOf = (state: Make24RoomState) =>
  (state.phase === 'reveal' ? state.lastDeal : state.deal).join(',');

/**
 * Across a reconnection, with a game under way on both sides: another game,
 * whose hands started again or number otherwise, whose same hand was dealt
 * other cards, or where somebody has fewer points, which within a game only
 * ever grow.
 */
export const isNewMake24Game: IsNewGame<Make24RoomState> = (prev, next) =>
  next.hand < prev.hand ||
  next.hands !== prev.hands ||
  (next.hand === prev.hand && dealOf(next) !== dealOf(prev)) ||
  Object.entries(next.playerList).some(
    ([id, player]) => player.points < (prev.playerList[id]?.points ?? 0),
  );

/** The hand `viewer` is still solving against the clock, named, or null. */
export function actingDeadline(
  state: Make24RoomState,
  viewer: string,
): string | null {
  return state.isGameStarted &&
    state.phase === 'solving' &&
    state.mySolve === null &&
    viewer in state.playerList
    ? `${state.hand}:solving`
    : null;
}

/**
 * What a Make 24 snapshot adds for `viewer`: only what moves a hand on, so
 * a snapshot from earlier in the hand adds nothing. The last solve and the
 * hand's end arrive in one snapshot, and are heard as one sound: the
 * solver's own if it was theirs, or the reveal, which is the time up for a
 * seated player who had not solved it.
 */
export function deriveMake24Sounds(
  viewer: string,
): DeriveSounds<Make24RoomState, Id, Stepped> {
  return (prev, next) => {
    const events: SoundEvent<Id, Stepped>[] = [];
    if (!next.isGameStarted) return events;
    const hand = next.hand;
    const sameHand = prev.isGameStarted && prev.hand === hand;
    if (sameHand && prev.phase === 'reveal') return events;

    const ends = next.phase === 'reveal';
    const solvedIt = ends
      ? next.lastHand.some((r) => r.playerId === viewer && r.solved)
      : next.mySolve !== null;
    const mine = solvedIt && !(sameHand && prev.mySolve !== null);
    if (mine) events.push({ sound: 'make-24-solved', key: `solved:${hand}` });

    if (ends) {
      if (!mine) {
        const solving = viewer in next.playerList && !solvedIt;
        events.push({
          sound: solving ? 'room-time-up' : 'room-reveal',
          key: `end:${hand}`,
        });
      }
      return events;
    }
    const before = sameHand ? prev.solved.map((s) => s.playerId) : [];
    next.solved.forEach(({ playerId }, index) => {
      if (playerId === viewer || before.includes(playerId)) return;
      // One step higher for each solver this hand.
      events.push({
        sound: 'room-someone-scored',
        key: `scored:${hand}:${playerId}`,
        other: true,
        variant: index + 1,
      });
    });
    return events;
  };
}

/** What `RoomLayout` hears a Make 24 room by, beside the room's own. */
export const MAKE_24_SOUNDS = gameSounds({
  bank: MAKE_24_BANK,
  derive: deriveMake24Sounds,
  isNewGame: isNewMake24Game,
});
