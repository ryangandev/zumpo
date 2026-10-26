import type { WordCategory } from '../../../../shared/wire-types';
import { WORD_CATEGORIES } from '../../../../shared/draw-and-guess';
import type { drawAndGuess as en } from '../en/draw-and-guess';

/** League of Legends is a name, so it stays as the game calls itself. */
const CATEGORIES: Record<WordCategory, string> = {
  Animals: '动物',
  Clothing: '服饰',
  Electronics: '电子产品',
  Fantasy: '奇幻',
  Food: '食物',
  Fruits: '水果',
  Household: '家居用品',
  Jobs: '职业',
  'League of Legends': 'League of Legends',
  Music: '音乐',
  Nature: '自然',
  Places: '地点',
  'Sea Life': '海洋生物',
  Sports: '运动',
  Vehicles: '交通工具',
};

const category = (value: WordCategory | ''): string =>
  value === '' ? '' : CATEGORIES[value];

const ALL = WORD_CATEGORIES.length;

const picked = (
  categories: readonly WordCategory[],
  words: { all: string; one: (name: string) => string; some: string },
) =>
  categories.length >= ALL
    ? words.all
    : categories.length === 1
      ? words.one(category(categories[0]!))
      : words.some;

export const drawAndGuess: typeof en = {
  category,
  round: (round, rounds) => `第 ${round} 轮，共 ${rounds} 轮`,
  gameOver: '游戏结束',
  gameEnded: '游戏已中止',
  waitingRoom: '等待室',
  guessPlaceholder: '输入你的答案…',
  messagePlaceholder: '说点什么…',
  spectatorPlaceholder: '只有观战的人能看到…',
  guess: '猜词',
  message: '消息',
  drawer: '画画的人',
  drawerAway: (name, seconds) =>
    `${name} 断开了连接。如果 ${seconds} 秒内没有回来，将跳过这一回合。`,
  resultsDetail: (rounds, played, turns) =>
    `${rounds} 轮，类别：${category(played)}，共 ${turns} 个回合。`,
  aloneTitle: '两个人更好玩。',
  setup: (players, rounds, categories) =>
    `${players} 人，${rounds} 轮。词语都是英文单词，${picked(categories, {
      all: `游戏开始时会从全部 ${ALL} 个类别中随机选择词语类别。`,
      one: (name) => `词语类别是“${name}”。`,
      some: `游戏开始时会从选中的 ${categories.length} 个类别中随机选择词语类别。`,
    })}`,
  nextSetting: (rounds, categories) =>
    picked(categories, {
      all: `${rounds} 轮，全部 ${ALL} 个类别`,
      one: (name) => `${rounds} 轮，${name}`,
      some: `${rounds} 轮，${categories.length} 个类别`,
    }),
  categories: {
    label: '词语类别',
    value: (categories) =>
      picked(categories, {
        all: `全部 ${ALL} 个`,
        one: (name) => name,
        some: `已选 ${categories.length} 个`,
      }),
    title: '词语类别',
    description: '每局游戏从选中的类别里随机抽一个。',
    count: (count) =>
      count >= ALL ? `已全选 ${ALL} 个` : `已选 ${count} 个，共 ${ALL} 个`,
    chooseAll: '全选',
    keepOne: '至少保留一个类别。',
    save: '保存',
    cancel: '取消',
  },
  away: '暂离',
  waiting: '等待中',
  choosing: '正在选词',
  drawing: '正在画画',
  guessed: '猜中了',
  guessing: '正在猜词',
  drewPoints: (points) => `画完了 · +${points}`,
  guessedPoints: (points) => `猜中了 · +${points}`,
  missed: '没猜中',
  drawingAppears: (name) => `${name} 的画会出现在这里。`,
  paused: '已暂停',
  yourTurn: '轮到你画了',
  pickWord: '选一个词',
  privateChoices: '只有你能看到这些词',
  toChoose: '选词时间',
  nextUp: '接下来',
  choosingWord: (name) => `${name} 正在选词`,
  readyToGuess: '准备猜词',
  autoPicked: '时间到了，已为你选好这个词',
  drawThis: '画这个词',
  privateWord: '只有你能看到这个词',
  left: '剩余时间',
  youGotIt: (points) => `猜中了！+${points}`,
  waitingOthers: '等待其他玩家',
  guessWord: '猜猜这个词',
  letters: (count, phone) =>
    phone ? `${count} 个字母` : `${count} 个字母 · 在聊天框输入答案`,
  wordWas: '答案是',
  roundResults: (round) => `第 ${round} 轮结果`,
  inAll: (points) => `总分 ${points}`,
  nextTurn: '下一回合',
  nobodyGuessed: '这次没有人猜中',
  playerPoints: (name, points) => `${name} +${points}`,
  drawingChatLocked: '你正在画画，回合结束后才能聊天。',
  guessedChatLocked: '你猜中了，下一回合才能聊天。',
};
