import type { lobby as en } from '../en/lobby';

export const lobby: typeof en = {
  playTogether: '一起玩',
  title: (game) => `${game}房间`,
  subtitle: '加入房间，或为朋友们创建一个。',
  liveCount: (count) => `${count} 个房间 · 实时更新`,
  hostedBy: (name, setting) =>
    setting ? `房主 ${name} · ${setting}` : `房主 ${name}`,
  watching: (count) => `${count} 人观战`,
  howToPlay: '玩法',
  createRoom: '创建房间',
  emptyTitle: '这里还很安静。',
  emptyDescription: '创建第一个房间，叫上朋友一起玩。',
  loadingTitle: '正在寻找玩伴…',
  loadingDescription: '正在连接房间列表。',
};
