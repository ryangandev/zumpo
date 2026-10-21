import type { GomokuColor, GomokuEnding } from '../../../../shared/wire-types';
import type { gomoku as en } from '../en/gomoku';

const COLOR: Record<GomokuColor, string> = { black: '黑', white: '白' };

/** 房间里一局怎么结束的，说的是输的一方。 */
const HOW: Record<Exclude<GomokuEnding, 'five' | 'draw'>, string> = {
  resigned: '认输了',
  timeout: '连续两次超时',
  left: '离开了房间',
};

export const gomoku: typeof en = {
  color: (color) => `${COLOR[color]}方`,
  seat: (color, note) =>
    note ? `执${COLOR[color]} · ${note}` : `执${COLOR[color]}`,
  notes: {
    yourTurn: '轮到你',
    thinking: '思考中',
    missed: '超时一次',
    five: '五子连珠',
    won: '获胜',
    draw: '平局',
    away: '暂离',
  },
  board: '五子棋棋盘',
  chat: '说点什么…',

  game: (number) => `第 ${number} 局`,
  gameOver: '本局结束',
  waitingRoom: '等待中',

  yourTurn: '轮到你',
  turn: (name) => `轮到 ${name}`,
  place: (color) => `落一颗${COLOR[color]}子`,
  isThinking: (name) => `${name} 正在思考`,
  played: (name, point) => `${name} 下在 ${point}`,
  youPlayed: (point) => `你下在 ${point}`,
  passed: (name) => `${name} 超时，跳过一手`,
  yourTurnPassed: '你超时了，跳过一手',
  firstMove: '黑方先走，可以下在任何位置',
  toMove: '落子',
  paused: '暂停',

  placeStone: '落子',
  hoverHint: '鼠标移到点上会显示你的棋子，点击落子。',
  tapHint: '再点一次淡色棋子，或点“落子”。点别的位置可以换地方。',
  colorsNote: '黑方先走。这局之后交换颜色，你们轮流先手。',
  missedNotice: '你超时了，这一手跳过。下一手再超时，这局就判负。',
  here: '在场',
  hostHere: '房主 · 在场',
  away: '暂离',
  freeSeat: '空位',
  anybodyCanSit: '观战的人都可以坐下',

  resign: '认输',
  resignTitle: '认输这局？',
  resignBody: (winner, game) =>
    `${winner} 赢下第 ${game} 局，得一分。你的座位会保留到下一局。`,
  keepPlaying: '继续下',

  waiting: '等待中',
  wonGame: (game) => `赢了第 ${game} 局`,

  alone: '在等第二位玩家。',
  setup: '两人对弈，15 × 15 的棋盘，每步 30 秒。',

  youWin: (ending, loser) =>
    ending === 'five'
      ? '你连成五子，获胜！'
      : `你赢了：${loser} ${HOW[ending as keyof typeof HOW]}。`,
  youLose: (ending, winner) =>
    ending === 'five'
      ? `${winner} 连成五子，获胜。`
      : ending === 'resigned'
        ? '你认输了。'
        : ending === 'timeout'
          ? '你连续两次超时。'
          : `${winner} 获胜。`,
  theyWin: (ending, winner, loser) =>
    ending === 'five'
      ? `${winner} 连成五子，获胜。`
      : `${winner} 获胜：${loser} ${HOW[ending as keyof typeof HOW]}。`,
  draw: '平局：棋盘下满了。',
  moves: (count) => `共 ${count} 手。`,
  drawDetail: (stones) => `${stones} 颗子，没有人连成五子。`,
  nextBlack: (name) => `下一局 ${name} 执黑。`,
  seatFree: (name) => `${name} 的座位空出来了，谁都可以坐。`,
  fiveFrom: (from, to) => `五子连珠，${from} 到 ${to}`,
  drawStatus: '平局',
  both: (first, second) => `${first}${second}`,
  startGame: (game) => `开始第 ${game} 局`,

  solo: {
    computer: '电脑',
    levels: { easy: '简单', medium: '中等', hard: '困难' },
    levelHelp: {
      easy: '适合刚上手：你的大多数布局它都看不出来。',
      medium: '会挡住简单的威胁，想赢要有计划。',
      hard: '会往后看好几手，看到必胜的走法就会走。',
    },
    pickTitle: '开一局。',
    description: '和电脑对战，三档难度，可以执黑或执白。',
    record: (level, wins, games, run) =>
      `${level}难度下你赢了 ${games} 局中的 ${wins} 局。${
        run > 1 ? `目前 ${run} 连胜。` : ''
      }`,
    level: '难度',
    stones: '你执',
    stonesHelp: '再来一局时会交换颜色，轮流先手。',
    stonesOf: { black: '黑子，你先走', white: '白子，电脑先走' },
    start: '开始',
    move: (number) => `第 ${number} 手`,
    youWon: '你赢了',
    computerWon: '电脑赢了',
    drawTag: '平局',
    computersTurn: '轮到电脑',
    computerThinking: '电脑正在思考',
    computerPlayed: (point) => `电脑下在 ${point}`,
    thinking: '思考中',
    wonOn: (move) => `第 ${move} 手，你赢了。`,
    lostOn: (move) => `第 ${move} 手，电脑赢了。`,
    draw: '平局：棋盘下满了。',
    five: (from, to, next) =>
      `五子连珠，从 ${from} 到 ${to}。再来一局你执${COLOR[next]}。`,
    drawBody: (next) => `没有人连成五子。再来一局你执${COLOR[next]}。`,
    takeBack: '悔棋',
    changeLevel: '换难度',
    thisGame: '这一局',
    youPlay: '你执',
    stonesOnBoard: '棋盘上的子',
    movesLabel: '手数',
    onDevice: '这台设备上',
    gamesWonAt: (level) => `${level}难度胜局`,
    gamesWonCount: (wins, games) => `${games} 局胜 ${wins}`,
    currentRun: '当前连胜',
    wins: (count) => `${count} 胜`,
    notYet: '还没有',
  },
};
