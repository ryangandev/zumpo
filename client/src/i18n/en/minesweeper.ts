import type { MinesweeperDifficulty } from '../../../../shared/wire-types';
import { BOARD_SIZES } from '../../../../shared/minesweeper';
import { plural } from './plural';

const SIZES: Record<MinesweeperDifficulty, string> = {
  Small: 'Small',
  Medium: 'Medium',
  Large: 'Large',
};

const signed = (points: number) =>
  points > 0 ? `+${points}` : points < 0 ? `−${-points}` : '+0';
const percent = (risk: number) => `${Math.round(risk * 100)}%`;

export const minesweeper = {
  /** "Small 9 × 9", as a room's setting reads. */
  boardName: (difficulty: MinesweeperDifficulty) => {
    const { width, height } = BOARD_SIZES[difficulty];
    return `${SIZES[difficulty]} ${width} × ${height}`;
  },
  boardSize: (difficulty: MinesweeperDifficulty) => SIZES[difficulty],
  boardLabel: (difficulty: MinesweeperDifficulty) => {
    const { width, height } = BOARD_SIZES[difficulty];
    return `${SIZES[difficulty]} · ${width} × ${height}`;
  },
  boardDetail: (difficulty: MinesweeperDifficulty) => {
    const { width, height, mines } = BOARD_SIZES[difficulty];
    return `${width} × ${height} · ${mines} mines`;
  },
  boardGrid: (width: number, height: number) => `Board, ${width} by ${height}`,
  round: (round: number) => `Round ${round}`,
  gameOver: 'Game over',
  gameEnded: 'Game ended',
  waitingRoom: 'Waiting room',
  messagePlaceholder: 'Say something…',
  resultsDetail: (difficulty: MinesweeperDifficulty, rounds: number) =>
    `${SIZES[difficulty]} board, ${plural(rounds, 'round')}.`,
  aloneTitle: 'Better with company.',
  setup: (players: number, difficulty: MinesweeperDifficulty) => {
    const { width, height, mines } = BOARD_SIZES[difficulty];
    return `${plural(players, 'player')} on a ${SIZES[difficulty]} board: ${width} × ${height} with ${mines} mines. Every round, everyone picks one cell at the same time.`;
  },
  guestSetup: (players: number, difficulty: MinesweeperDifficulty) =>
    `${plural(players, 'player')} on a ${SIZES[difficulty]} board.`,
  roundResults: (round: number) => `Round ${round} results`,
  pickDetail: (risk: number, shared: number) =>
    shared > 1
      ? `${percent(risk)} risk · split ${shared} ways`
      : `${percent(risk)} risk`,
  paused: 'paused',
  nextRound: 'next round',
  finalScores: 'final scores',
  roundOver: 'Round over',
  timeRanOut: 'Time ran out',
  autoPickDetail: (risk: number, points: number) =>
    `The safest cell was picked for you: ${percent(risk)} risk, so ${signed(points)}`,
  minePoints: (points: number) => `Mine. ${signed(points)}`,
  cellRisk: (risk: number, explain = false) =>
    explain
      ? `Your cell had a ${percent(risk)} risk. A mine costs more the safer it looked.`
      : `Your cell had a ${percent(risk)} risk`,
  safePoints: (points: number) => `Safe! ${signed(points)}`,
  splitReward: (names: string) =>
    `${names} picked the same cell, so you split its reward`,
  you: 'You',
  everyoneLocked: 'Everyone is locked in',
  revealingPicks: 'Revealing the picks…',
  lockedIn: 'Locked in',
  /**
   * The turn bar's meta during a pick, one line on a phone: the scoreboard
   * says who is still picking, and who is locked in.
   */
  waitingOthers: 'Waiting for everyone else',
  othersLockedIn: (count: number) =>
    count === 1 ? '1 player is locked in' : `${count} players are locked in`,
  toPick: 'to pick',
  pickCell: 'Pick a cell',
  everyonePicking: 'Everyone is picking',
  minesFound: (total: number, found: number) =>
    `${total} mines · ${found} hit so far`,
  /** A phone's turn bar: "10 mines", "10 mines · 2 hit". */
  minesShort: (total: number, found: number) =>
    found > 0 ? `${total} mines · ${found} hit` : `${total} mines`,
  pickLocks: (total: number) =>
    `${total} mines · your pick locks when you click`,
  away: 'Away',
  waiting: 'Waiting',
  hitMinePoints: (points: number) => `Hit a mine · ${signed(points)}`,
  autoPickedPoints: (points: number) => `Auto-picked · ${signed(points)}`,
  safeStatusPoints: (points: number) => `Safe · ${signed(points)}`,
  picking: 'Picking',
  solo: {
    description: 'Your first click is always safe. The clock starts with it.',
    pickBoard: 'Pick a board.',
    board: 'Board',
    noBest: 'No best yet',
    best: (time: string) => `Best: ${time}`,
    boardOption: (mines: number, best: string) => `${mines} mines. ${best}`,
    tryAgain: 'Try again',
    changeBoard: 'Change board',
    clearedIn: (time: string) => `Cleared in ${time}.`,
    mines: 'Mines',
    playAgain: 'Play again',
    click: 'A click',
    reveal: 'Reveal',
    flag: 'Flag',
    boardCleared: 'Board cleared',
    tryAgainTitle: 'Try again?',
    newBoard: (difficulty: MinesweeperDifficulty) =>
      `A new ${SIZES[difficulty]} board. Your first click is safe again.`,
    thisGame: 'This game',
    flags: 'Flags',
    safeCellsLeft: 'Safe cells left',
    bestOnDevice: 'Best on this device',
    notYet: 'Not yet',
    firstClear: (difficulty: MinesweeperDifficulty) =>
      `Your first ${SIZES[difficulty]} board cleared on this device.`,
    newBest: (difficulty: MinesweeperDifficulty, previous: string) =>
      `A new best on this device. Your last best on ${SIZES[difficulty]} was ${previous}.`,
    previousBest: (difficulty: MinesweeperDifficulty, previous: string) =>
      `Your best on ${SIZES[difficulty]} is ${previous}.`,
    minesLeft: (count: number) =>
      `${count < 0 ? `−${-count}` : count} ${Math.abs(count) === 1 ? 'mine' : 'mines'} left`,
    runTime: 'Time',
    hitMine: 'You hit a mine',
    allClear: 'Every safe cell is open',
    minesFlagged: (mines: number) => `All ${mines} mines are flagged for you`,
    cleared: (cleared: number, safe: number) =>
      `You cleared ${cleared} of ${plural(safe, 'safe cell')}`,
    clearBoard: 'Clear the board',
    flagMode: (phone: boolean) =>
      `Flag is on: ${phone ? 'tap' : 'click'} to flag`,
    firstClickSafe: 'Your first click is always safe',
    longPressFlag: 'Long-press or turn on Flag to flag',
    rightClickFlag: 'Right-click or long-press to flag',
  },
};
