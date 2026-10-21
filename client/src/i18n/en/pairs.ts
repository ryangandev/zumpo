import type { PairsBoard } from '../../../../shared/wire-types';
import { PAIRS_BOARDS } from '../../../../shared/pairs';
import { plural } from './plural';

const SIZES: Record<PairsBoard, string> = { Small: 'Small', Large: 'Large' };

export const pairs = {
  /** "Large 6 × 6", as a room's setting reads. */
  boardName: (board: PairsBoard) => {
    const { side } = PAIRS_BOARDS[board];
    return `${SIZES[board]} ${side} × ${side}`;
  },
  boardSize: (board: PairsBoard) => SIZES[board],
  boardLabel: (board: PairsBoard) => {
    const { side } = PAIRS_BOARDS[board];
    return `${SIZES[board]} · ${side} × ${side}`;
  },
  boardDetail: (board: PairsBoard) => {
    const { side, pairs: total } = PAIRS_BOARDS[board];
    return `${side} × ${side} · ${total} pairs`;
  },
  progress: (found: number, total: number) =>
    `${found} of ${plural(total, 'pair')}`,
  gameOver: 'Game over',
  gameEnded: 'Game ended',
  waitingRoom: 'Waiting room',
  messagePlaceholder: 'Say something…',
  resultsDetail: (board: PairsBoard, total: number) =>
    `${SIZES[board]} board, ${plural(total, 'pair')}.`,
  aloneTitle: 'A little better with company.',
  setup: (players: number, board: string) =>
    `${plural(players, 'player')}, ${board}. Take turns flipping two cards; find a pair and you go again.`,
  guestSetup: (players: number, board: string) =>
    `${plural(players, 'player')}, ${board}.`,
  paused: 'paused',
  yourTurn: 'Your turn',
  playerTurn: (name: string | null) => `${name}’s turn`,
  youreNext: 'You’re next.',
  nextPlayer: (name: string) => `${name} is next.`,
  notPair: 'Not a pair',
  bothFlipBack: (next: string) => `Both flip back. ${next}`.trim(),
  flipBack: 'flip back',
  flipSecond: 'Flip a second card',
  flipCard: 'Flip a card',
  pairKeepsTurn: 'A pair keeps your turn',
  goAgain: 'Find a pair and you go again',
  toFlip: 'to flip',
  watchClosely: 'Watch closely',
  yourTurnPassed: 'Time’s up, your turn passed',
  ranOut: (name: string) => `${name} ran out of time`,
  ranOutYourTurn: (name: string) => `${name} ran out of time · your turn`,
  away: 'Away',
  waiting: 'Waiting',
  flipping: 'Flipping',
  upNext: 'Up next',
  cards: 'Cards',
  solo: {
    turnsCount: (turns: number) => plural(turns, 'turn'),
    description: (challenge: boolean): string =>
      challenge
        ? 'A friend sent you this deck. Fewer turns is better. Your time is kept too.'
        : 'Fewer turns is better. Your time is kept too.',
    onYourOwn: 'On your own',
    pickBoard: 'Pick a board.',
    start: 'Start',
    backToGames: 'Back to games',
    board: 'Board',
    boardOption: (total: number, best: string) => `${total} pairs. ${best}`,
    noBest: 'No best yet',
    best: (turns: string) => `Best: ${turns}`,
    notYet: 'Not yet',
    boardCleared: 'Board cleared',
    finishedIn: (total: number, turns: number) =>
      `${total} pairs in ${plural(turns, 'turn')}.`,
    time: 'Time',
    turns: 'Turns',
    longestStreak: 'Longest streak',
    streak: (total: number) => `${plural(total, 'pair')} in a row`,
    playAgain: 'Play again',
    changeBoard: 'Change board',
    bestOnDevice: 'Best on this device',
    challengeDescription: (turns: number) =>
      `They get this same deck and try to beat ${plural(turns, 'turn')}.`,
    thisGame: 'This game',
    pairs: 'Pairs',
    pairProgress: (found: number, total: number) => `${found} of ${total}`,
    firstClear: (board: PairsBoard) =>
      `Your first ${SIZES[board]} board cleared on this device.`,
    turnsInTime: (turns: string, time: string) => `${turns} in ${time}`,
    newBest: (best: string) =>
      `A new best on this device. Your last best was ${best}.`,
    previousBest: (board: PairsBoard, best: string) =>
      `Your best on ${SIZES[board]} is ${best}.`,
    turn: (turn: number) => `Turn ${turn}`,
    runTime: 'run time',
    findPair: 'Find its pair',
    whereSeen: 'Where did you see it?',
    flipBackSoon: 'They flip back in a moment',
    aPair: 'A pair!',
    flipAnother: 'Flip another card',
    clockStarts: 'The clock starts with your first card',
    thenFindPair: 'Then find its pair',
  },
};
