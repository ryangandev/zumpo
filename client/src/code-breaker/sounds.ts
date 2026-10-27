import type {
  CodeBreakerMark,
  CodeBreakerRoomState,
  CodeBreakerRow,
} from '../../../shared/wire-types';
import { markGuess, pegsOf } from '../../../shared/code-breaker';
import type {
  DeriveSounds,
  IsNewGame,
  SoundBank,
  SoundEvent,
  SteppedId,
} from '../audio';
import { codeBreakerSounds } from '../audio/generated/code-breaker';
import { uiSounds } from '../audio/generated/ui';
import { gameSounds, ROOM_SOUNDS } from '../room/sounds';
import { SOLO_BANK } from '../solo/sounds';
import type { SoloGame } from './solo/game';

/*
 * What Code Breaker sounds like. Typing a row, on your own or in a room,
 * the pad plays what the player does: a digit, a delete, a row or a digit
 * turned back, a note. A guess's pegs drop in one after another, bright for
 * right, middling for moved, dull for not in, from the state the guess
 * makes: the game's on your own, the server's in a room, which marks it. In
 * a room, beyond what every room does (`room/sounds.ts`): somebody else
 * cracking the code, a step higher each, the round's reveal or your time
 * up, and the round's last seconds (`actingDeadline`). Others' pegs are
 * theirs to watch, and silent.
 */

/** What the pad plays as the player types, on your own or in a room. */
export const CODE_BREAKER_PAD_BANK = {
  'ui-key': uiSounds['ui-key'],
  'ui-delete': uiSounds['ui-delete'],
  'ui-nope': uiSounds['ui-nope'],
  'ui-tap': uiSounds['ui-tap'],
  'code-breaker-note': codeBreakerSounds['code-breaker-note'],
} satisfies SoundBank;

/** The room's bank and Code Breaker's own. */
export const CODE_BREAKER_BANK = {
  ...ROOM_SOUNDS,
  ...CODE_BREAKER_PAD_BANK,
  ...codeBreakerSounds,
} satisfies SoundBank;

/** On your own: the solo stingers and Code Breaker's own. */
export const CODE_BREAKER_SOLO_BANK = {
  ...SOLO_BANK,
  ...CODE_BREAKER_PAD_BANK,
  ...codeBreakerSounds,
} satisfies SoundBank;

type Id = keyof typeof CODE_BREAKER_BANK & string;
type Stepped = SteppedId<typeof CODE_BREAKER_BANK>;
type PegSound =
  | 'code-breaker-peg-right'
  | 'code-breaker-peg-moved'
  | 'code-breaker-peg-not-in';

const PEG_SOUND = {
  right: 'code-breaker-peg-right',
  moved: 'code-breaker-peg-moved',
  none: 'code-breaker-peg-not-in',
} as const satisfies Record<ReturnType<typeof pegsOf>[number], PegSound>;

/** How far apart a guess's pegs drop in. */
export const PEG_GAP_MS = 100;

/**
 * A guess's four pegs, in the board's order (right, then moved, then the
 * rest), one after another. `row` names the guess within the game.
 */
export function pegSounds(
  mark: CodeBreakerMark,
  row: string,
): SoundEvent<PegSound>[] {
  return pegsOf(mark).map((peg, index) => ({
    sound: PEG_SOUND[peg],
    key: `${row}:peg:${index}`,
    ...(index > 0 ? { delayMs: index * PEG_GAP_MS } : {}),
  }));
}

/**
 * A guess on your own, its pegs dropping in. The guesses only grow, so a
 * row's number names it. The guess that cracks or misses the code is the
 * game's end, heard alone.
 */
export const deriveCodeBreakerSolo: DeriveSounds<SoloGame, PegSound> = (
  prev,
  next,
) => {
  if (next.guesses.length <= prev.guesses.length) return [];
  const guess = next.guesses.at(-1)!;
  return pegSounds(markGuess(guess, next.code), `row:${next.guesses.length}`);
};

/**
 * Every board of the round a snapshot is about: the open boards, or the
 * revealed round's, which take their place.
 */
const boardsOf = (state: CodeBreakerRoomState) =>
  state.phase === 'reveal' ? (state.lastRound?.boards ?? []) : state.boards;

/** `viewer`'s own rows of the round a snapshot is about. */
const rowsOf = (
  state: CodeBreakerRoomState,
  viewer: string,
): readonly CodeBreakerRow[] =>
  boardsOf(state).find((board) => board.playerId === viewer)?.rows ?? [];

const sameMark = (a: CodeBreakerMark, b: CodeBreakerMark | undefined) =>
  a.right === b?.right && a.moved === b.moved;

/** Who has cracked the open code. */
const crackedBy = (state: CodeBreakerRoomState) =>
  state.boards
    .filter((board) => board.status === 'cracked')
    .map((board) => board.playerId);

/** Whether `viewer` is still at the open code, against its clock. */
const stillGuessing = (state: CodeBreakerRoomState, viewer: string) =>
  state.boards.find((board) => board.playerId === viewer)?.status ===
  'guessing';

/**
 * Across a reconnection, with a game under way on both sides: another game,
 * whose rounds started again or number otherwise, where a board of the same
 * round has fewer rows or other marks than before, since within a round
 * rows are only added, or where somebody has fewer points, which within a
 * game only ever grow.
 */
export const isNewCodeBreakerGame: IsNewGame<CodeBreakerRoomState> = (
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
        board.rows.some((row, index) => !sameMark(row.mark, rows[index]?.mark))
      );
    });
    if (rewritten) return true;
  }
  return Object.entries(next.playerList).some(
    ([id, player]) => player.points < (prev.playerList[id]?.points ?? 0),
  );
};

/** The code `viewer` is still cracking against the clock, named, or null. */
export function actingDeadline(
  state: CodeBreakerRoomState,
  viewer: string,
): string | null {
  return state.isGameStarted &&
    state.phase === 'guessing' &&
    stillGuessing(state, viewer)
    ? `${state.round}:guessing`
    : null;
}

/**
 * What a Code Breaker snapshot adds for `viewer`: only what moves a round
 * on, so a snapshot from earlier in the round adds nothing. The last guess
 * and the round's end arrive in one snapshot, and are heard as one: the
 * guesser's own pegs, or the reveal, which is the time up for a player still
 * guessing.
 */
export function deriveCodeBreakerSounds(
  viewer: string,
): DeriveSounds<CodeBreakerRoomState, Id, Stepped> {
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
      events.push(...pegSounds(last.mark, `row:${round}.${rows.length}`));
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
    const crackedBefore = sameRound ? crackedBy(prev) : [];
    let step = crackedBefore.length;
    for (const id of crackedBy(next)) {
      if (crackedBefore.includes(id)) continue;
      // One step higher for each player who cracks it this round.
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

/** What `RoomLayout` hears a Code Breaker room by, beside the room's own. */
export const CODE_BREAKER_SOUNDS = gameSounds({
  bank: CODE_BREAKER_BANK,
  derive: deriveCodeBreakerSounds,
  isNewGame: isNewCodeBreakerGame,
});
