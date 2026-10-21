import type { shell as en } from '../en/shell';

export const shell: typeof en = {
  nav: {
    games: '游戏',
    main: '主导航',
    home: 'Zumpo 首页',
  },
  footer: {
    wide: '好友相伴，再来一局。',
    narrow: '玩一会儿，好友相伴。',
  },
  language: {
    label: '语言',
  },
  name: {
    yourName: '你的名字',
    viewer: (name) => `${name}：你的名字`,
    changeName: '改名字',
    helper: '你房间里的所有人都会看到。',
    save: '保存',
    roll: '随机起名',
    empty: '请输入至少一个可见字符。',
  },
  connection: {
    replacedTitle: 'Zumpo 已在另一个标签页打开。',
    replacedDescription: '你正在那边玩。改用这个标签页的话，另一个会等着。',
    useThisTab: '用这个标签页',
    failedTitle: '无法连接。',
    failedDescription: '游戏服务器没有响应，请重试。',
    tryAgain: '重试',
  },
  backToGames: '返回游戏列表',
  notFound: {
    title: '迷路了？',
    description: '找不到这个页面。不过还有好游戏在等你。',
    backHome: '回到首页',
  },
  crashed: {
    title: '出了点问题',
    description: '这个页面出错了。刷新一下通常就好，房间里的座位会给你留着。',
    reload: '刷新',
  },
};
