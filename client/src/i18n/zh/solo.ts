import type { solo as en } from '../en/solo';

export const solo: typeof en = {
  onYourOwn: '单人模式',
  leave: '离开',
  leaveTitle: '离开这局？',
  stay: '留下',
  linkCopied: '链接已复制',
  challengeFriend: '挑战好友',
  copyChallengeLink: '复制挑战链接',
  today: '今天',
  yesterday: '昨天',
  date: (date) =>
    date
      .toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
      .replace(/(\d+)([月日])/g, '$1 $2 ')
      .trim(),
};
