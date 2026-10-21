import type { trios as en } from '../en/trios';
import type { CardFeatures, Feature } from '../../../../shared/trios';

const colours = { coral: '珊瑚色', blue: '蓝色', ink: '黑色' };
const shapes = { circle: '圆形', triangle: '三角形', square: '方形' };
const fills = { solid: '实心', striped: '条纹', outline: '空心' };
const value = (feature: Feature, f: CardFeatures) => {
  switch (feature) {
    case 'colour':
      return colours[f.colour];
    case 'shape':
      return shapes[f.shape];
    case 'fill':
      return fills[f.fill];
    case 'count':
      return String(f.count);
  }
};

export const trios: typeof en = {
  reason: (feature, pair, odd) =>
    feature === 'count'
      ? `其中 2 张有 ${pair.count} 个图形，另 1 张有 ${odd.count} 个。`
      : `其中 2 张是${value(feature, pair)}，另 1 张是${value(feature, odd)}。`,
  table: '牌桌',
  lastTrio: (finder) => `上一组：${finder}`,
  progress: (found, total) => `${found} / ${total} 组`,
  gameOver: '游戏结束',
  gameEnded: '游戏已中止',
  waitingRoom: '等待室',
  chat: '聊点什么…',
  you: '你',
  by: (name) => (name === trios.you ? '你找到的' : `${name} 找到的`),
  resultDetail: (count) => `${count} 组。`,
  alone: '叫上好友更好玩。',
  setup: (players, count) =>
    `${players} 人，${count} 组。大家看着同样的 12 张牌，最先选中一组的人拿走它。`,
  guestSetup: (players, count) => `${players} 人，${count} 组。`,
  hint: '提示',
  hintBadge: '提示',
  paused: '已暂停',
  taken: '一组已被拿走',
  youFound: '你找到了一组！',
  foundBy: (name) => `${name} 找到了一组`,
  newCardsSoon: '马上补入新牌',
  newCards: '补入新牌',
  notTrio: '不成一组',
  pickAgainSoon: '稍后可以再次选牌',
  lockedOut: '暂时不能选牌',
  findTrio: '找出一组',
  pickThird: '再选第 3 张牌',
  pickTwo: '再选 2 张牌',
  oneMarked: '一组中的 1 张牌已标记',
  twoMarked: '一组中的 2 张牌已标记',
  pickThree: '选 3 张牌',
  everyoneLooking: '大家正在找一组',
  findTwo: '找到与它成组的另 2 张牌',
  findThird: '找到第 3 张牌',
  firstTakes: '最先选中一组的人拿走它',
  toHint: '距离提示',
  toSecondHint: '距离第 2 次提示',
  withoutTrio: '未找到一组的时间',
  away: '暂离',
  waiting: '等待中',
  foundTrio: '找到了一组',
  looking: '寻找中',
  solo: {
    rule: '一组牌的颜色、形状、数量和填充方式，都必须在 3 张牌上完全相同或完全不同。选错一次加 5 秒。',
    whatMakesTrio: '怎样算一组',
    example: '这是一组：颜色相同；形状、数量和填充都不同。',
    notYet: '暂无',
    complete: '本轮完成',
    allFound: (count) => `${count} 组全部找到`,
    leaveWarning: '这一轮到此结束，用时不会保存。',
    resultTitle: (count, time) => `${count} 组，用时 ${time}。`,
    wrongPicks: '选错次数',
    hints: '提示次数',
    fastest: '最快一组',
    none: '无',
    best: '本机最佳成绩',
    challenge: (time) => `好友会拿到同一副牌，试着打破 ${time} 的成绩。`,
    progress: (count, total) => `第 ${count} / ${total} 组`,
    hintButton: '提示，+10 秒',
    thisRun: '本轮',
    tenTrios: '10 组',
    runTime: '用时',
    trio: '成组了！',
    foundIn: (time) => `用时 ${time}`,
    wrong: '不成一组，+5 秒',
    features: '每个特征都要完全相同或完全不同',
    firstRun: '这是你在本机的第一轮。',
    newBest: (time) => `刷新本机纪录！上次最佳成绩是 ${time}。`,
    previousBest: (time) => `你的本机最佳成绩是 ${time}。`,
    note: (wrong, hints) =>
      [wrong ? `选错 ${wrong} 次` : '', hints ? `提示 ${hints} 次` : '']
        .filter(Boolean)
        .join('，'),
    everyTrio: '每一组',
    cost: (count, time) => (count ? `${count} 次，+${time}` : '0'),
  },
};
