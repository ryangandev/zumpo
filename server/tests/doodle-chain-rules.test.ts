import { describe, expect, it } from 'vitest';
import {
  canFollow,
  chainAt,
  cleanText,
  kindOf,
  MAX_PLAYERS,
  MIN_PLAYERS,
  placeAt,
  stepsFor,
  TEXT_MAX,
} from '../../shared/doodle-chain.js';

const range = (count: number) => Array.from({ length: count }, (_, i) => i);

describe('Doodle Chain rules', () => {
  it('plays one step per player, but never more than six', () => {
    expect([3, 4, 5, 6, 7, 8].map(stepsFor)).toEqual([3, 4, 5, 6, 6, 6]);
  });

  it('asks for a prompt, then drawings and descriptions in turn', () => {
    expect(range(6).map((index) => kindOf(index + 1))).toEqual([
      'prompt',
      'drawing',
      'description',
      'drawing',
      'description',
      'drawing',
    ]);
  });

  it('starts every player on their own chain, then hands chains on round the order', () => {
    expect(range(4).map((place) => chainAt(place, 1, 4))).toEqual([0, 1, 2, 3]);
    // At step 2 you get the chain of the player before you; the first player
    // gets the last player's.
    expect(range(4).map((place) => chainAt(place, 2, 4))).toEqual([3, 0, 1, 2]);
  });

  it('never puts a player on a chain twice, and every chain is worked on each step', () => {
    for (let players = MIN_PLAYERS; players <= MAX_PLAYERS; players += 1) {
      const steps = stepsFor(players);
      for (let place = 0; place < players; place += 1) {
        const chains = range(steps).map((index) =>
          chainAt(place, index + 1, players),
        );
        expect(new Set(chains).size).toBe(steps);
      }
      for (let step = 1; step <= steps; step += 1) {
        const chains = range(players).map((place) =>
          chainAt(place, step, players),
        );
        expect(new Set(chains).size).toBe(players);
        chains.forEach((chain, place) =>
          expect(placeAt(chain, step, players)).toBe(place),
        );
      }
    }
  });

  it('draws words and describes drawings, and nothing else', () => {
    expect(canFollow('prompt', 'drawing')).toBe(true);
    expect(canFollow('description', 'drawing')).toBe(true);
    expect(canFollow('drawing', 'description')).toBe(true);
    expect(canFollow('drawing', 'drawing')).toBe(false);
    expect(canFollow('prompt', 'description')).toBe(false);
    expect(canFollow('description', 'description')).toBe(false);
  });

  it('trims a line and keeps at most 80 characters of it', () => {
    expect(cleanText('  a cat on a bike  ')).toBe('a cat on a bike');
    expect(cleanText('   ')).toBe('');
    expect(cleanText('x'.repeat(100))).toHaveLength(TEXT_MAX);
    // A character is a character, however many code units it takes.
    expect(Array.from(cleanText('🐢'.repeat(100)))).toHaveLength(TEXT_MAX);
  });
});
