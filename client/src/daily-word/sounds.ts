import type {
  DailyWordMark,
  DailyWordRoomState,
  DailyWordRow,
} from '../../../shared/wire-types';
import { markGuess } from '../../../shared/daily-word';
import type {
  DeriveSounds,
  IsNewGame,
  SoundBank,
  SoundEvent,
  SteppedId,
} from '../audio';
import { dailyWordSounds } from '../audio/generated/daily-word';
import { uiSounds } from '../audio/generated/ui';
import { gameSounds, ROOM_SOUNDS } from '../room/sounds';
import { SOLO_BANK } from '../solo/sounds';
import type { SoloGame } from './solo/game';

/*
 * What Daily Word sounds like. Typing a row, on your own or in a room, the
 * board plays what the player does: a letter, a delete, a row the rules turn
 * back. A guess's tiles turn one after another, bright for right, middling
 * for moved, dull for not in, from the state the guess makes: the game's on
 * your own, the server's in a room, which marks it. In a room, beyond what
 * every room does (`room/sounds.ts`): somebody else finding the word, a step
 * higher each, the round's reveal or your time up, and the round's last
 * seconds (`actingDeadline`). Others' tiles are theirs to watch, and
 * silent. On your own there is no clock, and nothing ticks.
 */

/** What the board plays as the player types, on your own or in a room. */
export const DAILY_WORD_KEY_BANK = {
  'ui-key': uiSounds['ui-key'],
  'ui-delete': uiSounds['ui-delete'],
  'ui-nope': uiSounds['ui-nope'],
} satisfies SoundBank;

/** The room's bank and Daily Word's own. */
export const DAILY_WORD_BANK = {
  ...ROOM_SOUNDS,
  ...DAILY_WORD_KEY_BANK,
  ...dailyWordSounds,
} satisfies SoundBank;

/** On your own: the solo stingers and Daily Word's own. */
export const DAILY_WORD_SOLO_BANK = {
  ...SOLO_BANK,
  ...DAILY_WORD_KEY_BANK,
  ...dailyWordSounds,
} satisfies SoundBank;

type Id = keyof typeof DAILY_WORD_BANK & string;
type Stepped = SteppedId<typeof DAILY_WORD_BANK>;
type TileSound =
  'daily-word-tile-right' | 'daily-word-tile-moved' | 'daily-word-tile-not-in';

const TILE_SOUND = {
  correct: 'daily-word-tile-right',
  present: 'daily-word-tile-moved',
  absent: 'daily-word-tile-not-in',
} as const satisfies Record<DailyWordMark, TileSound>;

/** How far apart a guess's tile sounds are; the tiles themselves do not animate. */
export const TILE_GAP_MS = 100;

/**
 * A guess's five tile sounds, left to right, one after another (the tiles
 * show their marks at once, with no flip to follow). `row` names the guess
 * within the game.
 */
export function tileSounds(
  marks: readonly DailyWordMark[],
  row: string,
): SoundEvent<TileSound>[] {
  return marks.map((mark, index) => ({
    sound: TILE_SOUND[mark],
    key: `${row}:tile:${index}`,
    ...(index > 0 ? { delayMs: index * TILE_GAP_MS } : {}),
  }));
}

/**
 * A guess on your own, its tiles turning. The guesses only grow, so a row's
 * number names it. The guess that finds or misses the word is the game's
 * end, heard alone.
 */
export const deriveDailyWordSolo: DeriveSounds<SoloGame, TileSound> = (
  prev,
  next,
) => {
  if (next.guesses.length <= prev.guesses.length) return [];
  const guess = next.guesses.at(-1)!;
  return tileSounds(
    markGuess(guess, next.answer),
    `row:${next.guesses.length}`,
  );
};

/**
 * Every board of the round a snapshot is about: the open boards, or the
 * revealed round's, which take their place.
 */
const boardsOf = (state: DailyWordRoomState) =>
  state.phase === 'reveal' ? (state.lastRound?.boards ?? []) : state.boards;

