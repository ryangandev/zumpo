import type { Operator } from '../../../../shared/make-24';
import { plural } from './plural';

const OPERATOR_NAMES: Readonly<Record<Operator, string>> = {
  '+': 'plus',
  '-': 'minus',
  '*': 'times',
  '/': 'divided by',
};

export const make24 = {
  solvedChat: 'Solved! Chat opens when the hand ends.',
  hand: (hand: number, hands: number) => `Hand ${hand} of ${hands}`,
  gameOver: 'Game over',
  gameEnded: 'Game ended',
  waitingRoom: 'Waiting room',
  messagePlaceholder: 'Say something…',
  resultsDetail: (hands: number) => `${plural(hands, 'hand')}.`,
  aloneTitle: 'Better with company.',
  setup: (players: number, hands: number) =>
    `${plural(players, 'player')}, ${plural(hands, 'hand')}. Every hand, everyone gets the same four numbers at once, and quicker answers score more.`,
  guestSetup: (players: number, hands: number) =>
    `${plural(players, 'player')}, ${plural(hands, 'hand')}.`,
  donePrompt: 'Nice. The hand ends when everyone solves it or time runs out.',
  handResults: (hand: number) => `Hand ${hand} results`,
  solved: 'Solved',
  outOfTime: 'Out of time',
  handOver: 'Hand over',
  spectatorChatLocked: 'Spectators keep quiet while a hand is open',
  resultDetail: (expression: string, seconds: number) =>
    `${expression} · ${seconds} s left`,
  noAnswer: 'No answer',
  paused: 'paused',
  handResultsLabel: (hand: number, hands: number) =>
    `Hand ${hand} of ${hands} results`,
  nextHand: 'next hand',
  finalScores: 'final scores',
  pointsForYou: (points: number) => `+${points} for you`,
  solvedWithTime: (seconds: number) =>
    `Solved with ${plural(seconds, 'second')} left`,
  oneWay: (solution: string) => `One way: ${solution}`,
  nextHandSoon: 'Next hand in a moment',
  solvedPoints: (points: number) => `Solved! +${points}`,
  waitingCount: (count: number) => `Waiting for ${plural(count, 'player')}`,
  everyoneSolved: 'Everyone solved it',
  toSolve: 'to solve',
  makes: (value: string) => `That makes ${value}`,
  undoPrompt: 'Undo a step or start over',
  solvedCount: (count: number) => `${plural(count, 'player')} solved it`,
  solvedCountUndo: (count: number) =>
    `${plural(count, 'player')} solved it · undo a step`,
  useEachNumber: 'Use each number once',
  away: 'Away',
  waiting: 'Waiting',
  solvedStatusPoints: (points: number) => `Solved · +${points}`,
  solving: 'Solving',
  table: {
    operator: (operator: Operator) => OPERATOR_NAMES[operator],
    not24: 'Not 24',
    cardFrom: (value: string, formula: string) => `${value}, from ${formula}`,
    pickNumber: 'Pick a number.',
    pickSign: (value: string) => `Pick a sign for ${value}.`,
    pickSecond: (value: string, sign: string) =>
      `${value} ${sign} ?  Pick the second number.`,
    undo: 'Undo',
    startOver: 'Start over',
    signs: 'Signs',
    keys: 'Keys: 1 to 4 pick a card, + − × ÷ a sign, Backspace undoes, Esc starts over.',
  },
  solo: {
    notYet: 'Not yet',
    runComplete: 'Run complete',
    solvedOf: (solved: number, hands: number) => `${solved} of ${hands} solved`,
    runResult: (solved: number, hands: number, time: string) =>
      `Solved ${solved} of ${hands} in ${time}.`,
    skipped: 'Skipped',
    skippedPenalty: (skipped: number, time: string) => `${skipped}, +${time}`,
    fastestHand: 'Fastest hand',
    none: 'None',
    playAgain: 'Play again',
    bestOnDevice: 'Best on this device',
    challengeDescription: (time: string) =>
      `They get these same ten hands and try to beat ${time}.`,
    skippedPrompt: 'One way to make it.',
    nextHand: 'Next hand',
    nextHandPrompt: 'Next hand in a moment.',
    skip: 'Skip, +30 s',
    thisRun: 'This run',
    tenHands: 'Ten hands',
    runTime: 'Time',
    skipPenalty: '30 seconds on the clock',
    nice: '24! Nice.',
    solvedIn: (time: string) => `Solved in ${time}`,
    firstRun: 'Your first run on this device.',
    newBest: (time: string) =>
      `A new best on this device. Your last best was ${time}.`,
    previousBest: (time: string) => `Your best on this device is ${time}.`,
    today: 'Today',
    everyHand: 'Every hand',
    skippedExpression: (expression: string) => `Skipped · ${expression}`,
  },
};
