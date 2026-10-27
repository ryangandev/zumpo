import { useEffect, useMemo, useRef } from 'react';
import type { AnyRoomState, GameSummary } from '../../../shared/wire-types';
import {
  useSounds,
  useStateSounds,
  type DeriveSounds,
  type IsNewGame,
  type SoundBank,
  type SoundEvent,
  type SteppedId,
} from '../audio';
import { roomSounds } from '../audio/generated/room';
import { uiSounds } from '../audio/generated/ui';
import { URGENT_SECONDS } from '../ui';
import type { RoomStage } from '../net/use-room';
import { placesOf } from './players';

/*
 * What every room sounds like, whatever the game: who comes and goes, Ready,
 * the start, your go, the end, a lost connection, and the last seconds of a
 * deadline you must act in. Each game adds its own in `<game>/sounds.ts`, the
 * same way: a pure derive from one snapshot to the next, given to
 * `useStateSounds` in the game's room component, which lives as long as the
 * room does. How and why: docs/architecture.md#sound.
 */

/** The room bank, and the two shell sounds a room plays from the ui bank. */
export const ROOM_SOUNDS = {
  ...roomSounds,
  'stinger-win': uiSounds['stinger-win'],
  'ui-connection-lost': uiSounds['ui-connection-lost'],
} satisfies SoundBank;

export type RoomSoundId = keyof typeof ROOM_SOUNDS & string;
export type RoomStepped = SteppedId<typeof ROOM_SOUNDS>;

/** What the room layer hears a room by: the snapshot, and the page around it. */
export interface RoomSoundView {
  state: AnyRoomState;
  /** Names this player's go while it is theirs (`2.5`); null otherwise. */
  turn: string | null;
  /** The connection is down, and the page holds still. */
  lost: boolean;
  /** The connection the snapshot came on. */
  connection: number;
}

/** Everybody in the room, at the table or watching. */
const membersOf = (state: AnyRoomState) =>
  new Set([...Object.keys(state.playerList), ...Object.keys(state.spectators)]);

/**
 * A finished game, told apart from another by who made what: names aside,
 * since a rename rewrites them in the summary.
 */
export function summaryKey(summary: GameSummary | null): string {
  if (!summary) return '';
  const standings = summary.standings
    .map(({ playerId, points }) => `${playerId}=${points}`)
    .join(',');
  return `${summary.endedEarly ? 'early' : 'full'}:${standings}`;
}

/**
 * Who won the game that just ended: the top place, shared on a tie, as the
 * results say it. A Hush table wins or loses together, Gomoku's winner is a
 * colour or nobody, and Liar's Dice ranks in finishing order.
 */
export function winnersOf(state: AnyRoomState): string[] {
  switch (state.gameType) {
    case 'hush':
      return state.lastGame?.won
        ? state.lastGame.standings.map((s) => s.playerId)
        : [];
    case 'gomoku': {
      const color = state.lastGame?.winner;
      const winner = color ? state.colors?.[color].playerId : undefined;
      return winner ? [winner] : [];
    }
    case 'liars-dice':
      return (state.lastGame?.standings ?? [])
        .slice(0, 1)
        .map((s) => s.playerId);
    default: {
      const standings = state.lastGame?.standings ?? [];
      const places = placesOf(standings);
      return standings
        .filter((_, index) => places[index] === 1)
        .map((s) => s.playerId);
    }
  }
}

/**
 * Games whose end is their own to sound: a Doodle Chain game ends on its
 * album, which nobody wins.
 */
const OWN_ENDING: ReadonlySet<AnyRoomState['gameType']> = new Set([
  'doodle-chain',
]);

/**
 * Whether `next` is in a later game than `prev`, from what any room shows: a
 * game starting, or between games a different last game. A room cannot tell
 * two games apart while both are on; a game's own `isNewGame` adds what it
 * can (`isNewDrawAndGuessGame`).
 */
export function newGameBegan(prev: AnyRoomState, next: AnyRoomState): boolean {
  if (next.isGameStarted) return !prev.isGameStarted;
  return (
    !prev.isGameStarted &&
    next.lastGame !== null &&
    summaryKey(prev.lastGame) !== summaryKey(next.lastGame)
  );
}

export const isNewRoomGame: IsNewGame<RoomSoundView> = (prev, next) =>
  newGameBegan(prev.state, next.state);

/**
 * What the room layer hears between two views, for `viewer`. Somebody else's
 * doing plays softer; a spectator has no go and no Ready, so hears the others
 * and the game's start and end. Keys hold within a game (`isNewRoomGame`
 * forgets them): somebody who leaves and comes back in one game is heard the
 * first time only.
 */
