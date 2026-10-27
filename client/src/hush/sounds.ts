import { useEffect, useRef } from 'react';
import type { HushRoomState } from '../../../shared/wire-types';
import {
  useSounds,
  type DeriveSounds,
  type IsNewGame,
  type SoundBank,
  type SoundEvent,
  type SteppedId,
} from '../audio';
import { hushSounds } from '../audio/generated/hush';
import { secondsLeft } from '../net/use-seconds-left';
import { gameSounds, ROOM_SOUNDS } from '../room/sounds';

/*
 * What Hush sounds like. A silent-cooperation game: its only voice is the
 * cards, so the table hears each card laid on the pile (yours full,
 * everybody else's softer), a mistake, a cleared level and a life won back,
 * and the Ready of the level before it. There is no clock and no rhythm to
 * read while a level is played, so nothing ticks and nothing keeps a beat:
 * the one count there is, 3, 2, 1, is the shared moment before a level opens
 * (`useCountdownSounds`), where the room's own clock shows the same digits.
 * That count is also the one before a level resumes, in the middle of it,
 * after a pause for a player away or a seat lost: a countdown like the first,
 * and it sounds like it. It stops before play, with no "go".
 * Nobody's pause, drop or card thrown away with a seat is heard.
 */

/** The room's bank and Hush's own. */
export const HUSH_BANK = {
  ...ROOM_SOUNDS,
  ...hushSounds,
} satisfies SoundBank;

type Id = keyof typeof HUSH_BANK & string;
type Stepped = SteppedId<typeof HUSH_BANK>;

/**
 * How long after a card is laid what it did is heard: a mistake's thud or a
 * cleared level's chord, so the card is heard as a card first.
 */
export const LANDS_AFTER_MS = 150;

/** How long after a cleared level's chord the life it won back sparkles. */
export const LIFE_BACK_AFTER_MS = 650;

/**
 * Across a reconnection, with a game under way on both sides: another game,
 * whose levels started again or number otherwise, or where a pile in the
 * same level is not the pile that was, since within a level cards are only
 * added to it.
 */
export const isNewHushGame: IsNewGame<HushRoomState> = (prev, next) =>
  next.level < prev.level ||
  next.levels !== prev.levels ||
  (next.level === prev.level &&
    prev.pile.some((play, index) => next.pile[index]?.card !== play.card));

/**
 * What a Hush snapshot adds for `viewer`: each card laid on the pile, a
 * mistake, a cleared level and a clean one's life back, and the level's
 * Ready (but not the last, which the count that follows stands in for).
 * Every key names its level, since cards and Ready come round again in the
 * next. The card a mistake was made with and the level it clears are heard
 * as a card first, and what they did a beat after.
 */
export function deriveHushSounds(
  viewer: string,
): DeriveSounds<HushRoomState, Id, Stepped> {
  return (prev, next) => {
    const events: SoundEvent<Id, Stepped>[] = [];
    if (!next.isGameStarted) return events;
    const level = next.level;
    const sameLevel = prev.isGameStarted && prev.level === level;

    // The Ready that completes the table is followed at once by the count,
    // in a snapshot of its own sent back to back: the 3 is its sound, and a
    // stamp or pip would only sound over it. With somebody away the level
    // waits instead, and the Ready is heard.
    const countFollows = Object.keys(next.table).every(
      (id) =>
        next.table[id]?.ready && next.playerList[id]?.isConnected !== false,
    );

    for (const [id, seat] of Object.entries(next.table)) {
      if (countFollows) break;
      if (!seat.ready || (sameLevel && prev.table[id]?.ready)) continue;
      events.push(
        id === viewer
          ? { sound: 'room-stamp', key: `ready:${level}:${id}` }
          : { sound: 'room-pip', key: `ready:${level}:${id}`, other: true },
      );
    }

    const played = next.pile.slice(sameLevel ? prev.pile.length : 0);
    for (const { card, playerId } of played) {
      events.push({
        sound: 'hush-card',
        key: `card:${level}:${card}`,
        other: playerId !== viewer,
      });
    }
    // A card laid is heard first; what it did, a beat after.
    const after = played.length > 0 ? LANDS_AFTER_MS : 0;

    const mistake = next.lastMistake;
    if (mistake && !(sameLevel && prev.lastMistake?.card === mistake.card)) {
      events.push({
        sound: 'hush-mistake',
        key: `mistake:${level}:${mistake.card}`,
        ...(after > 0 ? { delayMs: after } : {}),
      });
    }

    const cleared = next.lastLevel;
    if (cleared && !(sameLevel && prev.lastLevel !== null)) {
      events.push({
        sound: 'hush-level-cleared',
        key: `cleared:${level}`,
        ...(after > 0 ? { delayMs: after } : {}),
      });
      if (cleared.lifeBack) {
        events.push({
          sound: 'hush-life-back',
          key: `life:${level}`,
          delayMs: after + LIFE_BACK_AFTER_MS,
        });
      }
    }
    return events;
  };
}

