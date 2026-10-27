import { useState } from 'react';
import { useSounds } from '../audio';
import { useMessages, type Messages } from '../i18n';
import {
  BID_FACES,
  counts,
  smallestCountFor,
  smallestRaise,
  type Bid,
} from '../../../shared/liars-dice';
import type { BidPickerProps, DieFace } from '../ui';
import { LIARS_DICE_PICKER_BANK } from './sounds';

/**
 * Where the picker opens: on the face you hold most of, your wild ones
 * counted, at the smallest count that face may be bid at; on a tie, the
 * higher face. Without dice of your own to go by, the smallest raise. Null
 * when there is no raise left, only a call.
 */
export function openingBid(
  previous: Bid | null,
  diceOnTable: number,
  mine: readonly number[],
): Bid | null {
  const open = BID_FACES.filter(
    (face) => smallestCountFor(face, previous) <= diceOnTable,
  );
  if (mine.length === 0 || open.length === 0) {
    return smallestRaise(previous, diceOnTable);
  }
  const held = (face: number) => mine.filter((die) => counts(die, face)).length;
  const face = open.reduce((best, next) =>
    held(next) >= held(best) ? next : best,
  );
  return { face, count: smallestCountFor(face, previous) };
}

/**
 * The picker's choice, kept to a raise: picking a face lifts the count to the
 * smallest that face allows, and Fewer stops there. It opens on your
 * strongest face (`openingBid`), and starts over whenever the bid in front of
 * you changes.
 */
export function useBidChoice(
  previous: Bid | null,
  diceOnTable: number,
  /** Your own dice this round, to open on what you hold. */
  mine: readonly number[],
  onBid: (bid: Bid) => void,
): Omit<BidPickerProps, 'onCall' | 'className'> | null {
  const m = useMessages();
  const tap = useSounds(LIARS_DICE_PICKER_BANK);
  const key = `${previous ? `${previous.count}×${previous.face}` : 'open'}/${mine.join()}`;
  const opening = openingBid(previous, diceOnTable, mine);
  const [choice, setChoice] = useState({ key, bid: opening });
  let bid = choice.bid;
  if (choice.key !== key) {
    bid = opening;
    setChoice({ key, bid: opening });
  }
  if (bid === null) return null;
  const chosen = bid;
  return {
    ...pickerFor(
      chosen,
      previous,
      diceOnTable,
      (next) => {
        tap('ui-tap');
        setChoice({ key, bid: next });
      },
      m,
    ),
    onBid: () => onBid(chosen),
  };
}

/** The picker's props for `bid`, given the bid it must raise. */
export function pickerFor(
  bid: Bid,
  previous: Bid | null,
  diceOnTable: number,
  choose: (bid: Bid) => void,
  m: Messages,
): Omit<BidPickerProps, 'onCall' | 'onBid' | 'className'> {
  const lowest = smallestCountFor(bid.face, previous);
  return {
    count: bid.count,
    face: bid.face as DieFace,
    openFaces: BID_FACES.filter(
      (face) => smallestCountFor(face, previous) <= diceOnTable,
    ),
    canFewer: bid.count - 1 >= Math.max(1, lowest),
    canMore: bid.count + 1 <= diceOnTable,
    bidLabel: m.liarsDice.bidLabel(bid),
    onCountChange: (count) =>
      choose({
        ...bid,
        count: Math.min(diceOnTable, Math.max(lowest, count)),
      }),
    onFaceChange: (face) =>
      choose({
        face,
        count: Math.max(bid.count, smallestCountFor(face, previous)),
      }),
  };
}
