import type { GuessProblem } from '../../../../shared/daily-word';
import { plural } from './plural';

const problems: Readonly<Record<GuessProblem, string>> = {
  tooShort: 'Not enough letters',
  notAWord: 'Not in the word list',
  alreadyGuessed: 'Already guessed',
};

export const dailyWord = {
  problem: (problem: GuessProblem) => problems[problem],
  guessFailed: 'That guess did not reach the room. Try again.',
  foundChat: 'You got it. Chat opens after the reveal.',
  chatPlaceholder: 'Say something…',
  wordOf: (round: number, rounds: number) => `Word ${round} of ${rounds}`,
  gameOver: 'Game over',
  gameEnded: 'Game ended',
  waitingRoom: 'Waiting room',
  wordsDetail: (words: number) => `${plural(words, 'word')}.`,
  wordsFound: (words: number) => `${plural(words, 'word')} found`,
  alone: 'Better with company.',
  setup: (players: number, words: number) =>
    `${plural(players, 'player')}, ${plural(words, 'word')}. Everyone guesses the same hidden word at once, and fewer guesses score more.`,
  guestSetup: (players: number, words: number) =>
    `${plural(players, 'player')}, ${plural(words, 'word')}.`,
  foundWatch: 'You found it. Watch the others until the reveal.',
  outWatch: 'Out of guesses. Watch the others until the reveal.',
  others: 'The others',
  everyone: 'Everyone',
  everyoneGuessing: 'Everyone is finding the word',
  nobodyFound: 'Nobody found it',
  marksOnly: 'Their marks, never their letters',
  foundPoints: (points: number) => `Found · +${points}`,
  outOfGuesses: 'Out of guesses',
  noGuesses: 'No guesses yet',
  guessesCount: (count: number) => plural(count, 'guess', 'guesses'),
  wordResults: (round: number) => `Word ${round} results`,
  wordWas: (word: string) => `The word was ${word}.`,
  foundInPoints: (guesses: number, points: number) =>
    `Found in ${guesses} · +${points}`,
  missed: 'Missed',
  paused: 'paused',
  wordWasLabel: 'The word was',
  youFound: (guesses: number, points: number) =>
    `You found it in ${guesses} for +${points}`,
  youMissed: 'You did not find it this time',
  nextWord: 'next word',
  finalScores: 'final scores',
  gotIt: (guesses: number, points: number) =>
    `Got it in ${guesses}! +${points}`,
  waitingCount: (count: number) => `Waiting for ${plural(count, 'player')}`,
  everyoneDone: 'Everyone is done',
  toGuess: 'to guess',
  findWord: 'Find the word',
  foundCount: (count: number) => `${plural(count, 'player')} found it`,
  fewerScore: 'Fewer guesses score more',
  away: 'Away',
  waiting: 'Waiting',
  foundItPoints: (points: number) => `Found it · +${points}`,
  guessing: 'Guessing',
  yourGuesses: 'Your guesses',
  rowLetter: (letter: string, mark: string) => `${letter} ${mark}`,
  row: (word: string, letters: readonly string[]) =>
    `${word}: ${letters.join(', ')}.`,
  legend: {
    correct: 'Right letter, right place',
    present: 'In the word, somewhere else',
    absent: 'Not in the word',
  },
  /** A phone's legend, in the turn bar: it has no column beside the board. */
  legendLine: 'Green: right place. Coral: somewhere else.',
  freshPrompt: 'Type a five-letter word, then press Enter.',
  nextPrompt: 'Enter checks the word. Backspace takes a letter back.',
  wordNumber: (puzzle: number) => `Word #${puzzle}`,
  today: 'Today’s word',
  dailyFresh: 'Six guesses. A new word every day.',
  readIt: 'How to read it',
  shareDaily: (puzzle: number) => `Daily Word #${puzzle}`,
  foundIn: (guesses: number) => `Found in ${guesses}.`,
  notThisTime: 'Not this time.',
  dailyFound: (word: string, streak: string) =>
    `The word was ${word}. ${streak}`,
  dailyMissed: 'A new streak starts tomorrow.',
  guesses: 'Guesses',
  guessesOf: (count: number, max: number) => `${count} of ${max}`,
  nextWordIn: 'Next word in',
  share: 'Share',
  practiceWord: 'Practice word',
  guessesToFind: 'Guesses to find it',
  streak: (days: number) =>
    days > 1 ? `That makes ${days} days in a row.` : 'That starts a streak.',
  challenge: 'Challenge',
  practice: 'Practice',
  friendWord: 'A friend’s word',
  challengeFresh: 'A friend sent you this word. Six guesses.',
  practiceFresh: 'Six guesses. Practice keeps no stats.',
  sharePractice: 'Daily Word practice',
  practiceResult: (word: string) =>
    `The word was ${word}. Practice words keep no stats.`,
  practiceMissed: 'Practice words keep no stats.',
  anotherWord: 'Another word',
  challengeFriend: 'Challenge a friend',
  todayWord: 'Today’s word',
  youFoundWord: (word: string) => `You found ${word}`,
  newWordAtMidnight: 'A new word at midnight.',
  friendFewer: (guesses: number) =>
    `They get this same word and try to find it in fewer than ${guesses} guesses. They see your marks, not your letters.`,
  friendSame: 'They get this same word. They see your marks, not your letters.',
  yourMarks: 'Your marks',
  onDevice: 'On this device',
  stats: {
    played: 'Played',
    found: 'Found',
    currentStreak: 'Current streak',
    bestStreak: 'Best streak',
  },
  copied: 'Copied',
  guessNumber: (guess: number, max: number) => `Guess ${guess} of ${max}`,
  fixRow: 'Fix the row and try again',
  lettersPlaced: (letters: string, count: number) =>
    `${letters} ${count > 1 ? 'are' : 'is'} in place`,
  lettersElsewhere: (letters: string, count: number) =>
    `${letters} ${count > 1 ? 'are' : 'is'} somewhere else`,
  known: (parts: readonly string[]) =>
    parts.length ? parts.join(', ') : 'None of those letters are in it',
  distribution: (count: number, guesses: number) =>
    `${count} found in ${guesses}`,
};
