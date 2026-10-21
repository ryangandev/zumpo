import type { GuessProblem } from '../../../../shared/code-breaker';
import { countWord, plural } from './plural';

const problems: Readonly<Record<GuessProblem, string>> = {
  tooShort: 'Four digits, please',
  // The pad never types a digit twice; only a modified page could send one.
  repeatedDigit: 'Four different digits, please',
  alreadyGuessed: 'Already guessed',
};

export const codeBreaker = {
  problem: (problem: GuessProblem) => problems[problem],
  guessFailed: 'That guess did not reach the room. Try again.',
  crackedChat: 'You cracked it. Chat opens after the reveal.',
  chatPlaceholder: 'Say something…',
  codeOf: (round: number, rounds: number) => `Code ${round} of ${rounds}`,
  gameOver: 'Game over',
  gameEnded: 'Game ended',
  waitingRoom: 'Waiting room',
  codesDetail: (codes: number) => `${plural(codes, 'code')}.`,
  codesCracked: (codes: number) => `${plural(codes, 'code')} cracked`,
  alone: 'Better with company.',
  setup: (players: number, codes: number) =>
    `${plural(players, 'player')}, ${plural(codes, 'code')}. Everyone cracks the same hidden code at once, and fewer guesses score more.`,
  guestSetup: (players: number, codes: number) =>
    `${plural(players, 'player')}, ${plural(codes, 'code')}.`,
  crackedWatch: 'You cracked it. Watch the others until the reveal.',
  outWatch: 'Out of guesses. The code shows at the reveal.',
  others: 'The others',
  everyone: 'Everyone',
  everyoneGuessing: 'Everyone is cracking the code',
  nobodyCracked: 'Nobody cracked it',
  pegsOnly: 'Their pegs, never their digits',
  crackedPoints: (points: number) => `Cracked · +${points}`,
  outOfGuesses: 'Out of guesses',
  noGuesses: 'No guesses yet',
  guessesCount: (count: number) => plural(count, 'guess', 'guesses'),
  codeResults: (round: number) => `Code ${round} results`,
  codeWas: (code: string) => `The code was ${code}.`,
  crackedInPoints: (guesses: number, points: number) =>
    `Cracked in ${guesses} · +${points}`,
  missed: 'Missed',
  paused: 'paused',
  codeWasLabel: 'The code was',
  youCracked: (guesses: number, points: number) =>
    `You cracked it in ${guesses} for +${points}`,
  youMissed: 'You did not crack it this time',
  nextCode: 'next code',
  finalScores: 'final scores',
  gotIt: (guesses: number, points: number) =>
    `Cracked it in ${guesses}! +${points}`,
  waitingFor: (names: string) => `Waiting for ${names}`,
  everyoneDone: 'Everyone is done',
  toGuess: 'to guess',
  crackCode: 'Crack the code',
  namesCracked: (names: string) => `${names} cracked it`,
  fewerScore: 'Fewer guesses score more',
  away: 'Away',
  waiting: 'Waiting',
  crackedItPoints: (points: number) => `Cracked it · +${points}`,
  guessing: 'Guessing',
  yourGuesses: 'Your guesses',
  /** "4 1 7 0: 2 in place, 2 elsewhere". */
  row: (guess: string, mark: string) => `${[...guess].join(' ')}: ${mark}`,
  legend: {
    right: 'Right digit, right place',
    moved: 'Right digit, somewhere else',
    none: 'Not in the code',
    count: 'The pegs count digits. They never say which ones.',
  },
  /** A phone's legend, in the turn bar: it has no column beside the board. */
  legendLine: 'Green: in place. Coral: somewhere else.',
  freshPrompt: 'Type four different digits, then press Enter.',
  nextPrompt: 'Enter checks the guess. Backspace takes a digit back.',
  notesPrompt: 'Notes on: a digit key marks it out, then in, then clears it.',
  codeNumber: (puzzle: number) => `Code #${puzzle}`,
  dailyNumber: (puzzle: number) => `Daily code #${puzzle}`,
  dailyFresh: 'Ten guesses. A new code every day.',
  readIt: 'How to read it',
  shareDaily: (puzzle: number) => `Code Breaker #${puzzle}`,
  crackedIn: (guesses: number) => `Cracked in ${guesses}.`,
  notThisTime: 'Not this time.',
  dailyCracked: (code: string, streak: string) =>
    `The code was ${code}. ${streak}`,
  dailyMissed: 'A new streak starts tomorrow.',
  guesses: 'Guesses',
  guessesOf: (count: number, max: number) => `${count} of ${max}`,
  nextCodeIn: 'Next code in',
  share: 'Share',
  practiceCode: 'Practice code',
  guessesToCrack: 'Guesses to crack it',
  streak: (days: number) =>
    days > 1 ? `That makes ${days} days in a row.` : 'That starts a streak.',
  /** The turn bar over a finished board. */
  newCodeAtMidnight: 'A new code at midnight.',
  youCrackedCode: (code: string) => `You cracked ${code}`,
  challenge: 'Challenge',
  practice: 'Practice',
  friendCode: 'A friend’s code',
  challengeFresh: 'A friend sent you this code. Ten guesses.',
  practiceFresh: 'Ten guesses. Practice keeps no stats.',
  sharePractice: 'Code Breaker practice',
  practiceResult: (code: string) =>
    `The code was ${code}. Practice codes keep no stats.`,
  practiceMissed: 'Practice codes keep no stats.',
  anotherCode: 'Another code',
  challengeFriend: 'Challenge a friend',
  todayCode: 'Today’s code',
  friendFewer: (guesses: number) =>
    `They get this same code and try to crack it in fewer than ${guesses} guesses. They see your pegs, not your digits.`,
  friendSame: 'They get this same code. They see your pegs, not your digits.',
  yourPegs: 'Your pegs',
  onDevice: 'On this device',
  stats: {
    played: 'Played',
    cracked: 'Cracked',
    currentStreak: 'Current streak',
    bestStreak: 'Best streak',
  },
  copied: 'Copied',
  guessNumber: (guess: number, max: number) => `Guess ${guess} of ${max}`,
  fixRow: 'Fix the row and try again',
  /** "Three guesses in. 5, 6, 8 and 9 are out." */
  known: (guesses: number, parts: readonly string[]) =>
    `${countWord(guesses)} ${guesses === 1 ? 'guess' : 'guesses'} in. ${
      parts.length ? parts.join(' ') : 'No digit is certain yet.'
    }`,
  digitsIn: (digits: string, count: number) =>
    `${digits} ${count > 1 ? 'are' : 'is'} in the code.`,
  digitsOut: (digits: string, count: number) =>
    `${digits} ${count > 1 ? 'are' : 'is'} out.`,
  distribution: (count: number, guesses: string) =>
    `${count} cracked in ${guesses}`,
};
