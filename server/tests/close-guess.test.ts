import { describe, expect, it } from 'vitest';
import {
  isCloseGuess,
  isCorrectGuess,
} from '../socket/draw-and-guess/words.js';

/**
 * What counts as close: a wrong guess a letter or two off the word, once case,
 * full-width forms, punctuation and spaces are set aside (one edit for a word
 * of four to seven letters, two from eight, none under four), or one that
 * holds the word's words in a row, at any length.
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
    expect(isCloseGuess('kangaru islnd', 'Kangaroo')).toBe(false);
  });

  it('never calls a misspelling of a word under four letters close', () => {
    for (const guess of ['dgo', 'do', 'dogs', 'cog', 'dogg']) {
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
    expect(isCloseGuess('?!', 'Dog')).toBe(false);
  });

  it('folds full-width letters and sets punctuation aside', () => {
    expect(isCloseGuess('turtle!!', 'Turtle')).toBe(true);
    expect(isCloseGuess('ｔｕｒｔｌｅ', 'Turtle')).toBe(true);
    expect(isCorrectGuess('ｔｕｒｔｌｅ', 'Turtle')).toBe(false);
    expect(isCloseGuess('ＴＵＲＴＥＬ', 'Turtle')).toBe(true);
    expect(isCloseGuess('"turtel"', 'Turtle')).toBe(true);
    expect(isCloseGuess('ice.cream', 'Ice Cream')).toBe(true);
    // Punctuation is no edit, but the letters around it still are.
    expect(isCloseGuess('t.u.r.t.l.e.s.s', 'Turtle')).toBe(false);
  });

  it('counts one more short word beside the word as letters off it', () => {
    expect(isCloseGuess('a turtle?', 'Turtle')).toBe(true);
    expect(isCloseGuess('aturtle', 'Turtle')).toBe(true);
    expect(isCloseGuess('a turtel?', 'Turtle')).toBe(false);
  });

  it('calls a guess holding the word whole close, at any length', () => {
    expect(isCloseGuess('i think its a turtle', 'Turtle')).toBe(true);
    expect(isCloseGuess('turtle turtle', 'Turtle')).toBe(true);
    expect(isCloseGuess('Turtle/tortoise', 'Turtle')).toBe(true);
    expect(isCloseGuess('is it an ice cream cone?', 'Ice Cream')).toBe(true);
    expect(isCloseGuess('kangaroo island', 'Kangaroo')).toBe(true);
    // A word under four letters inside a sentence must not leak either.
    expect(isCloseGuess('a dog?', 'Dog')).toBe(true);
    expect(isCloseGuess('maybe a DOG', 'Dog')).toBe(true);
    expect(isCloseGuess('dog!', 'Dog')).toBe(true);
    expect(isCloseGuess('ｄｏｇ', 'Dog')).toBe(true);
  });

  it('wants the word whole and in order, not a piece of another', () => {
    expect(isCloseGuess('a hotdog', 'Dog')).toBe(false);
    expect(isCloseGuess('dogma', 'Dog')).toBe(false);
    expect(isCloseGuess('cream and ice', 'Ice Cream')).toBe(false);
    expect(isCloseGuess('ice and cream', 'Ice Cream')).toBe(false);
  });
});

describe('isCorrectGuess', () => {
  it('ignores case and the spaces around a guess, and nothing else', () => {
    expect(isCorrectGuess(' STEAK ', 'Steak')).toBe(true);
    expect(isCorrectGuess('ice cream', 'Ice Cream')).toBe(true);
    expect(isCorrectGuess('steek', 'Steak')).toBe(false);
  });
});
