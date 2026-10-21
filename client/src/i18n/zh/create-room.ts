import { BOARD_SIZES } from '../../../../shared/minesweeper';
import { PAIRS_BOARDS } from '../../../../shared/pairs';
import type { createRoom as en } from '../en/create-room';

export const createRoom: typeof en = {
  defaultName: (name) => `${name} 的房间`,
  subtitle: '为下一局游戏准备一个小空间。',
  eyebrow: '创建房间',
  title: '给你一个小房间。',
  titleLines: ['给你一个', '小房间。'],
  settings: (game) => `${game} · 房间设置`,
  create: '创建房间',
  cancel: '取消',
  full: 'Zumpo 现在满了。加入一个房间，或稍后再试。',
  failed: '创建房间失败，请重试。',
  roomName: '房间名称',
  nameHelper: (max) => `最多 ${max} 个字符。`,
  nameMissing: '给房间起个名字。',
  seats: '人数',
  seatsHelper: (max) => `选择 2–${max} 个座位。`,
  hushSeatsHelper: (max, twoLevels, maxLevels) =>
    `选择 2–${max} 个座位。2 人玩 ${twoLevels} 关，${max} 人玩 ${maxLevels} 关。`,
  players: (count) => `${count} 人`,
  rounds: '轮数',
  roundsHelper: '1、2、3 或 4 轮。',
  roundCount: (count) => `${count} 轮`,
  hands: '手数',
  handsHelper: '5 或 10 手，每手 60 秒。',
  handCount: (count) => `${count} 手`,
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
  triosHelper: '每局 10 或 20 组。',
  trioCount: (count) => `${count} 组`,
  words: '单词数',
  wordsHelper: '3 或 5 个单词，每个 2 分钟。',
  wordCount: (count) => `${count} 个单词`,
  codes: '局数',
  codesHelper: '1 局或 3 局，每局 3 分钟。',
  codeCount: (count) => `${count} 局`,
  password: '密码（可选）',
  passwordHelper: (max) => `留空即为公开房间。最多 ${max} 个字符。`,
  creating: '正在创建房间…',
};
