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

/**
 * How the winner won when the other did not lose at five in a row, short, so
 * a desktop result fits beside what comes next with the longest names.
 */
const WON_BY: Record<Exclude<GomokuEnding, 'five' | 'draw'>, string> = {
  resigned: 'by resignation',
  timeout: 'on time',
  left: 'by forfeit',
};

export const gomoku = {
  color: (color: GomokuColor) => COLOR[color],
  /** A seat's line under the name: "Black · your turn", or just "White". */
  seat: (color: GomokuColor, note?: string) =>
    note ? `${COLOR[color]} · ${note}` : COLOR[color],
  /**
   * A phone's one-line seat says only the note, "Your turn", after the name:
   * the stone before the name shows the colour.
   */
  phoneSeat: (note: string) => note.charAt(0).toUpperCase() + note.slice(1),
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
  firstMove: 'Black moves first, anywhere',
  /** A faint stone is down on a phone: the second tap places it. */
  tapAgain: 'Tap again to place',
  toMove: 'to move',
  paused: 'paused',
  /**
   * A phone's turn bar, one line each for what to do and the meta, at 360 px
   * with the longest names: the seats under the board name the players, so
   * the bar names nobody, and says their colours.
   */
  phone: {
    /** What to do while the other player moves. */
    theirTurn: 'Their turn',
    /** What to do for a spectator. */
    watching: 'Watching',
    thinking: (color: GomokuColor) => `${COLOR[color]} is thinking`,
    lastMove: (point: string) => `Last move ${point}`,
    passed: (color: GomokuColor) => `${COLOR[color]}’s turn passed`,
    youWin: (ending: GomokuEnding, loser: GomokuColor) =>
      ending === 'five'
        ? 'You win with five in a row.'
        : `You win: ${COLOR[loser]} ${HOW[ending as keyof typeof HOW]}.`,
    wins: (ending: GomokuEnding, winner: GomokuColor, loser: GomokuColor) =>
      ending === 'five'
        ? `${COLOR[winner]} wins with five in a row.`
        : `${COLOR[winner]} wins: ${COLOR[loser]} ${HOW[ending as keyof typeof HOW]}.`,
    /** The other player has said Ready; the next game is the viewer's to start. */
    theyReady: (color?: GomokuColor) =>
      color ? `They’re ready · you play ${COLOR[color]}` : 'They’re ready',
    /** The viewer has said Ready, and the other player has not. */
    waiting: (color?: GomokuColor) =>
      color
        ? `Waiting for them · you play ${COLOR[color]}`
        : 'Waiting for them',
    youStart: 'You can start the next game',
    waitNext: 'Waiting for the next game',
    seatFree: (color: GomokuColor) => `${COLOR[color]}’s seat is free`,
    swap: 'Next game, the colours swap.',
  },

  // Under the board.
  placeStone: 'Place stone',
  hoverHint: 'Hover a point to see your stone there; click to place it.',
  colorsNote:
    'Black moves first. After this game the colours swap, so each of you opens every other game.',
  missedNotice:
    'You ran out of time, so your turn passed. Run out again on your next turn and you lose this game.',
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
  youWin: (ending: GomokuEnding) =>
    ending === 'five'
      ? 'You win with five in a row.'
      : `You win ${WON_BY[ending as keyof typeof WON_BY]}.`,
  youLose: (ending: GomokuEnding, winner: string) =>
    ending === 'five'
      ? `${winner} wins with five in a row.`
      : ending === 'resigned'
        ? 'You resigned.'
        : ending === 'timeout'
          ? 'You ran out of time twice.'
          : `${winner} wins.`,
  theyWin: (ending: GomokuEnding, winner: string) =>
    ending === 'five'
      ? `${winner} wins with five in a row.`
      : `${winner} wins ${WON_BY[ending as keyof typeof WON_BY]}.`,
  draw: 'A draw: the board is full.',
  moves: (count: number) =>
    count === 0 ? 'No moves were played.' : `${plural(count, 'move')}.`,
  drawDetail: (stones: number) => `${stones} stones, no five.`,
  nextBlack: (name: string) => `${name} plays Black next.`,
  /** A phone's results turn bar: the viewer's colour next. */
  nextYou: (color: GomokuColor) => `You play ${COLOR[color]} next.`,
  /** The same, with Ready. */
  nextAsk: (color: GomokuColor) => `You play ${COLOR[color]} next. Ready?`,
  /** A phone's results turn bar: who the next game waits on, and the colour. */
  nextWait: (note: string, color: GomokuColor) =>
    `${note} · you play ${COLOR[color]}`,
  seatFree: (name: string) => `${name}’s seat is free.`,
  /** Two sentences of a result, one after the other. */
  both: (first: string, second: string) => `${first} ${second}`,

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
      hard: 'Plans several moves ahead, and plays a forced win when it sees one.',
    } satisfies Record<Level, string>,
    pickTitle: 'Pick a game.',
    description: 'Play the computer at three levels, as Black or White.',
    record: (level: string, wins: number, games: number, run: number) =>
      `At ${level} you have won ${wins} of ${plural(games, 'game')}.${
        run > 1 ? ` You are on a run of ${run} wins.` : ''
      }`,
    level: 'Level',
    stones: 'Your stones',
    stonesOf: {
      black: 'Black, you move first',
      white: 'White, the computer moves first',
    } satisfies Record<GomokuColor, string>,
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
    nextGame: (next: GomokuColor) => `Play again and you take ${COLOR[next]}.`,
    youMadeFive: 'You made five in a row',
    computerMadeFive: 'The computer made five in a row',
    noFive: 'Nobody made five',
    fromTo: (from: string, to: string) => `From ${from} to ${to}`,
    changeLevel: 'Change level',
    takeBack: 'Take back',
    onDevice: 'On this device',
    gamesWonAt: (level: string) => `Games won at ${level}`,
    gamesWonCount: (wins: number, games: number) => `${wins} of ${games}`,
    currentRun: 'Current run',
    wins: (count: number) => plural(count, 'win'),
    notYet: 'Not yet',
  },
};
