import type { WordCategory } from '../../../../shared/wire-types.js';
import { WORD_CATEGORIES } from '../../../../shared/draw-and-guess.js';
import { plural } from './plural.js';

const CATEGORIES: Record<WordCategory, string> = {
  Animals: 'Animals',
  Clothing: 'Clothing',
  Electronics: 'Electronics',
  Fantasy: 'Fantasy',
  Food: 'Food',
  Fruits: 'Fruits',
  Household: 'Household',
  Jobs: 'Jobs',
  'League of Legends': 'League of Legends',
  Music: 'Music',
  Nature: 'Nature',
  Places: 'Places',
  'Sea Life': 'Sea Life',
  Sports: 'Sports',
  Vehicles: 'Vehicles',
};

const category = (value: WordCategory | ''): string =>
  value === '' ? '' : CATEGORIES[value];

/** Every category in the bank: the 15 of "All 15". */
const ALL = WORD_CATEGORIES.length;

/** How a room's categories read: all, one by name, or how many. */
const picked = (
  categories: readonly WordCategory[],
  words: { all: string; one: (name: string) => string; some: string },
) =>
  categories.length >= ALL
    ? words.all
    : categories.length === 1
      ? words.one(category(categories[0]!))
      : words.some;

export const drawAndGuess = {
  category,
  round: (round: number, rounds: number) => `Round ${round} of ${rounds}`,
  gameOver: 'Game over',
  gameEnded: 'Game ended',
  waitingRoom: 'Waiting room',
  guessPlaceholder: 'Type your guess…',
  messagePlaceholder: 'Say something…',
  /** A spectator while the word is drawn: the players cannot read it. */
  spectatorPlaceholder: 'Only spectators see this…',
  guess: 'Guess',
  message: 'Message',
  drawer: 'The drawer',
  drawerAway: (name: string, seconds: number) =>
    `${name} lost connection. Their turn is skipped if they are not back within ${plural(seconds, 'second')}.`,
  resultsDetail: (rounds: number, played: WordCategory, turns: number) =>
    `${plural(rounds, 'round')} of ${category(played)}, ${plural(turns, 'turn')}.`,
  aloneTitle: 'Better with two.',
  setup: (
    players: number,
    rounds: number,
    categories: readonly WordCategory[],
  ) =>
    `${plural(players, 'player')}, ${plural(rounds, 'round')}. ${picked(
      categories,
      {
        all: `The word category is drawn at random from all ${ALL} when the game starts.`,
        one: (name) => `The word category is ${name}.`,
        some: `The word category is drawn at random from ${categories.length} categories when the game starts.`,
      },
    )}`,
  /** Between games, for anybody but the starter: "2 rounds, all 15 categories". */
  nextSetting: (rounds: number, categories: readonly WordCategory[]) =>
    picked(categories, {
      all: `${plural(rounds, 'round')}, all ${ALL} categories`,
      one: (name) => `${plural(rounds, 'round')} of ${name}`,
      some: `${plural(rounds, 'round')}, ${categories.length} categories`,
    }),
  categories: {
    label: 'Word categories',
    /** The field's value: "All 15", "5 of 15", or the one picked. */
    value: (categories: readonly WordCategory[]) =>
      picked(categories, {
        all: `All ${ALL}`,
        one: (name) => name,
        some: `${categories.length} of ${ALL}`,
      }),
    title: 'Word categories',
    description: 'Each game draws one of the picked categories at random.',
    count: (count: number) =>
      count >= ALL ? `All ${ALL} picked` : `${count} of ${ALL} picked`,
    chooseAll: 'Choose all',
    keepOne: 'At least one stays picked.',
    save: 'Save',
    cancel: 'Cancel',
  },
  guestSetup: (players: number, rounds: number) =>
    `${plural(players, 'player')}, ${plural(rounds, 'round')}.`,
  away: 'Away',
  waiting: 'Waiting',
  choosing: 'Choosing a word',
  drawing: 'Drawing',
  guessed: 'Guessed it',
  guessing: 'Guessing',
  drewPoints: (points: number) => `Drew it · +${points}`,
  guessedPoints: (points: number) => `Guessed it · +${points}`,
  missed: 'Missed it',
  drawingAppears: (name: string) => `${name}’s drawing will appear here.`,
  paused: 'paused',
  yourTurn: 'Your turn to draw',
  pickWord: 'Pick a word',
  privateChoices: 'Only you can see these',
  toChoose: 'to choose',
  nextUp: 'Next up',
  choosingWord: (name: string) => `${name} is choosing a word`,
  readyToGuess: 'Get ready to guess',
  autoPicked: 'Time ran out, so this one was picked for you',
  drawThis: 'Draw this',
  privateWord: 'Only you can see the word',
  left: 'left',
  youGotIt: (points: number) => `You got it! +${points}`,
  waitingOthers: 'Waiting for the others',
  guessWord: 'Guess the word',
  letters: (count: number, phone: boolean) =>
    phone
      ? plural(count, 'letter')
      : `${plural(count, 'letter')} · type your guess in the chat`,
  wordWas: 'The word was',
  roundResults: (round: number) => `Round ${round} results`,
  inAll: (points: number) => `${points} in all`,
  nextTurn: 'next turn',
  nobodyGuessed: 'Nobody got it this time',
  playerPoints: (name: string, points: number) => `${name} +${points}`,
  drawingChatLocked: 'You’re drawing. Chat opens after your turn.',
  guessedChatLocked: 'You got it. Chat opens next turn.',
};
