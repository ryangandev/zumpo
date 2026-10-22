import type { MinesweeperDifficulty } from '../../../../shared/wire-types';
import { BOARD_SIZES } from '../../../../shared/minesweeper';
import type { minesweeper as en } from '../en/minesweeper';

const SIZES: Record<MinesweeperDifficulty, string> = {
  Small: '小',
  Medium: '中',
  Large: '大',
};

const signed = (points: number) =>
  points > 0 ? `+${points}` : points < 0 ? `−${-points}` : '+0';
const percent = (risk: number) => `${Math.round(risk * 100)}%`;

export const minesweeper: typeof en = {
  boardName: (difficulty) => {
    const { width, height } = BOARD_SIZES[difficulty];
    return `${SIZES[difficulty]} ${width} × ${height}`;
  },
  boardSize: (difficulty) => SIZES[difficulty],
  boardLabel: (difficulty) => {
    const { width, height } = BOARD_SIZES[difficulty];
    return `${SIZES[difficulty]} · ${width} × ${height}`;
  },
  boardDetail: (difficulty) => {
    const { width, height, mines } = BOARD_SIZES[difficulty];
    return `${width} × ${height} · ${mines} 颗雷`;
  },
  boardGrid: (width, height) => `棋盘，${width} 列，${height} 行`,
  round: (round) => `第 ${round} 轮`,
  gameOver: '游戏结束',
  gameEnded: '游戏已中止',
  waitingRoom: '等待室',
  messagePlaceholder: '说点什么…',
  resultsDetail: (difficulty, rounds) =>
    `${SIZES[difficulty]}棋盘，${rounds} 轮。`,
  resultBarDetail: (rounds) => `${rounds} 轮。`,
  aloneTitle: '叫上好友更好玩。',
  setup: (players, difficulty) => {
    const { width, height, mines } = BOARD_SIZES[difficulty];
    return `${players} 人，${SIZES[difficulty]}棋盘：${width} × ${height}，${mines} 颗雷。每轮所有人同时选一个格子。`;
  },
  guestSetup: (players, difficulty) =>
    `${players} 人，${SIZES[difficulty]}棋盘。`,
  roundResults: (round) => `第 ${round} 轮结果`,
  pickDetail: (risk, shared) =>
    shared > 1
      ? `${percent(risk)} 踩雷概率 · ${shared} 人平分`
      : `${percent(risk)} 踩雷概率`,
  paused: '已暂停',
  nextRound: '下一轮',
  finalScores: '最终得分',
  roundOver: '本轮结束',
  timeRanOut: '时间到了',
  autoPickDetail: (risk, points) =>
    `已为你选择最安全的格子：踩雷概率 ${percent(risk)}，得分 ${signed(points)}`,
  minePoints: (points) => `踩雷了。${signed(points)}`,
  cellRisk: (risk, explain = false) =>
    explain
      ? `你选的格子踩雷概率为 ${percent(risk)}。看起来越安全，踩雷时扣分越多。`
      : `你选的格子踩雷概率为 ${percent(risk)}`,
  safePoints: (points) => `安全！${signed(points)}`,
  splitCount: (count) => `另有 ${count} 人选了同一个格子，平分奖励`,
  you: '你',
  everyoneLocked: '所有人都已选好',
  revealingPicks: '正在揭晓结果…',
  lockedIn: '已选好',
  waitingOthers: '等其他人',
  othersLockedIn: (count) => `已有 ${count} 人选好`,
  toPick: '选择时间',
  pickCell: '选一个格子',
  everyonePicking: '大家正在选格子',
  minesFound: (total, found) => `${total} 颗雷 · 已踩中 ${found} 颗`,
  minesShort: (total, found) =>
    found > 0 ? `${total} 颗雷 · 踩中 ${found}` : `${total} 颗雷`,
  pickLocks: (total) => `${total} 颗雷 · 点击即确定选择`,
  away: '暂离',
  waiting: '等待中',
  hitMinePoints: (points) => `踩雷了 · ${signed(points)}`,
  autoPickedPoints: (points) => `自动选择 · ${signed(points)}`,
  safeStatusPoints: (points) => `安全 · ${signed(points)}`,
  picking: '正在选择',
  solo: {
    description: '第一次点击一定安全，计时也从这时开始。',
    pickBoard: '选一个棋盘。',
    board: '棋盘',
    noBest: '暂无最佳成绩',
    best: (time) => `最佳：${time}`,
    boardOption: (mines, best) => `${mines} 颗雷。${best}`,
    tryAgain: '再试一次',
    changeBoard: '换个棋盘',
    clearedIn: (time) => `用时 ${time}，扫雷完成。`,
    mines: '雷数',
    playAgain: '再玩一局',
    click: '点击操作',
    reveal: '翻开',
    flag: '插旗',
    boardCleared: '扫雷完成',
    tryAgainTitle: '再试一次？',
    newBoard: (difficulty) =>
      `新的${SIZES[difficulty]}棋盘，第一次点击仍然安全。`,
    thisGame: '本局',
    flags: '旗数',
    safeCellsLeft: '剩余安全格',
    bestOnDevice: '本机最佳成绩',
    notYet: '暂无',
    firstClear: (difficulty) => `你在本机首次完成${SIZES[difficulty]}棋盘。`,
    newBest: (difficulty, previous) =>
      `刷新本机纪录！${SIZES[difficulty]}棋盘的上次最佳用时是 ${previous}。`,
    previousBest: (difficulty, previous) =>
      `${SIZES[difficulty]}棋盘的最佳用时是 ${previous}。`,
    minesLeft: (count) => `剩余 ${count < 0 ? `−${-count}` : count} 颗雷`,
    runTime: '用时',
    hitMine: '你踩到雷了',
    allClear: '安全格全部翻开',
    minesFlagged: (mines) => `${mines} 颗雷都替你插上了旗`,
    cleared: (cleared, safe) => `${safe} 个安全格里你翻开了 ${cleared} 个`,
    clearBoard: '扫清棋盘',
    flagMode: (phone) =>
      phone ? '插旗已开启：轻点插旗' : '插旗已开启：点击插旗',
    firstClickSafe: '第一次点击一定安全',
    longPressFlag: '长按，或开启“插旗”后轻点',
    rightClickFlag: '右键或长按插旗',
  },
};
