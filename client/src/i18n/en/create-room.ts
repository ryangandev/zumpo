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
  subtitle: 'Make a little space for your next game.',
  eyebrow: 'Make a room',
  title: 'A little room for you.',
  titleLines: ['A little room', 'for you.'],
  settings: (game: string) => `${game} · room settings`,
  create: 'Create room',
  cancel: 'Cancel',
  full: 'Zumpo is full right now. Join a room, or try again in a little while.',
  failed: 'We couldn’t create the room. Please try again.',
  roomName: 'Room name',
  nameHelper: (max: number) => `Up to ${max} characters.`,
  nameMissing: 'Give your room a name.',
  seats: 'Seats',
  seatsHelper: (min: number, max: number) => `Choose ${min}–${max} seats.`,
  hushSeatsHelper: (max: number, twoLevels: number, maxLevels: number) =>
    `Choose 2–${max} seats. 2 players play ${twoLevels} levels, ${max} play ${maxLevels}.`,
  players: (count: number) => plural(count, 'player'),
  rounds: 'Rounds',
  roundsHelper: '1, 2, 3 or 4 rounds.',
  roundCount: (count: number) => plural(count, 'round'),
  hands: 'Hands',
  handsHelper: '5 or 10 hands, 60 seconds each.',
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
  triosHelper: '10 or 20 trios a game.',
  trioCount: (count: number) => plural(count, 'trio'),
  words: 'Words',
  wordsHelper: '3 or 5 words, 2 minutes each.',
  wordCount: (count: number) => plural(count, 'word'),
  drawingTime: 'Drawing time',
  drawingTimeHelper:
    '45, 60 or 90 seconds a drawing. Writing and describing take 30s.',
  secondCount: (count: number) => `${count} seconds`,
  password: 'Password (optional)',
  passwordHelper: (max: number) =>
    `Leave blank for an open room. Up to ${max} characters.`,
  creating: 'Creating your room…',
};
