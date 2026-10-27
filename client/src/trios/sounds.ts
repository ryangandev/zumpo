import type { TriosRoomState } from '../../../shared/wire-types';
import type {
  DeriveSounds,
  IsNewGame,
  SoundBank,
  SoundEvent,
  SteppedId,
} from '../audio';
import { triosSounds } from '../audio/generated/trios';
import { uiSounds } from '../audio/generated/ui';
import { gameSounds, ROOM_SOUNDS } from '../room/sounds';
import { SOLO_BANK } from '../solo/sounds';
import { summary, type SoloRun } from './solo/run';

/*
 * What Trios sounds like. Picking a card and putting it back, on your own or
 * in a room, the table plays what the player does. A trio found, three that
 * were not one and a hint are heard from the state they make: the run's on
 * your own, the server's in a room, which says whose trio it was. In a room,
 * beyond what every room does (`room/sounds.ts`): somebody else taking a
 * trio, softer, your own wrong claim and its lockout ending, and the hint
 * that comes after 30 seconds without a trio. Other players' wrong claims
 * are never sent, so they are silent. Nothing ticks: a hint is help, not a
 * deadline.
 */

/** What the table plays as the player picks, on your own or in a room. */
export const TRIOS_TABLE_BANK = {
  'trios-pick': triosSounds['trios-pick'],
  'trios-unpick': triosSounds['trios-unpick'],
} satisfies SoundBank;

/** The room's bank and Trios' own. */
export const TRIOS_BANK = {
  ...ROOM_SOUNDS,
  ...triosSounds,
  'ui-nope': uiSounds['ui-nope'],
  'ui-lockout-end': uiSounds['ui-lockout-end'],
} satisfies SoundBank;

/** On your own: the solo stingers, Trios' own and a wrong pick's buzz. */
export const TRIOS_SOLO_BANK = {
  ...SOLO_BANK,
  ...triosSounds,
  'ui-nope': uiSounds['ui-nope'],
} satisfies SoundBank;

type Id = keyof typeof TRIOS_BANK & string;
type Stepped = SteppedId<typeof TRIOS_BANK>;
type SoloId = keyof typeof TRIOS_SOLO_BANK & string;

/**
 * A move of a run on your own: a trio found, three that were not one, a
 * hint taken. The run's totals only grow, whatever the open trio has been
 * reset to, so each one's number names it. The tenth trio is heard as found,
 * and the run's end follows when it is shown, not with it.
 */
export const deriveTriosSolo: DeriveSounds<SoloRun, SoloId> = (prev, next) => {
  const events: SoundEvent<SoloId>[] = [];
  const before = summary(prev);
  const after = summary(next);
  if (after.found > before.found) {
    events.push({ sound: 'trios-found', key: `found:${after.found}` });
  }
  if (after.wrongPicks > before.wrongPicks) {
    events.push({ sound: 'ui-nope', key: `wrong:${after.wrongPicks}` });
  }
  if (after.hints > before.hints) {
    events.push({ sound: 'trios-hint', key: `hint:${after.hints}` });
  }
  return events;
};

/** Whether two trios taken are the same one, by who took which cards. */
const sameTrio = (
  a: TriosRoomState['lastTrio'],
  b: TriosRoomState['lastTrio'],
) => a?.playerId === b?.playerId && a?.cards.join() === b?.cards.join();

/**
 * Across a reconnection, with a game under way on both sides: another game,
 * with another number of trios, fewer found than before, a different latest
 * trio where the count is the same (within a game it changes only as the
 * count grows), or somebody with fewer points, which within a game only
 * ever grow.
 */
export const isNewTriosGame: IsNewGame<TriosRoomState> = (prev, next) =>
  next.trios !== prev.trios ||
  next.found < prev.found ||
  (next.found === prev.found && !sameTrio(prev.lastTrio, next.lastTrio)) ||
  Object.entries(next.playerList).some(
    ([id, player]) => player.points < (prev.playerList[id]?.points ?? 0),
  );

/**
 * What a Trios snapshot adds for `viewer`: a trio taken (the viewer's full,
 * anybody else's softer), a hint, and the viewer's own wrong claim and the
 * end of its lockout. How many trios are found names a taken trio and a
 * hint; a lockout has no count of its own, so its key adds how long the
 * table has gone without a trio, which only grows while it is open and so
 * tells one lockout from the next on the same cards.
 */
export function deriveTriosSounds(
  viewer: string,
): DeriveSounds<TriosRoomState, Id, Stepped> {
  return (prev, next) => {
    const events: SoundEvent<Id, Stepped>[] = [];
    if (!next.isGameStarted) return events;
    const sameGame = prev.isGameStarted;

    const trio = next.lastTrio;
    if (trio && next.found > (sameGame ? prev.found : 0)) {
      events.push({
        sound: 'trios-found',
        key: `taken:${next.found}`,
        other: trio.playerId !== viewer,
      });
    }
    if (!sameGame) return events;

    if (next.found === prev.found && next.hint.length > prev.hint.length) {
      events.push({
        sound: 'trios-hint',
        key: `hint:${next.found}:${next.hint.length}`,
      });
    }
    const lockout = `${next.found}:${next.searchingMs}`;
    if (prev.lockedOutMs === 0 && next.lockedOutMs > 0) {
      events.push({ sound: 'ui-nope', key: `miss:${lockout}` });
    } else if (prev.lockedOutMs > 0 && next.lockedOutMs === 0) {
      events.push({ sound: 'ui-lockout-end', key: `free:${lockout}` });
    }
    return events;
  };
}

/** What `RoomLayout` hears a Trios room by, beside the room's own. */
export const TRIOS_SOUNDS = gameSounds({
  bank: TRIOS_BANK,
  derive: deriveTriosSounds,
  isNewGame: isNewTriosGame,
});