/** What `RoomLayout` hears a Hush room by, beside the room's own. */
export const HUSH_SOUNDS = gameSounds({
  bank: HUSH_BANK,
  derive: deriveHushSounds,
  isNewGame: isNewHushGame,
});

/** The counts before play opens: 3, 2, 1, the last one higher. */
const COUNTS = 3;

/** How often the count looks at the clock; the digits move on whole seconds. */
const LOOK_EVERY_MS = 250;

/** What the count hook last saw of a countdown. */
interface Run {
  /** Opened while this page watched, not arrived at or come back to. */
  live: boolean;
  /** The last count seen, or null before the first. */
  last: number | null;
  /** The counts already played. */
  heard: Set<number>;
}

/**
 * The 3, 2, 1 before play opens, in step with the digits the room's clock
 * shows beside it. It is the one count in the game, and it is before play,
 * never in it: before a level's first card, and before the cards that
 * resume it after a pause for somebody away or a seat lost. It stops before
 * play, with no "go".
 *
 * The seconds are read off the countdown's own snapshot (`endsInMs` as of
 * `receivedAt`), never from a clock state shared with the phase before, which
 * still holds that phase's last reading for a render after the phase changes.
 * A countdown that opens while the page watches counts from 3; arriving or
 * coming back during one only sets where it stands, so a refresh, or a
 * connection back from a drop, never counts again what was counted, and the
 * counts that follow play. A count already played never plays twice in one
 * countdown, though a snapshot moves the clock back, and a countdown after a
 * pause, which counts afresh, plays all three.
 *
 * `counting` is whether the room is in its countdown; `paused` holds the
 * clock (the connection is down). Only 3, 2 and 1 count.
 */
export function useCountdownSounds({
  endsInMs,
  receivedAt,
  counting,
  paused,
}: {
  endsInMs: number;
  receivedAt: number;
  counting: boolean;
  paused: boolean;
}): void {
  const play = useSounds(HUSH_BANK);
  const run = useRef<Run | null>(null);
  // Whether the last render was an ordinary phase, connected: what makes
  // the countdown after it one this page watched open.
  const quiet = useRef(false);
  useEffect(() => {
    if (!counting || paused) {
      run.current = null;
      quiet.current = !counting && !paused;
      return;
    }
    run.current ??= { live: quiet.current, last: null, heard: new Set() };
    quiet.current = false;
    const count = run.current;
    const look = () => {
      const seconds = secondsLeft(endsInMs, receivedAt);
      if (seconds < 1 || seconds > COUNTS) return;
      const before = count.last;
      count.last = seconds;
      // The first count seen, if the page was not watching it open, only
      // sets where it stands.
      if (before === null ? !count.live : seconds >= before) return;
      if (count.heard.has(seconds)) return;
      count.heard.add(seconds);
      play('hush-count', { variant: COUNTS + 1 - seconds });
    };
    look();
    const timer = setInterval(look, LOOK_EVERY_MS);
    return () => clearInterval(timer);
  }, [counting, paused, endsInMs, receivedAt, play]);
}
