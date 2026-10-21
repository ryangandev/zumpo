import type { WordCategory } from '../../../../shared/wire-types';
import { plural } from './plural';

export const drawAndGuess = {
  category: (category: WordCategory | ''): string => category,
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
  resultsDetail: (rounds: number, category: WordCategory, turns: number) =>
    `${plural(rounds, 'round')} of ${category}, ${plural(turns, 'turn')}.`,
  aloneTitle: 'A little better with two.',
  setup: (players: number, rounds: number) =>
    `${plural(players, 'player')}, ${plural(rounds, 'round')}. The word category is drawn at random when the game starts.`,
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
