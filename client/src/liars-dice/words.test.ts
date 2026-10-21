import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { zh } from '../i18n/zh';
import type { LiarsDiceReveal } from '../../../shared/wire-types';
import { countDetail, naming, revealBar, verdict } from './words';

const NAMES: Record<string, string> = { leo: 'Leo', sam: 'Sam', maya: 'Maya' };
const asSam = naming('sam', (id) => NAMES[id]!, en);
const asMaya = naming('maya', (id) => NAMES[id]!, en);
const asLeo = naming('leo', (id) => NAMES[id]!, en);

// LD10: Sam called Liar on Leo's five 5s; there were five, two of them wild.
const ld10: LiarsDiceReveal = {
  bid: { playerId: 'leo', count: 5, face: 5 },
  callerId: 'sam',
  matched: 5,
  wild: 2,
  loserId: 'sam',
  out: false,
};

describe('the words of a reveal', () => {
  it('explains the count, the bid and your loss in Chinese', () => {
    const asSamZh = naming('sam', (id) => NAMES[id]!, zh);
    expect(countDetail(ld10, zh)).toBe('含 2 颗百搭 · 叫了 5 个');
    expect(revealBar(ld10, asSamZh, zh)).toEqual({
      label: '你喊了“吹牛”',
      main: 'Leo 的叫点成立',
      meta: '你丢一颗骰子',
    });
    expect(
      verdict({ ...ld10, matched: 0, loserId: 'sam', out: true }, asSamZh, zh),
    ).toBe('Leo 的叫点不成立，你出局了');
  });

  it('counts at a glance', () => {
    expect(countDetail(ld10, en)).toBe('incl. 2 wild ones · bid was five');
    expect(countDetail({ ...ld10, wild: 1 }, en)).toBe(
      'incl. 1 wild one · bid was five',
    );
    expect(countDetail({ ...ld10, wild: 0 }, en)).toBe(
      'no wild ones · bid was five',
    );
  });

  it('says who was right, to you and to everybody else', () => {
    expect(verdict(ld10, asMaya, en)).toBe(
      'Leo’s bid stands, so Sam loses a die',
    );
    expect(verdict(ld10, asLeo, en)).toBe(
      'Your bid stands, so Sam loses a die',
    );
    expect(revealBar(ld10, asSam, en)).toEqual({
      label: 'You called Liar',
      main: 'Leo’s bid stands',
      meta: 'You lose a die',
    });
    expect(revealBar(ld10, asMaya, en)).toEqual({
      label: 'Sam called Liar',
      main: 'Leo’s bid stands',
      meta: 'Sam loses a die',
    });
  });

  it('calls a lie a lie', () => {
    // LD12: Maya called Sam's two 6s; there was one, and Sam was out.
    const ld12: LiarsDiceReveal = {
      bid: { playerId: 'sam', count: 2, face: 6 },
      callerId: 'maya',
      matched: 1,
      wild: 0,
      loserId: 'sam',
      out: true,
    };
    expect(verdict(ld12, asMaya, en)).toBe(
      'Sam’s bid was a lie, so Sam is out',
    );
    expect(verdict(ld12, asSam, en)).toBe('Your bid was a lie, so you are out');
    expect(revealBar(ld12, asSam, en)).toMatchObject({
      main: 'Your bid was a lie',
      meta: 'You are out',
    });
  });
});
