import type { notices as en } from '../en/notices';
import type { WordCategory } from '../../../../shared/wire-types';

const who = (name: string): string => name || '某位玩家';

const list = (names: readonly string[]): string =>
  names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join('、')} 和 ${names.at(-1)}`;
const category = (value: WordCategory): string =>
  ({
    Fruits: '水果',
    Animals: '动物',
    'League of Legends': 'League of Legends',
    Electronics: '电子产品',
    Sports: '运动',
    Food: '食物',
  })[value];

export const notices: typeof en = {
  'room:created': (n) => `${who(n.name)} 创建了房间。`,
  'room:joined': (n) => `${who(n.name)} 加入了房间。`,
  'room:watching': (n) =>
    n.owner
      ? `${who(n.name)} 加入了观战席，${who(n.owner)} 成为新房主。`
      : `${who(n.name)} 加入了观战席。`,
  'room:seated': (n) => `${who(n.name)} 加入了玩家席。`,
  'room:renamed': (n) => `${who(n.before)} 改名为 ${who(n.name)}。`,
  'room:owner-left': (n) =>
    `${who(n.name)} 离开了房间，${who(n.owner)} 成为新房主。`,
  'room:left': (n) => `${who(n.name)} 离开了房间。`,
  'room:disconnected': (n) => `${who(n.name)} 的连接中断了。`,
  'room:reconnected': (n) => `${who(n.name)} 已重新连接。`,
  'game:ended': (_n) => '游戏结束！',
  'game:interrupted': (_n) => '剩余玩家不足，游戏已结束。',
  'game:over': (n) => {
    const unit = {
      point: '分',
      pair: '对',
      trio: '组',
      card: '张牌',
      die: '颗骰子',
    }[n.unit];
    const result =
      n.unit === 'die' ? `还剩 ${n.points} ${unit}` : `${n.points} ${unit}`;
    return `游戏结束：${list(n.names)} ${n.names.length === 1 ? '获胜' : '并列获胜'}，${result}！`;
  },
  'dg:started': (n) => `游戏开始！本局词语类别是“${category(n.category)}”！`,
  'dg:drawer-left': (_n) => '画画的玩家离开了房间，进入下一回合。',
  'dg:drawer-lost': (_n) => '画画的玩家连接中断，进入下一回合。',
  'dg:drawer-timeout': (_n) => '画画的玩家未能回来，进入下一回合。',
  'dg:drawer-returned': (_n) => '画画的玩家回来了，继续吧！',
  'dg:all-guessed': (_n) => '大家都猜中了！',
  'dg:guessed': (n) => `${who(n.name)} 猜中了！(+${n.points})`,
  'ms:started': (n) =>
    `游戏开始！${n.width} × ${n.height} 的棋盘上有 ${n.mines} 颗雷。`,
  'ms:mine': (n) =>
    `${who(n.name)} 踩到了雷（风险 ${Math.round(n.risk * 100)}%）：−${Math.abs(n.points)}`,
  'make24:started': (n) => `游戏开始！共 ${n.hands} 手，每手 ${n.seconds} 秒。`,
  'make24:solved': (n) => `${who(n.name)} 算出来了！(+${n.points})`,
  'pairs:started': (n) =>
    `游戏开始！共 ${n.pairs} 对，每回合 ${n.seconds} 秒。`,
  'pairs:found': (n) => `${who(n.name)} 找到了一对！(+1)`,
  'trios:started': (n) => `游戏开始！共 ${n.trios} 组等你找。`,
  'trios:found': (n) => `${who(n.name)} 找到了一组！(+1)`,
  'snap:started': (n) => `游戏开始！共 ${n.cards} 张牌等你抢。`,
  'snap:took': (n) => `${who(n.name)} 抢到了一张牌！(+1)`,
  'ld:started': (n) =>
    `游戏开始！每人 ${n.dice} 颗骰子，每回合 ${n.seconds} 秒。`,
  'ld:auto-bid': (n) =>
    `${who(n.name)} 超时，自动叫 ${n.bid.count} 个 ${n.bid.face}。`,
  'ld:auto-call': (n) => `${who(n.name)} 超时，自动喊了“吹牛”。`,
  'ld:called': (n) =>
    `${who(n.name)} 对 ${n.bid.count} 个 ${n.bid.face} 喊了“吹牛”：实际有 ${n.matched} 个。${who(n.loser)} 丢一颗骰子。`,
  'ld:out': (n) => `${who(n.name)} 出局了。`,
  'ld:reroll': (_n) => '有玩家离开，大家重新掷骰。',
  'hush:started': (n) =>
    `游戏开始！共 ${n.levels} 关、${n.lives} 条命。闯关时保持安静。`,
  'hush:mistake': (n) =>
    `${who(n.name)} 出了 ${n.card}，但 ${list(n.held.map((h) => `${who(h.name)} 还拿着 ${list(h.cards.map(String))}`))}。`,
  'hush:cleared': (n) =>
    n.lifeBack
      ? `第 ${n.level} 关完美通过，赢回一条命！`
      : n.clean
        ? `第 ${n.level} 关完美通过！`
        : `第 ${n.level} 关通过！`,
  'hush:won': (n) => `全部 ${n.levels} 关通过，配合得真好！`,
  'hush:lost': (n) =>
    `在第 ${n.level} 关用完了命：共 ${n.levels} 关，通过了 ${n.cleared} 关。`,
  'hush:discarded': (n) =>
    `离开玩家手里的 ${list(n.cards.map(String))} 已弃掉，不扣命。`,
  'dw:started': (n) =>
    `游戏开始！共 ${n.rounds} 个单词，每个 ${n.seconds} 秒。`,
  'dw:solved': (n) =>
    `${who(n.name)} 猜了 ${n.guesses} 次后猜中！(+${n.points})`,
  'dw:revealed': (n) => `答案是 ${n.word}。`,
  'dc:step': (n) =>
    n.kind === 'prompt'
      ? `第 ${n.step} 步：写下第一句。`
      : n.kind === 'drawing'
        ? `第 ${n.step} 步：把收到的句子画出来。`
        : `第 ${n.step} 步：说说收到的画是什么。`,
  'dc:reveal': (n) => `揭晓时间！${who(n.host)} 来逐条展示每条传话。`,
  'dc:album': (_n) => '所有传话都收进画册了。',
};
