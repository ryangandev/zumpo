import { describe, expect, it } from 'vitest';
import { chooseBanks } from './sound-lab';

const KNOWN = ['ui', 'room', 'hush'] as const;

describe('chooseBanks', () => {
  it('keeps every bank without ?bank=, and only those named with it', () => {
    expect(chooseBanks('', KNOWN)).toEqual({
      groups: ['ui', 'room', 'hush'],
      problem: null,
    });
    expect(chooseBanks('?bank=hush, ui', KNOWN)).toEqual({
      groups: ['ui', 'hush'],
      problem: null,
    });
  });

  it('says so when ?bank= is empty, rather than load nothing quietly', () => {
    expect(chooseBanks('?bank=', KNOWN)).toEqual({
      groups: [],
      problem: '?bank= names no bank; the banks are ui, room, hush.',
    });
  });

  it('names a bank that does not exist, and keeps the rest', () => {
    expect(chooseBanks('?bank=hush,arcade', KNOWN)).toEqual({
      groups: ['hush'],
      problem: 'No bank is called arcade; the banks are ui, room, hush.',
    });
  });
});
