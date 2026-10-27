import type { DeriveSounds, SoundBank, SoundEvent, SteppedId } from '../audio';
import { pairsSounds } from '../audio/generated/pairs';
import { SOLO_BANK } from '../solo/sounds';
import type { SoloGame } from './solo/game';

/*
 * What Pairs sounds like on your own: a card turning up, a pair found, a
 * step higher for each pair in a row, two cards that did not match turning
 * back, and the board's end.
 */

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
