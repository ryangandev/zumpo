import type { chat as en } from '../en/chat';

export const chat: typeof en = {
  you: (name) => `${name}（你）`,
  joined: (names) =>
    `${names.slice(0, -1).join('、')} 和 ${names.at(-1)} 加入了房间。`,
};
