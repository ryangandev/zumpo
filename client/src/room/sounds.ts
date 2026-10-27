import { useEffect, useMemo, useRef } from 'react';
import type { AnyRoomState, GameSummary } from '../../../shared/wire-types';
import {
  useSounds,
  useStateSounds,
  type DeriveSounds,
  type IsNewGame,
  type PlaySound,
  type SelectSounds,
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
 * deadline you must act in. A game adds its own in `<game>/sounds.ts`: a
 * pure derive from one snapshot to the next, what tells its games apart and
 * what names its goes, handed to `RoomLayout` as one `gameSounds(...)`.
 * `RoomLayout` hears the room's derive and the game's through one replay
 * guard, so one snapshot is heard once, by one rule. How and why:
 * docs/architecture.md#sounds-in-a-room.
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
  /** The connection the snapshot came on. */
  connection: number;
  /** How many times this page has pressed Ready. */
  readied: number;
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
 * results say it, so a game nobody scored in is everybody's win. A Hush
 * table wins or loses together, Gomoku's winner is a colour or nobody, and
 * Liar's Dice ranks in finishing order.
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
 * can, across a reconnection (`isNewGameIn`).
 */
export function newGameBegan(prev: AnyRoomState, next: AnyRoomState): boolean {
  if (next.isGameStarted) return !prev.isGameStarted;
  return (
    !prev.isGameStarted &&
    next.lastGame !== null &&
    summaryKey(prev.lastGame) !== summaryKey(next.lastGame)
  );
}

/**
 * What a game hands `RoomLayout` for the room to hear it by, made with
 * `gameSounds`: its own derive, what tells two of its games apart, and what
 * names its goes. A game with none of them hears only the room.
 */
export interface GameSounds {
  readonly bank: SoundBank;
  readonly derive:
    ((viewer: string) => DeriveSounds<AnyRoomState, string>) | undefined;
  readonly isNewGame: IsNewGame<AnyRoomState> | undefined;
  readonly turnOf: ((state: AnyRoomState) => string) | undefined;
}

/**
 * A game's sounds for `RoomLayout`, typed on the game's own state and bank:
 * a module constant, since every part takes the viewer or the states.
 *
 * - `bank`: the game's bank, which holds the room's (`{...ROOM_SOUNDS, ...}`).
 * - `derive(viewer)`: what a snapshot of this game adds for `viewer`. Never
 *   "your turn" or a start or end stinger, which are the room's alone.
 * - `isNewGame`: whether two snapshots on either side of a reconnection, both
 *   with a game under way, are of different games. On one connection the
 *   room sees every start itself.
 * - `turnOf`: names the go in play, the same for everybody. A name never
 *   comes round again within one game, or "your turn" stays silent the
 *   second time (`2.5`: round 2, turn 5). A game that cannot name its goes
 *   gives none, and its turns are silent.
 */
export function gameSounds<
  State extends AnyRoomState,
  Bank extends typeof ROOM_SOUNDS = typeof ROOM_SOUNDS,
>(sounds: {
  bank?: Bank;
  derive?: (
    viewer: string,
  ) => DeriveSounds<State, keyof Bank & string, SteppedId<Bank>>;
  isNewGame?: IsNewGame<State>;
  turnOf?: (state: State) => string;
}): GameSounds {
  // The room hands each part only its own game's states.
  return {
    bank: sounds.bank ?? ROOM_SOUNDS,
    derive: sounds.derive,
    isNewGame: sounds.isNewGame,
    turnOf: sounds.turnOf,
  } as unknown as GameSounds;
}

/** A game with no sounds of its own: the room's alone. */
export const NO_GAME_SOUNDS = gameSounds({});

/**
 * What only the room plays, and what stands alone on its snapshot: the
 * game's events in the same change are dropped (heard, never played), the
 * viewer's own included. The room's joins, leaves and Ready stay beside it.
 */
const LEADS: ReadonlySet<string> = new Set<RoomSoundId>([
  'room-your-turn',
  'stinger-game-start',
  'stinger-win',
  'stinger-nice-game',
]);

/** Marks a game's keys, apart from the room's in the one guard. */
const GAME_KEY = 'game:';

/**
 * What the room layer hears between two views, for `viewer`. Somebody else's
 * doing plays softer; a spectator has no go and no Ready, so hears the others
 * and the game's start and end. Keys hold within a game: somebody who leaves
 * and comes back in one game is heard the first time only, and so is
 * somebody else's Ready. The viewer's own Ready counts their presses, so it
 * stamps each time.
 */
export function deriveRoomSounds(
  viewer: string,
): DeriveSounds<RoomSoundView, RoomSoundId, RoomStepped> {
  return (prev, next) => {
    const events: SoundEvent<RoomSoundId, RoomStepped>[] = [];
    const before = prev.state;
    const after = next.state;

    // A dropped connection is not a departure: a seat given up is, by Leave
    // room or as its grace runs out. Moving between the table and the
    // spectator seats is neither.
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
            ? { sound: 'room-stamp', key: `ready:${id}:${next.readied}` }
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
 * Whether `next` is in a later game than `prev`, for the one guard. On one
 * connection every snapshot arrives, in order, so the room sees each game
 * start (`newGameBegan`), and nothing else forgets the keys: a snapshot
 * from earlier in the game is never taken for a new one. Across a
 * reconnection a whole game may have gone by unseen, which only the game can
 * tell (`GameSounds.isNewGame`).
 */
export function isNewGameIn(game: GameSounds): IsNewGame<RoomSoundView> {
  return (prev, next) =>
    newGameBegan(prev.state, next.state) ||
    (prev.connection !== next.connection &&
      prev.state.isGameStarted &&
      next.state.isGameStarted &&
      (game.isNewGame?.(prev.state, next.state) ?? false));
}

/**
 * A lead of the room's on a change plays without the game's events beside
 * it. After the keys: what is dropped here was heard, and never plays later.
 */
const leadsAlone: SelectSounds<string> = (events) =>
  events.some((e) => LEADS.has(e.sound) && !e.key.startsWith(GAME_KEY))
    ? events.filter((e) => !e.key.startsWith(GAME_KEY))
    : events;

/**
 * Arriving on your go has heard it: a go that drops while the page
 * reconnects, and comes back, is not news.
 */
const standing = (view: RoomSoundView) =>
  view.turn === null ? [] : [`turn:${view.turn}`];

/**
 * The one replay guard's rules for a room and its game, as `RoomLayout`
 * hears them: the room's derive and the game's over the same two views, the
 * game's keys apart (`game:`), "your turn" and the start and end stingers
 * standing alone on their snapshot (`LEADS`), and a go the page arrives on
 * already heard.
 */
export function roomSoundRules(viewer: string, game: GameSounds) {
  const room = deriveRoomSounds(viewer);
  const own = game.derive?.(viewer);
  const derive: DeriveSounds<RoomSoundView, string> = (prev, next) => [
    ...room(prev, next),
    ...(own?.(prev.state, next.state) ?? [])
      .filter((event) => !LEADS.has(event.sound))
      .map((event) => ({ ...event, key: `${GAME_KEY}${event.key}` })),
  ];
  return { derive, isNewGame: isNewGameIn(game), select: leadsAlone, standing };
}

/**
 * Plays the room's sounds and its game's for the room the viewer is in, from
 * the snapshots, through one replay guard. It belongs in `RoomLayout`, which
 * every game's room renders for as long as it is open. `epoch` is the
 * connection the snapshot came on, so the first snapshot of a new connection
 * is only a baseline.
 */
export function useRoomSounds({
  state,
  viewer,
  yourTurn,
  epoch,
  readied,
  game,
}: {
  state: AnyRoomState;
  viewer: string;
  yourTurn: boolean;
  epoch: number;
  readied: number;
  game: GameSounds;
}): void {
  // Every id a game's derive gives is in its bank.
  const play = useSounds(game.bank) as PlaySound<string>;
  const turn = yourTurn && game.turnOf ? game.turnOf(state) : null;
  const view = useMemo<RoomSoundView>(
    () => ({ state, turn, connection: epoch, readied }),
    [state, turn, epoch, readied],
  );
  const rules = useMemo(() => roomSoundRules(viewer, game), [viewer, game]);
  useStateSounds(view, { ...rules, play, epoch });
}

/**
 * The last seconds of a deadline this player must act in, one tick a second
 * from `URGENT_SECONDS` to 1, rising, as the clock turns urgent. A clock is
 * not a snapshot, so this follows the seconds the page shows rather than the
 * replay guard; call it beside the clock with the same `seconds`, so the tick
 * lands with the digit.
 *
 * `deadline` names the deadline (`2.5:drawing`), or is null while the viewer
 * has none to act in: someone else's go, an Info clock, a spectator. While
 * `paused` (the connection is down, and the clock holds still) nothing
 * ticks. The first seconds seen for a deadline, and the first after a pause,
 * only set where it stands, so arriving or coming back at 3 seconds left
 * ticks 2 and 1; a second already ticked never ticks again, though a
 * snapshot moves the clock back.
 */
export function useDeadlineTicks({
  seconds,
  deadline,
  paused,
}: {
  seconds: number;
  deadline: string | null;
  paused: boolean;
}): void {
  const play = useSounds(ROOM_SOUNDS);
  const acting = paused ? null : deadline;
  const last = useRef<{ deadline: string | null; seconds: number } | null>(
    null,
  );
  const heard = useRef<{ deadline: string; seconds: Set<number> } | null>(null);
  useEffect(() => {
    const before = last.current;
    last.current = { deadline: acting, seconds };
    if (acting === null || before?.deadline !== acting) return;
    if (seconds >= before.seconds || seconds < 1 || seconds > URGENT_SECONDS) {
      return;
    }
    if (heard.current?.deadline !== acting) {
      heard.current = { deadline: acting, seconds: new Set() };
    }
    if (heard.current.seconds.has(seconds)) return;
    heard.current.seconds.add(seconds);
    play('room-tick', { variant: URGENT_SECONDS + 1 - seconds });
  }, [acting, seconds, play]);
}

/**
 * The connection dropping under a seated player, each time it drops, and the
 * room closing under them, as a server restart closes it. Neither is in a
 * snapshot, so neither goes through the replay guard: each is a live edge,
 * which a refresh never repeats. Belongs in the room page, which outlives
 * the seated room.
 */
export function useConnectionLostSound(stage: RoomStage): void {
  const play = useSounds(ROOM_SOUNDS);
  const now =
    stage.kind === 'seated'
      ? stage.reconnecting
        ? 'down'
        : 'up'
      : stage.kind === 'closed'
        ? 'down'
        : 'away';
  const was = useRef(now);
  useEffect(() => {
    const before = was.current;
    was.current = now;
    if (before === 'up' && now === 'down') play('ui-connection-lost');
  }, [now, play]);
}
