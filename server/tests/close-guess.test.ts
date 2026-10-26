import { describe, expect, it } from 'vitest';
import {
  isCloseGuess,
  isCorrectGuess,
} from '../socket/draw-and-guess/words.js';

/**
 * What counts as close: a wrong guess a letter or two off the word, once case,
 * the spaces around and inside it and its hyphens are set aside. One edit for
 * a word of four to seven letters, two from eight, and none under four.
 */
describe('isCloseGuess', () => {
  it('allows one edit of any kind for a word of four to seven letters', () => {
    expect(isCloseGuess('steek', 'Steak')).toBe(true); // a letter changed
    expect(isCloseGuess('stea', 'Steak')).toBe(true); // a letter dropped
    expect(isCloseGuess('steaks', 'Steak')).toBe(true); // a letter added
    expect(isCloseGuess('turtel', 'Turtle')).toBe(true); // two letters swapped
    expect(isCloseGuess('pera', 'Pear')).toBe(true); // four letters is enough
    expect(isCloseGuess('pinguin', 'Penguin')).toBe(true); // seven letters
  });

  it('refuses two edits for a word of four to seven letters', () => {
    expect(isCloseGuess('stik', 'Steak')).toBe(false);
    expect(isCloseGuess('tutrel', 'Turtle')).toBe(false);
    expect(isCloseGuess('pinguen', 'Penguin')).toBe(false);
    expect(isCloseGuess('ste', 'Steak')).toBe(false);
  });

  it('allows two edits from eight letters, and no more', () => {
    expect(isCloseGuess('elefant', 'Elephant')).toBe(true); // ph to f
    expect(isCloseGuess('kangeroo', 'Kangaroo')).toBe(true);
    expect(isCloseGuess('bsaketbal', 'Basketball')).toBe(true);
    expect(isCloseGuess('elefent', 'Elephant')).toBe(false);
    expect(isCloseGuess('kangaroo island', 'Kangaroo')).toBe(false);
  });

  it('never calls a guess at a word under four letters close', () => {
    for (const guess of ['dgo', 'do', 'dogs', 'cog', 'dog']) {
      expect(isCloseGuess(guess, 'Dog')).toBe(false);
    }
    expect(isCloseGuess('fgi', 'Fig')).toBe(false);
  });

  it('ignores case and the spaces around a guess, as matching does', () => {
    expect(isCloseGuess('  STEEK ', 'Steak')).toBe(true);
    expect(isCloseGuess('TuRtEl', 'turtle')).toBe(true);
  });

  it('ignores the spaces and hyphens inside, so a word run together is close, not correct', () => {
    expect(isCloseGuess('icecream', 'Ice Cream')).toBe(true);
    expect(isCorrectGuess('icecream', 'Ice Cream')).toBe(false);
    expect(isCloseGuess('ice-cream', 'Ice Cream')).toBe(true);
    expect(isCorrectGuess('ice-cream', 'Ice Cream')).toBe(false);
    expect(isCloseGuess('ice  creem', 'Ice Cream')).toBe(true);
    expect(isCloseGuess('guineapig', 'Guinea Pig')).toBe(true);
  });

  it('counts the length of a word without its spaces', () => {
    // "Ice Cream" is eight letters, so two edits are close...
    expect(isCloseGuess('ise creem', 'Ice Cream')).toBe(true);
    // ...and three are not.
    expect(isCloseGuess('ise kreem', 'Ice Cream')).toBe(false);
  });

  it('is not fooled by a guess with nothing in it', () => {
    expect(isCloseGuess('', 'Pear')).toBe(false);
    expect(isCloseGuess(' - ', 'Pear')).toBe(false);
  });
});

describe('isCorrectGuess', () => {
  it('ignores case and the spaces around a guess, and nothing else', () => {
    expect(isCorrectGuess(' STEAK ', 'Steak')).toBe(true);
    expect(isCorrectGuess('ice cream', 'Ice Cream')).toBe(true);
    expect(isCorrectGuess('steek', 'Steak')).toBe(false);
  });
});
