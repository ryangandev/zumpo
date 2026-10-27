import type {
  ChatMessage,
  DrawAndGuessRoomState,
} from '../../../shared/wire-types';
import type {
  DeriveSounds,
  IsNewGame,
  SoundBank,
  SoundEvent,
  SteppedId,
} from '../audio';
import { drawAndGuessSounds } from '../audio/generated/draw-and-guess';
import { uiSounds } from '../audio/generated/ui';
import { newGameBegan, ROOM_SOUNDS } from '../room/sounds';

/*
 * What a Draw & Guess room sounds like, beyond what every room does
 * (`room/sounds.ts`): the drawer's word chosen or picked for them, a guess
 * scored, the turn's end, a close guess, and the drawer's own pencil, undo and
 * clear. The room layer plays "your turn" (the drawer's, from `RoomLayout`)
 * and the start and end of the game; the drawing clock's last seconds are
 * `useDeadlineTicks`, for `actingDeadline`.
 */

export const DRAW_AND_GUESS_SOUNDS = {
  ...ROOM_SOUNDS,
  ...drawAndGuessSounds,
  'ui-undo': uiSounds['ui-undo'],
} satisfies SoundBank;

type Id = keyof typeof DRAW_AND_GUESS_SOUNDS & string;
type Stepped = SteppedId<typeof DRAW_AND_GUESS_SOUNDS>;
type Event = SoundEvent<Id, Stepped>;

/** Names a turn within a game: its round and its number (`2.5`). */
export const turnOf = (state: DrawAndGuessRoomState) =>
  `${state.currentRound}.${state.turn}`;

/**
 * True when `next` is in a later game than `prev`: what any room can tell,
 * and while both are on, a game whose turns started again or whose category
 * is another.
 */
export const isNewDrawAndGuessGame: IsNewGame<DrawAndGuessRoomState> = (
  prev,
  next,
) =>
  newGameBegan(prev, next) ||
  (prev.isGameStarted &&
    next.isGameStarted &&
    (next.turn < prev.turn || next.wordCategory !== prev.wordCategory));

/**
 * The clock `viewer` must act against, named, or null: the drawer's word to
 * choose, and a seated guesser's guess until they score. The drawer's own
 * drawing, a scorer's wait, a spectator's view and the review are not.
 */
export function actingDeadline(
  state: DrawAndGuessRoomState,
  viewer: string,
): string | null {
  if (!state.isGameStarted) return null;
  const drawer = state.currentDrawer === viewer;
  if (state.phase === 'choosing') {
    return drawer ? `${turnOf(state)}:choosing` : null;
  }
  if (state.phase !== 'drawing' || drawer) return null;
  const guessing =
    viewer in state.playerList && !state.scoredThisTurn.includes(viewer);
  return guessing ? `${turnOf(state)}:drawing` : null;
}

/**
 * The turn's end, heard once by everybody: everybody guessed, nobody did,
 * time ran out on a guesser still guessing, or else the reveal.
 */
function turnEnd(
  state: DrawAndGuessRoomState,
  viewer: string,
):
  | 'draw-and-guess-nobody-guessed'
  | 'draw-and-guess-all-guessed'
  | 'room-time-up'
  | 'room-reveal' {
  const drawer = state.currentDrawer;
  const scorers = state.scoredThisTurn.filter((id) => id !== drawer);
  if (scorers.length === 0) return 'draw-and-guess-nobody-guessed';
  const stillGuessing = Object.entries(state.playerList).some(
    ([id, player]) =>
      id !== drawer && player.isConnected && !scorers.includes(id),
  );
  if (!stillGuessing) return 'draw-and-guess-all-guessed';
  const guessing =
    viewer !== drawer &&
    viewer in state.playerList &&
    !scorers.includes(viewer);
  return guessing ? 'room-time-up' : 'room-reveal';
}

/** A turn's phases in the order it goes through them. */
const STEP: Record<DrawAndGuessRoomState['phase'], number> = {
  waiting: 0,
  choosing: 1,
  drawing: 2,
  reveal: 3,
};

/**
 * What a Draw & Guess snapshot adds for `viewer`: only what moves a turn on,
 * so a snapshot from earlier in the turn adds nothing. Every key names its
 * turn, so a snapshot repeated, or one from earlier in the game, plays
 * nothing heard before.
 */
export function deriveDrawAndGuessSounds(
  viewer: string,
): DeriveSounds<DrawAndGuessRoomState, Id, Stepped> {
  return (prev, next) => {
    const events: Event[] = [];
    if (!next.isGameStarted) return events;
    const turn = turnOf(next);
    const sameTurn = prev.isGameStarted && prev.turn === next.turn;
    // How far this turn had gone.
    const was = sameTurn ? STEP[prev.phase] : 0;

    // The drawer's word: chosen, or picked for them as the clock ran out.
    if (
      next.phase === 'drawing' &&
      was < STEP.drawing &&
      next.currentDrawer === viewer
    ) {
      events.push(
        next.wordAutoPicked
          ? { sound: 'room-time-up', key: `time-up:${turn}:choosing` }
          : { sound: 'room-stamp', key: `chose:${turn}` },
      );
    }

    // The turn ends: the last guess and the end of the turn arrive in one
    // snapshot, and are heard as one sound, the guesser's own if it was
    // theirs, or the end.
    const ends = next.phase === 'reveal' && was < STEP.reveal;
    const scoredBefore = sameTurn ? prev.scoredThisTurn : [];
    let mine = false;
    next.scoredThisTurn.forEach((id, index) => {
      if (scoredBefore.includes(id)) return;
      if (id === viewer) {
        mine = true;
        events.push({
          sound: 'draw-and-guess-correct',
          key: `correct:${turn}`,
        });
      } else if (!ends) {
        // One step higher for each guesser this turn.
        events.push({
          sound: 'room-someone-scored',
          key: `scored:${turn}:${id}`,
          other: true,
          variant: index + 1,
        });
      }
    });
    if (ends && !mine) {
      events.push({ sound: turnEnd(next, viewer), key: `end:${turn}` });
    }
    return events;
  };
}

/**
 * A guess of `viewer`'s close to the word: a chat line back to them alone,
 * which the snapshot knows nothing of. Its id is its key, and the lines a
 * history brings back are a baseline (the chat's epoch).
 */
export function deriveCloseGuessSounds(
  viewer: string,
): DeriveSounds<readonly ChatMessage[], Id, Stepped> {
  return (prev, next) => {
    const newest = prev.reduce((top, line) => Math.max(top, line.id), -1);
    return next
      .filter(
        (line) =>
          line.id > newest &&
          line.kind === 'player' &&
          line.close === true &&
          line.playerId === viewer,
      )
      .map((line) => ({
        sound: 'draw-and-guess-close' as const,
        key: `close:${line.id}`,
      }));
  };
}

/** The chat's lines never come round again in one room. */
export const sameChat: IsNewGame<readonly ChatMessage[]> = () => false;
