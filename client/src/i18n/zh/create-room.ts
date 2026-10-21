import { BOARD_SIZES } from '../../../../shared/minesweeper';
import { PAIRS_BOARDS } from '../../../../shared/pairs';
import type { createRoom as en } from '../en/create-room';

export const createRoom: typeof en = {
  defaultName: (name) => `${name} 的房间`,
  title: (game) => `新建${game}房间`,
  moreOptions: '更多选项',
  create: '创建房间',
  cancel: '取消',
  full: 'Zumpo 现在满了。加入一个房间，或稍后再试。',
  failed: '创建房间失败，请重试。',
  roomName: '房间名称',
  nameMissing: '给房间起个名字。',
  seats: '人数',
  hushSeatsHelper: (max, twoLevels, maxLevels) =>
    `2 人玩 ${twoLevels} 关，${max} 人玩 ${maxLevels} 关。`,
  players: (count) => `${count} 人`,
  rounds: '轮数',
  roundCount: (count) => `${count} 轮`,
  hands: '题数',
  handsHelper: '每题 60 秒。',
  handCount: (count) => `${count} 题`,
  diceEach: '每人骰子数',
  diceCount: (count) => `${count} 颗骰子`,
  diceDetail: (count) =>
    count === 3 ? '快速局，也是常用玩法。' : '经典局：时间更长，适合 2–4 人。',
  board: '棋盘',
  boardName: (board) => ({ Small: '小', Medium: '中', Large: '大' })[board],
  minesweeperDetail: (board) => {
    const { width, height, mines } = BOARD_SIZES[board];
    return `${width} × ${height} · ${mines} 颗雷`;
  },
  pairsDetail: (board) => {
    const { side, pairs } = PAIRS_BOARDS[board];
    return `${side} × ${side} · ${pairs} 对`;
  },
  trios: '组数',
  trioCount: (count) => `${count} 组`,
  words: '单词数',
  wordsHelper: '每个单词 2 分钟。',
  wordCount: (count) => `${count} 个单词`,
  codes: '题数',
  codesHelper: '每题 3 分钟。',
  codeCount: (count) => `${count} 题`,
  drawingTime: '画画时间',
  drawingTimeHelper: '写 30 秒，描述 45 秒。',
  secondCount: (count) => `${count} 秒`,
  password: '密码（可选）',
  creating: '正在创建房间…',
};
