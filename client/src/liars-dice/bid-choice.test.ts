import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { zh } from '../i18n/zh';
import { openingBid, pickerFor } from './bid-choice';

const noop = () => {};

describe('the bid picker’s choice', () => {
  it('labels a legal raise in Chinese without changing the chosen bid', () => {
    const picker = pickerFor(
      { count: 5, face: 6 },
      { count: 5, face: 5 },
      10,
      noop,
      zh,
    );
    expect(picker).toMatchObject({
      bidLabel: '叫 5 个 6',
      canFewer: false,
      face: 6,
      count: 5,
    });
  });

  it('stops Fewer at the smallest count the face allows', () => {
    // LD09: five 5s in front of Sam, ten dice on the table.
    const fiveFives = { count: 5, face: 5 };
    expect(
      pickerFor({ count: 5, face: 6 }, fiveFives, 10, noop, en),
    ).toMatchObject({
      canFewer: false,
      canMore: true,
      bidLabel: 'Bid five 6s',
    });
    expect(
      pickerFor({ count: 6, face: 6 }, fiveFives, 10, noop, en).canFewer,
    ).toBe(true);
    expect(
      pickerFor({ count: 6, face: 2 }, fiveFives, 10, noop, en).canFewer,
    ).toBe(false);
  });

  it('lifts the count when a face needs more', () => {
    let chosen = null as unknown;
    const picker = pickerFor(
      { count: 5, face: 6 },
      { count: 5, face: 5 },
      10,
      (bid) => {
        chosen = bid;
      },
      en,
    );
    picker.onFaceChange(3);
    expect(chosen).toEqual({ count: 6, face: 3 });
    picker.onFaceChange(6);
    expect(chosen).toEqual({ count: 5, face: 6 });
  });

  it('keeps the count on the table, and turns off faces bid out', () => {
    const picker = pickerFor(
      { count: 10, face: 5 },
      { count: 10, face: 4 },
      10,
      noop,
      en,
    );
    expect(picker.canMore).toBe(false);
    expect(picker.openFaces).toEqual([5, 6]);
  });

  it('opens from one die', () => {
    const picker = pickerFor({ count: 1, face: 2 }, null, 12, noop, en);
    expect(picker).toMatchObject({ canFewer: false, bidLabel: 'Bid one 2' });
    expect(picker.openFaces).toEqual([2, 3, 4, 5, 6]);
  });
});

describe('where the picker opens', () => {
  it('opens on the face you hold most of, at the smallest count it may be bid at', () => {
    // A 5 and a 3: a tie, so the higher face.
    expect(openingBid(null, 12, [5, 3])).toEqual({ count: 1, face: 5 });
    // A 2, a 2 and a 1 after four 6s: three 2s, the wild one counted.
    expect(openingBid({ count: 4, face: 6 }, 12, [2, 2, 1])).toEqual({
      count: 5,
      face: 2,
    });
    // A 2, a 1 and a 5: two of each with the wild one, so the higher face.
    expect(openingBid({ count: 4, face: 6 }, 12, [2, 1, 5])).toEqual({
      count: 5,
      face: 5,
    });
    // Two ones count for every face: the highest.
    expect(openingBid({ count: 9, face: 2 }, 25, [1, 1, 4, 6, 3])).toEqual({
      count: 9,
      face: 6,
    });
  });

  it('keeps to a legal raise', () => {
    // Every die on the table bid as 4s: only 5s and 6s are left.
    expect(openingBid({ count: 10, face: 4 }, 10, [2, 2, 2])).toEqual({
      count: 10,
      face: 6,
    });
    expect(openingBid({ count: 10, face: 6 }, 10, [2, 2])).toBeNull();
  });

  it('opens on the smallest raise without dice to go by', () => {
    expect(openingBid(null, 12, [])).toEqual({ count: 1, face: 2 });
    expect(openingBid({ count: 3, face: 4 }, 12, [])).toEqual({
      count: 3,
      face: 5,
    });
  });
});