export function deriveRoomSounds(
  viewer: string,
): DeriveSounds<RoomSoundView, RoomSoundId, RoomStepped> {
  return (prev, next) => {
    const events: SoundEvent<RoomSoundId, RoomStepped>[] = [];
    const before = prev.state;
    const after = next.state;

    // One loss per connection: the next one comes on a new connection.
    if (!prev.lost && next.lost) {
      events.push({
        sound: 'ui-connection-lost',
        key: `lost:${next.connection}`,
      });
    }

    // A dropped connection is not a departure: only a seat given up is.
    // Moving between the table and the spectator seats is neither.
    const was = membersOf(before);
    const now = membersOf(after);
    for (const id of now) {
      if (id !== viewer && !was.has(id)) {
        events.push({ sound: 'room-join', key: `join:${id}`, other: true });
      }
    }
    for (const id of was) {
      if (id !== viewer && !now.has(id)) {
        events.push({ sound: 'room-leave', key: `leave:${id}`, other: true });
      }
    }

    if (!after.isGameStarted) {
      for (const id of after.ready) {
        if (before.ready.includes(id)) continue;
        events.push(
          id === viewer
            ? { sound: 'room-stamp', key: `ready:${id}` }
            : { sound: 'room-pip', key: `ready:${id}`, other: true },
        );
      }
    }

    // The player whose go opens the game hears their go, not the start over
    // it: it is what they must act on, and the one sound a hidden tab plays.
    const yourTurn = next.turn !== null && next.turn !== prev.turn;
    if (yourTurn) {
      events.push({ sound: 'room-your-turn', key: `turn:${next.turn}` });
    }
    if (!before.isGameStarted && after.isGameStarted && !yourTurn) {
      events.push({ sound: 'stinger-game-start', key: 'start' });
    }

    // A game cut short has no result to sound: the departure that cut it is
    // heard as a leave.
    const summary = after.lastGame;
    if (
      before.isGameStarted &&
      !after.isGameStarted &&
      summary &&
      !summary.endedEarly &&
      !OWN_ENDING.has(after.gameType)
    ) {
      events.push({
        sound: winnersOf(after).includes(viewer)
          ? 'stinger-win'
          : 'stinger-nice-game',
        key: `end:${summaryKey(summary)}`,
      });
    }
    return events;
  };
}

/**
 * Plays the room layer's sounds for the room the viewer is in. It belongs in
 * `RoomLayout`, which every game's room renders for as long as it is open.
 * `epoch` is the connection the snapshot came on, so the first snapshot of a
 * new connection is only a baseline.
 */
export function useRoomSounds({
  state,
  viewer,
  turn,
  lost,
  epoch,
}: {
  state: AnyRoomState;
  viewer: string;
  turn: string | null;
  lost: boolean;
  epoch: number;
}): void {
  const play = useSounds(ROOM_SOUNDS);
  const view = useMemo<RoomSoundView>(
    () => ({ state, turn, lost, connection: epoch }),
    [state, turn, lost, epoch],
  );
  const derive = useMemo(() => deriveRoomSounds(viewer), [viewer]);
  useStateSounds(view, { derive, play, epoch, isNewGame: isNewRoomGame });
}

/**
 * The last seconds of a deadline this player must act in, one tick a second
 * from `URGENT_SECONDS` to 1, rising, as the clock turns urgent. A clock is
 * not a snapshot, so this follows the seconds the page shows rather than the
 * replay guard; call it beside the clock with the same `seconds`, so the tick
 * lands with the digit.
 *
 * `deadline` names the deadline (`2.5:drawing`), or is null while the viewer
 * has none to act in: someone else's go, an Info clock, a spectator, a
 * paused clock. The first seconds seen for a deadline only set where it
 * stands, so arriving or coming back at 3 seconds left ticks 2 and 1, and a
 * second already ticked never ticks again, though a snapshot moves the
 * clock back.
 */
export function useDeadlineTicks(
  seconds: number,
  deadline: string | null,
): void {
  const play = useSounds(ROOM_SOUNDS);
  const last = useRef<{ deadline: string | null; seconds: number } | null>(
    null,
  );
  const heard = useRef<{ deadline: string; seconds: Set<number> } | null>(null);
  useEffect(() => {
    const before = last.current;
    last.current = { deadline, seconds };
    if (deadline === null || before?.deadline !== deadline) return;
    if (seconds >= before.seconds || seconds < 1 || seconds > URGENT_SECONDS) {
      return;
    }
    if (heard.current?.deadline !== deadline) {
      heard.current = { deadline, seconds: new Set() };
    }
    if (heard.current.seconds.has(seconds)) return;
    heard.current.seconds.add(seconds);
    play('room-tick', { variant: URGENT_SECONDS + 1 - seconds });
  }, [deadline, seconds, play]);
}

/**
 * The room closing under a seated player, as a server restart closes it, is
 * heard as a lost connection. Belongs in the room page, which outlives the
 * seated room.
 */
export function useRoomClosedSound(stage: RoomStage['kind']): void {
  const play = useSounds(ROOM_SOUNDS);
  const was = useRef(stage);
  useEffect(() => {
    const before = was.current;
    was.current = stage;
    if (before === 'seated' && stage === 'closed') play('ui-connection-lost');
  }, [stage, play]);
}
