import type { PairsCardView, PairsRoomState } from '../../../shared/wire-types';
import type {
  DeriveSounds,
  IsNewGame,
  SoundBank,
  SoundEvent,
  SteppedId,
} from '../audio';
import { pairsSounds } from '../audio/generated/pairs';
import {
  gameSounds,
  ROOM_SOUNDS,
  type GameDerive,
  type NewGo,
} from '../room/sounds';
import { SOLO_BANK } from '../solo/sounds';
import type { SoloGame } from './solo/game';

/*
 * What Pairs sounds like. On your own: a card turning up, a pair found, a
 * step higher for each pair in a row, two cards that did not match turning
 * back, and the board's end. In a room, beyond what every room does
 * (`room/sounds.ts`): the same cards, anybody's (somebody else's softer),
 * a pair a step higher for each the same go finds, a miss as its second card
 * shows, your go running out, and the last seconds of your go
 * (`actingDeadline`). A snapshot cannot name a go, so the page counts them
 * (`newPairsGo`).
 */

/** The room's bank and Pairs' own. */
export const PAIRS_BANK = {
  ...ROOM_SOUNDS,
  ...pairsSounds,
} satisfies SoundBank;

type Id = keyof typeof PAIRS_BANK & string;
type Stepped = SteppedId<typeof PAIRS_BANK>;

/** On your own: the solo stingers and Pairs' own. */
export const PAIRS_SOLO_BANK = {
  ...SOLO_BANK,
  ...pairsSounds,
} satisfies SoundBank;

type SoloId = keyof typeof PAIRS_SOLO_BANK & string;
type SoloStepped = SteppedId<typeof PAIRS_SOLO_BANK>;

/** How many pairs in a row the turns end on: a miss starts again. */
export function streakOf(turns: readonly boolean[]): number {
  const miss = turns.lastIndexOf(false);
  return turns.length - miss - 1;
}

/**
 * What a card turned over on your own, or a miss turning back, sounds like.
 * Every finished turn is counted, so a turn's number names its cards: the
 * first card of the next turn (`flip:4`), the second (`turn:4`, a flip or a
 * pair, a step higher for each in a row), and a miss turning back
 * (`back:4`), by its timer or because another card was turned. The last
 * pair is the board's end, heard alone.
 */
export const derivePairsSolo: DeriveSounds<SoloGame, SoloId, SoloStepped> = (
  prev,
  next,
) => {
  const events: SoundEvent<SoloId, SoloStepped>[] = [];
  const turn = next.turns.length;
  if (prev.up.length === 2 && next.up.length !== 2) {
    events.push({ sound: 'pairs-miss', key: `back:${prev.turns.length - 1}` });
  }
  if (turn > prev.turns.length) {
    const index = turn - 1;
    events.push(
      next.turns[index]
        ? {
            sound: 'pairs-match',
            key: `turn:${index}`,
            variant: streakOf(next.turns),
          }
        : { sound: 'pairs-flip', key: `turn:${index}` },
    );
  } else if (
    next.up.length === 1 &&
    (prev.up.length !== 1 || prev.up[0] !== next.up[0])
  ) {
    events.push({ sound: 'pairs-flip', key: `flip:${turn}` });
  }
  return events;
};

/** How many cards are face up and not yet matched. */
const upIn = (cards: readonly PairsCardView[]) =>
  cards.filter((card) => card.state === 'up').length;

/**
 * Whether `next` begins another go: the go passes to somebody else; a miss
 * turns back, even when the same player goes again (the only other player
 * is away); or a go runs out, even into the same player's next. A pair keeps
 * the go. Not seen: a player alone at the table running out twice in a row
 * without a card, which leaves every snapshot as it was.
 */
export const newPairsGo: NewGo<PairsRoomState> = (prev, next) =>
  prev.turnPlayerId !== next.turnPlayerId ||
  (prev.phase === 'showing' && next.phase === 'flipping') ||
  (next.timedOut !== null && next.timedOut !== prev.timedOut);

/**
 * Whether two snapshots of a game under way, on either side of a
 * reconnection, are of different games: another board, fewer pairs, or a
 * card found before that is no longer, or shows another symbol.
 */
export const isNewPairsGame: IsNewGame<PairsRoomState> = (prev, next) =>
  prev.board !== next.board ||
  prev.cards.length !== next.cards.length ||
  next.pairsFound < prev.pairsFound ||
  prev.cards.some((card, index) => {
    const now = next.cards[index];
    return (
      card.state === 'matched' &&
      (now?.state !== 'matched' || now.symbol !== card.symbol)
    );
  });

/**
 * The deadline `viewer` must act in, named for the go and the pairs found,
 * since a pair keeps the go with a fresh clock; or null when it is not
 * their go to flip.
 */
export function actingDeadline(
  state: PairsRoomState,
  viewer: string,
  go: number,
): string | null {
  return state.isGameStarted &&
    state.phase === 'flipping' &&
    state.turnPlayerId === viewer
    ? `${go}:${state.pairsFound}:flipping`
    : null;
}

/**
 * What a change in a Pairs room sounds like to `viewer`, the go counted by
 * the page (`go.count`). The first card of a turn is a flip
 * (`flip:<go>:<pairs>`), and the second a pair (`pair:<pairs>`, a step
 * higher for each the go has found) or a miss (`miss:<go>`), which is heard
 * as it shows: as it turns back the go passes, and the next player's "your
 * turn" stands alone. Your go running out is time up (`timeout:<go>`). The
 * last pair ends the game, which the room's end sounds alone.
 */
export function derivePairsSounds(
  viewer: string,
): GameDerive<PairsRoomState, Id, Stepped> {
  return (prev, next, go) => {
    if (!prev.isGameStarted || !next.isGameStarted) return [];
    const events: SoundEvent<Id, Stepped>[] = [];
    const other = prev.turnPlayerId !== viewer;
    if (next.pairsFound > prev.pairsFound) {
      events.push({
        sound: 'pairs-match',
        key: `pair:${next.pairsFound}`,
        other,
        variant: Math.max(1, next.pairsFound - go.began.pairsFound),
      });
    } else if (prev.phase === 'flipping' && next.phase === 'showing') {
      events.push({ sound: 'pairs-miss', key: `miss:${go.count}`, other });
    } else if (
      next.phase === 'flipping' &&
      upIn(prev.cards) === 0 &&
      upIn(next.cards) === 1
    ) {
      events.push({
        sound: 'pairs-flip',
        key: `flip:${go.count}:${next.pairsFound}`,
        other,
      });
    }
    if (next.timedOut === viewer && prev.timedOut !== viewer) {
      events.push({ sound: 'room-time-up', key: `timeout:${go.count}` });
    }
    return events;
  };
}

/** Pairs in a room, for `RoomLayout`. */
export const PAIRS_SOUNDS = gameSounds({
  bank: PAIRS_BANK,
  derive: derivePairsSounds,
  isNewGame: isNewPairsGame,
  newGo: newPairsGo,
});
