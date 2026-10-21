import { BOARD_SIZES } from '../../../../shared/minesweeper';
import { PAIRS_BOARDS } from '../../../../shared/pairs';
import type {
  MinesweeperDifficulty,
  PairsBoard,
} from '../../../../shared/wire-types';
import type { DicePerPlayer } from '../../../../shared/liars-dice';
import { plural } from './plural';

export const createRoom = {
  defaultName: (name: string) => `${name}’s room`,
  /** The create-room page's title, and its card's on a wide screen. */
  title: (game: string) => `New ${game} room`,
  /** Opens the room's name, seats and password. */
  moreOptions: 'More options',
  create: 'Create room',
  cancel: 'Cancel',
  full: 'Zumpo is full right now. Join a room, or try again soon.',
  failed: 'We couldn’t create the room. Please try again.',
  roomName: 'Room name',
  nameMissing: 'Give your room a name.',
  seats: 'Seats',
  hushSeatsHelper: (max: number, twoLevels: number, maxLevels: number) =>
    `2 players play ${twoLevels} levels, ${max} play ${maxLevels}.`,
  players: (count: number) => plural(count, 'player'),
  rounds: 'Rounds',
  roundCount: (count: number) => plural(count, 'round'),
  hands: 'Hands',
  handsHelper: '60 seconds a hand.',
  handCount: (count: number) => plural(count, 'hand'),
  diceEach: 'Dice each',
  diceCount: (count: number) => `${count} dice`,
  diceDetail: (count: DicePerPlayer): string =>
    count === 3
      ? 'The quick game, and the usual one.'
      : 'The classic: longer, best with 2–4 players.',
  board: 'Board',
  boardName: (board: MinesweeperDifficulty | PairsBoard): string => board,
  minesweeperDetail: (board: MinesweeperDifficulty) => {
    const { width, height, mines } = BOARD_SIZES[board];
    return `${width} × ${height} · ${mines} mines`;
  },
  pairsDetail: (board: PairsBoard) => {
    const { side, pairs } = PAIRS_BOARDS[board];
    return `${side} × ${side} · ${pairs} pairs`;
  },
  trios: 'Trios',
  trioCount: (count: number) => plural(count, 'trio'),
  words: 'Words',
  wordsHelper: '2 minutes a word.',
  wordCount: (count: number) => plural(count, 'word'),
  codes: 'Codes',
  codesHelper: '3 minutes a code.',
  codeCount: (count: number) => plural(count, 'code'),
  drawingTime: 'Drawing time',
  drawingTimeHelper: 'Writing takes 30s, describing 45s.',
  secondCount: (count: number) => `${count} seconds`,
  password: 'Password (optional)',
  creating: 'Creating your room…',
};
