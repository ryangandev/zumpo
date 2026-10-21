import type { GomokuColor, GomokuEnding } from '../../../../shared/wire-types';
import { plural } from './plural';

/** A computer's level on your own (client/src/gomoku/solo/computer.ts). */
type Level = 'easy' | 'medium' | 'hard';

const COLOR: Record<GomokuColor, string> = { black: 'Black', white: 'White' };

/** How a game in a room ended, for the loser in the third person. */
const HOW: Record<Exclude<GomokuEnding, 'five' | 'draw'>, string> = {
  resigned: 'resigned',
  timeout: 'ran out of time twice',
  left: 'left the room',
};

export const gomoku = {
  color: (color: GomokuColor) => COLOR[color],
  /** A seat's line under the name: "Black · your turn", or just "White". */
  seat: (color: GomokuColor, note?: string) =>
    note ? `${COLOR[color]} · ${note}` : COLOR[color],
  notes: {
    yourTurn: 'your turn',
    thinking: 'thinking',
    missed: 'missed a turn',
    five: 'five in a row',
    won: 'won',
    draw: 'draw',
    away: 'away',
  },
  /** The board's accessible name. */
  board: 'Gomoku board',
  chat: 'Say something…',

  // A room's phase tags.
  game: (number: number) => `Game ${number}`,
  gameOver: 'Game over',
  waitingRoom: 'Waiting room',

  // The turn bar.
  yourTurn: 'Your turn',
  turn: (name: string) => `${name}’s turn`,
  place: (color: GomokuColor) => `Place a ${COLOR[color].toLowerCase()} stone`,
  isThinking: (name: string) => `${name} is thinking`,
  played: (name: string, point: string) => `${name} played ${point}`,
  youPlayed: (point: string) => `You played ${point}`,
  passed: (name: string) => `${name}’s turn passed`,
  yourTurnPassed: 'Your turn passed',
  firstMove: 'Black moves first, anywhere on the board',
  toMove: 'to move',
  paused: 'paused',

  // Under the board.
  placeStone: 'Place stone',
  hoverHint: 'Hover a point to see your stone there; click to place it.',
  tapHint:
    'Tap the faint stone again, or Place stone. Tap another point to move it.',
  colorsNote:
    'Black moves first. After this game the colours swap, so each of you opens every other game.',
  missedNotice:
    'You ran out of time, so your turn passed. Run out again on your next turn and you lose this game.',
  here: 'Here',
  hostHere: 'Host · here',
  away: 'Away',
  freeSeat: 'Free seat',
  anybodyCanSit: 'Anybody watching can sit here',

  // Resigning.
  resign: 'Resign',
  resignTitle: 'Resign this game?',
  resignBody: (winner: string, game: number) =>
    `${winner} wins game ${game} and takes the point. You keep your seat for the next game.`,
  keepPlaying: 'Keep playing',

  // The scoreboard.
  waiting: 'Waiting',
  wonGame: (game: number) => `Won game ${game}`,

  // Before a game.
  alone: 'Waiting for a second player.',
  setup: 'Two players, a 15 × 15 board, 30 seconds a move.',

  // A game's result in a room.
  youWin: (ending: GomokuEnding, loser: string) =>
    ending === 'five'
      ? 'You win with five in a row.'
      : `You win: ${loser} ${HOW[ending as keyof typeof HOW]}.`,
  youLose: (ending: GomokuEnding, winner: string) =>
    ending === 'five'
      ? `${winner} wins with five in a row.`
      : ending === 'resigned'
        ? 'You resigned.'
        : ending === 'timeout'
          ? 'You ran out of time twice.'
          : `${winner} wins.`,
  theyWin: (ending: GomokuEnding, winner: string, loser: string) =>
    ending === 'five'
      ? `${winner} wins with five in a row.`
      : `${winner} wins: ${loser} ${HOW[ending as keyof typeof HOW]}.`,
  draw: 'A draw: the board is full.',
  moves: (count: number) => `A game of ${plural(count, 'move')}.`,
  drawDetail: (stones: number) => `${stones} stones and nobody made five.`,
  nextBlack: (name: string) => `Next game, ${name} plays Black.`,
  seatFree: (name: string) => `${name}’s seat is free for anybody to take.`,
  fiveFrom: (from: string, to: string) => `Five in a row, ${from} to ${to}`,
  drawStatus: 'Draw',
  /** Two sentences of a result, one after the other. */
  both: (first: string, second: string) => `${first} ${second}`,
  startGame: (game: number) => `Start game ${game}`,

  solo: {
    computer: 'Computer',
    levels: {
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
    } satisfies Record<Level, string>,
    levelHelp: {
      easy: 'Good for your first games: it misses most of your plans.',
      medium: 'Stops simple threats, so a win takes a plan.',
      hard: 'Plans several moves ahead, and never misses a win.',
    } satisfies Record<Level, string>,
    pickTitle: 'Pick a game.',
    description: 'Play the computer at three levels, as Black or White.',
    record: (level: string, wins: number, games: number, run: number) =>
      `At ${level} you have won ${wins} of ${plural(games, 'game')}.${
        run > 1 ? ` You are on a run of ${run} wins.` : ''
      }`,
    level: 'Level',
    stones: 'Your stones',
    stonesHelp: 'Play again swaps them, so the first move takes turns.',
    stonesOf: {
      black: 'Black, you move first',
      white: 'White, the computer moves first',
    } satisfies Record<GomokuColor, string>,
    start: 'Start',
    move: (number: number) => `Move ${number}`,
    youWon: 'You won',
    computerWon: 'Computer won',
    drawTag: 'Draw',
    computersTurn: 'Computer’s turn',
    computerThinking: 'The computer is thinking',
    computerPlayed: (point: string) => `The computer played ${point}`,
    thinking: 'thinking',
    wonOn: (move: number) => `You won on move ${move}.`,
    lostOn: (move: number) => `The computer won on move ${move}.`,
    draw: 'A draw: the board is full.',
    five: (from: string, to: string, next: GomokuColor) =>
      `Five in a row, from ${from} to ${to}. Play again and you take ${COLOR[next]}.`,
    drawBody: (next: GomokuColor) =>
      `Nobody made five. Play again and you take ${COLOR[next]}.`,
    changeLevel: 'Change level',
    thisGame: 'This game',
    youPlay: 'You play',
    stonesOnBoard: 'Stones on the board',
    movesLabel: 'Moves',
    onDevice: 'On this device',
    gamesWonAt: (level: string) => `Games won at ${level}`,
    gamesWonCount: (wins: number, games: number) => `${wins} of ${games}`,
    currentRun: 'Current run',
    wins: (count: number) => plural(count, 'win'),
    notYet: 'Not yet',
  },
};