/** `viewer`'s own rows of the round a snapshot is about. */
const rowsOf = (
  state: DailyWordRoomState,
  viewer: string,
): readonly DailyWordRow[] =>
  boardsOf(state).find((board) => board.playerId === viewer)?.rows ?? [];

const sameMarks = (a: readonly DailyWordMark[], b: readonly DailyWordMark[]) =>
  a.join() === b.join();

/** Who has found the open word. */
const foundBy = (state: DailyWordRoomState) =>
  state.boards
    .filter((board) => board.status === 'found')
    .map((board) => board.playerId);

/** Whether `viewer` is still at the open word, against its clock. */
const stillGuessing = (state: DailyWordRoomState, viewer: string) =>
  state.boards.find((board) => board.playerId === viewer)?.status ===
  'guessing';

/**
 * Across a reconnection, with a game under way on both sides: another game,
 * whose rounds started again or number otherwise, where a board of the same
 * round has fewer rows or other marks than before, since within a round
 * rows are only added, or where somebody has fewer points, which within a
 * game only ever grow.
 */
export const isNewDailyWordGame: IsNewGame<DailyWordRoomState> = (
  prev,
  next,
) => {
  if (next.round < prev.round || next.rounds !== prev.rounds) return true;
  if (next.round === prev.round) {
    const after = boardsOf(next);
    const rewritten = boardsOf(prev).some((board) => {
      const rows = after.find((b) => b.playerId === board.playerId)?.rows;
      return (
        rows !== undefined &&
        board.rows.some(
          (row, index) =>
            !rows[index] || !sameMarks(row.marks, rows[index].marks),
        )
      );
    });
    if (rewritten) return true;
  }
  return Object.entries(next.playerList).some(
    ([id, player]) => player.points < (prev.playerList[id]?.points ?? 0),
  );
};

/** The word `viewer` is still looking for against the clock, named, or null. */
export function actingDeadline(
  state: DailyWordRoomState,
  viewer: string,
): string | null {
  return state.isGameStarted &&
    state.phase === 'guessing' &&
    stillGuessing(state, viewer)
    ? `${state.round}:guessing`
    : null;
}

/**
 * What a Daily Word snapshot adds for `viewer`: only what moves a round on,
 * so a snapshot from earlier in the round adds nothing. The last guess and
 * the round's end arrive in one snapshot, and are heard as one: the
 * guesser's own tiles, or the reveal, which is the time up for a player
 * still guessing.
 */
export function deriveDailyWordSounds(
  viewer: string,
): DeriveSounds<DailyWordRoomState, Id, Stepped> {
  return (prev, next) => {
    const events: SoundEvent<Id, Stepped>[] = [];
    if (!next.isGameStarted) return events;
    const round = next.round;
    const sameRound = prev.isGameStarted && prev.round === round;
    if (sameRound && prev.phase === 'reveal') return events;

    const before = sameRound ? rowsOf(prev, viewer).length : 0;
    const rows = rowsOf(next, viewer);
    const guessed = rows.length > before;
    const last = rows.at(-1);
    if (guessed && last) {
      events.push(...tileSounds(last.marks, `row:${round}.${rows.length}`));
    }

    if (next.phase === 'reveal') {
      if (!guessed) {
        events.push({
          sound:
            sameRound && stillGuessing(prev, viewer)
              ? 'room-time-up'
              : 'room-reveal',
          key: `end:${round}`,
        });
      }
      return events;
    }
    const foundBefore = sameRound ? foundBy(prev) : [];
    let step = foundBefore.length;
    for (const id of foundBy(next)) {
      if (foundBefore.includes(id)) continue;
      // One step higher for each player who finds it this round.
      step += 1;
      if (id === viewer) continue;
      events.push({
        sound: 'room-someone-scored',
        key: `scored:${round}:${id}`,
        other: true,
        variant: step,
      });
    }
    return events;
  };
}

/** What `RoomLayout` hears a Daily Word room by, beside the room's own. */
export const DAILY_WORD_SOUNDS = gameSounds({
  bank: DAILY_WORD_BANK,
  derive: deriveDailyWordSounds,
  isNewGame: isNewDailyWordGame,
});
