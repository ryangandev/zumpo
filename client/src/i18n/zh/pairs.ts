import type { PairsBoard } from '../../../../shared/wire-types';
import { PAIRS_BOARDS } from '../../../../shared/pairs';
import type { pairs as en } from '../en/pairs';

const SIZES: Record<PairsBoard, string> = { Small: '小', Large: '大' };

export const pairs: typeof en = {
  boardName: (board) => {
    const { side } = PAIRS_BOARDS[board];
    return `${SIZES[board]} ${side} × ${side}`;
  },
  boardSize: (board) => SIZES[board],
  boardLabel: (board) => {
    const { side } = PAIRS_BOARDS[board];
    return `${SIZES[board]} · ${side} × ${side}`;
  },
  boardDetail: (board) => {
    const { side, pairs: total } = PAIRS_BOARDS[board];
    return `${side} × ${side} · ${total} 对`;
  },
  progress: (found, total) => `已找到 ${found} 对，共 ${total} 对`,
  gameOver: '游戏结束',
  gameEnded: '游戏已中止',
  waitingRoom: '等待室',
  messagePlaceholder: '说点什么…',
  resultsDetail: (board, total) => `${SIZES[board]}棋盘，${total} 对。`,
  aloneTitle: '叫上好友更好玩。',
  setup: (players, board) =>
    `${players} 人，${board}。轮流翻两张牌，找到一对就继续翻。`,
  guestSetup: (players, board) => `${players} 人，${board}。`,
  paused: '已暂停',
  yourTurn: '轮到你了',
  playerTurn: (name) => `轮到 ${name} 了`,
  youreNext: '接下来轮到你。',
  nextPlayer: (name) => `接下来轮到 ${name}。`,
  notPair: '没有配成对',
  bothFlipBack: (next) => `两张牌会翻回去。${next}`,
  flipBack: '翻回去',
  flipSecond: '翻第二张牌',
  flipCard: '翻一张牌',
  pairKeepsTurn: '配成一对就继续翻',
  goAgain: '找到一对就继续翻',
  toFlip: '翻牌时间',
  watchClosely: '仔细看',
  yourTurnPassed: '时间到，你的回合过了',
  ranOut: (name) => `${name} 超时了`,
  ranOutYourTurn: (name) => `${name} 超时了 · 轮到你`,
  away: '暂离',
  waiting: '等待中',
  flipping: '正在翻牌',
  upNext: '下一个',
  cards: '卡牌',
  solo: {
    turnsCount: (turns) => `${turns} 次翻牌`,
    description: '翻牌次数越少越好，也会记录用时。',
    pickBoard: '选一个棋盘。',
    board: '棋盘',
    boardOption: (total, best) => `${total} 对。${best}`,
    noBest: '暂无最佳成绩',
    best: (turns) => `最佳：${turns}`,
    notYet: '暂无',
    boardCleared: '配对完成',
    finishedIn: (total, turns) => `${turns} 次翻牌，找到 ${total} 对。`,
    time: '用时',
    longestStreak: '最长连对',
    streak: (total) => `连续 ${total} 对`,
    playAgain: '再玩一局',
    changeBoard: '换个棋盘',
    bestOnDevice: '本机最佳成绩',
    challengeDescription: (turns) =>
      `好友拿到相同的牌，挑战你的 ${turns} 次翻牌成绩。`,
    thisGame: '本局',
    pairs: '配对数',
    pairProgress: (found, total) => `${found} / ${total}`,
    firstClear: (board) => `你在本机首次完成${SIZES[board]}棋盘。`,
    turnsInTime: (turns, time) => `${turns}，用时 ${time}`,
    newBest: (best) => `刷新本机纪录！上次最佳成绩是 ${best}。`,
    previousBest: (board, best) => `${SIZES[board]}棋盘的最佳成绩是 ${best}。`,
    turn: (turn) => `第 ${turn} 次翻牌`,
    runTime: '用时',
    findPair: '找到它的另一张',
    whereSeen: '你在哪里见过它？',
    flipBackSoon: '稍后会翻回去',
    aPair: '配成一对！',
    allPairs: (total) => `${total} 对全部找到`,
    flipAnother: '再翻一张牌',
    clockStarts: '翻第一张牌时开始计时',
    thenFindPair: '再找到它的另一张',
  },
};
