import { describe, expect, it } from 'vitest';
import { cycleNote, deleteDigit, EMPTY_DRAFT, typeDigit } from './draft';

const typed = (digits: string) => [...digits].reduce(typeDigit, EMPTY_DRAFT);

describe('typing a row', () => {
  it('takes four digits and no more', () => {
    expect(typed('40718').typed).toBe('4071');
    expect(typed('4x0').typed).toBe('40');
    expect(deleteDigit(typed('407')).typed).toBe('40');
  });

  it('never types a digit twice, and nudges the tile that has it', () => {
    const once = typed('407');
    const again = typeDigit(once, '0');
    expect(again.typed).toBe('407');
    expect(again.nudge).toEqual({ index: 1, count: 1 });
    // Each time again is a new nudge.
    expect(typeDigit(again, '0').nudge).toEqual({ index: 1, count: 2 });
    // Typing on clears it.
    expect(typeDigit(again, '1')).toMatchObject({ typed: '4071', nudge: null });
  });

  it('clears a turned-back row’s problem once the row changes', () => {
    const turnedBack = { ...typed('40'), problem: 'tooShort' as const };
    expect(typeDigit(turnedBack, '7').problem).toBeNull();
    expect(deleteDigit(turnedBack).problem).toBeNull();
  });
});

describe('notes on the pad', () => {
  it('cycle plain, out, in and plain again', () => {
    const out = cycleNote({}, '5');
    expect(out).toEqual({ 5: 'out' });
    const inCode = cycleNote(out, '5');
    expect(inCode).toEqual({ 5: 'in' });
    expect(cycleNote(inCode, '5')).toEqual({});
    expect(cycleNote({ 1: 'in' }, '2')).toEqual({ 1: 'in', 2: 'out' });
  });
});
