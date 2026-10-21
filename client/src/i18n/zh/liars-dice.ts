import type { liarsDice as en } from '../en/liars-dice';
import { HIGHEST_FACE } from '../../../../shared/liars-dice';
import type { LiarsDiceReveal } from '../../../../shared/wire-types';
import type { Naming, Who } from '../../liars-dice/words';

/** "你" runs into the verb; any other name is set off by a space. */
const subject = (w: Who) => (w.you ? w.name : `${w.name} `);
const loss = (reveal: LiarsDiceReveal, who: Naming) => {
  const loser = who(reveal.loserId);
  return reveal.out ? `${subject(loser)}出局了` : `${subject(loser)}丢一颗骰子`;
};
const stands = (reveal: LiarsDiceReveal) => reveal.matched >= reveal.bid.count;

export const liarsDice: typeof en = {
  dice: (count) => `${count} 颗骰子`,
  you: '你',
  youLabel: '你',
  possessive: (name, you) => (you ? '你的' : `${name} 的`),
  bid: (bid) => `${bid.count} 个 ${bid.face}`,
  bidLabel: (bid) => `叫 ${bid.count} 个 ${bid.face}`,
  bidLine: (who, bid) => `${subject(who)}叫了 ${bid.count} 个 ${bid.face}`,
  beat: (bid) =>
    bid.face < HIGHEST_FACE
      ? `要大过 ${bid.count} 个 ${bid.face}：多叫几个，或叫更大的点数`
      : `要大过 ${bid.count} 个 ${bid.face}：多叫几个`,
  countDetail: (reveal) =>
    `${reveal.wild === 0 ? '不含百搭' : `含 ${reveal.wild} 颗百搭`} · 叫了 ${reveal.bid.count} 个`,
  lossLine: loss,
  verdict: (reveal, who) =>
    stands(reveal)
      ? `${who(reveal.bid.playerId).possessive}叫点成立，${loss(reveal, who)}`
      : `${who(reveal.bid.playerId).possessive}叫点不成立，${loss(reveal, who)}`,
  revealBar: (reveal, who) => ({
    label: `${subject(who(reveal.callerId))}喊了“吹牛”`,
    main: `${who(reveal.bid.playerId).possessive}叫点${stands(reveal) ? '成立' : '不成立'}`,
    meta: loss(reveal, who),
  }),
  out: '出局',
  lostDie: '丢了一颗骰子',
  calledLiar: '喊了“吹牛”',
  outRound: (round) => `第 ${round} 轮出局`,
  yourTurn: '轮到你了',
  deciding: '决定中',
  youNext: '下一位是你',
  count: '点数统计',
  bidsRound: '本轮叫点',
  face: (face) => `点数 ${face}`,
  round: (round) => `第 ${round} 轮`,
  gameOver: '游戏结束',
  gameEnded: '游戏已中止',
  waitingRoom: '等待室',
  chat: '聊点什么…',
  somebody: '有人',
  each: (dice) => `每人 ${dice} 颗骰子`,
  resultDetail: (rounds, dice) => `${rounds} 轮，每人 ${dice} 颗骰子。`,
  leftGame: '已离开游戏',
  lastCall: '最后一次“吹牛”',
  alone: '叫上朋友更好玩。',
  setup: (players, dice) =>
    `${players} 人，每人 ${dice} 颗骰子。大家暗中摇骰，然后对全桌叫点；不相信对方时，就喊“吹牛”。`,
  guestSetup: (players, dice) => `${players} 人，每人 ${dice} 颗骰子。`,
  outNote: '你的骰子用完了。留下看看谁会获胜，也可以继续聊天。',
  callLiar: '喊“吹牛”',
  paused: '已暂停',
  nextRound: '下一轮',
  raiseOrCall: '加注，或喊“吹牛”',
  openBidding: '开始叫点',
  onTable: (dice) => `桌上有 ${dice} 颗骰子`,
  toBid: '叫点时间',
  turn: (name) => `轮到 ${name}`,
  isDeciding: (name) => `${name} 正在决定`,
  openingRound: '本轮开始',
  away: '暂离',
  waiting: '等待中',
  bidStands: '叫点成立',
  bidLie: '叫点不成立',
  bidding: '叫点中',
  upNext: '下一位',
  solo: {
    record: (wins, games, run) =>
      `你在这里玩了 ${games} 局，赢了 ${wins} 局。${run > 1 ? `目前连胜 ${run} 局。` : ''}`,
    description: '叫点是说全桌有几颗骰子是某个点数，1 点算任意点数。',
    pickTable: '选一桌。',
    leaveWarning: '这局到此结束，不计入战绩。',
    start: '开始',
    bots: '电脑对手',
    botCount: (count) => `${count} 个电脑对手`,
    diceEach: '每人骰子数',
    quick: '快速局。',
    classic: '经典局，时间更长。',
    diceCount: (count) => `${count} 颗骰子`,
    youWon: '你赢了',
    wonIn: (rounds) => `你在 ${rounds} 轮后获胜。`,
    outIn: (place, of) => `你在 ${of} 人中获得${place}。`,
    lastAtTable: (dice) => `你坚持到了最后，还剩 ${dice} 颗骰子。`,
    stillIn: (names, _count, round) => `第 ${round} 轮时，${names} 还在场上。`,
    place: '名次',
    placeOf: (place, of) => `${place} / ${of} 人`,
    rounds: '轮数',
    gamesWon: '获胜局数',
    gamesWonCount: (wins, games) => `${wins} / ${games} 局`,
    changeTable: '换一桌',
    nextRound: '下一轮',
    thisGame: '本局游戏',
    round: '当前轮数',
    diceOnTable: '桌上骰子数',
    yourDice: '你的骰子数',
    onDevice: '本机记录',
    notYet: '暂无',
    currentRun: '当前连胜',
    wins: (count) => `${count} 局`,
    thinking: (name) => `${name} 正在思考`,
  },
};
