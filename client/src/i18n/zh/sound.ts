import type { sound as en } from '../en/sound';

export const sound: typeof en = {
  trigger: {
    on: '声音已开',
    off: '声音已关',
  },
  menu: '声音',
  effects: {
    label: '音效',
    mute: '音效静音',
    volume: '音效音量',
  },
  level: (percent) => `${percent}%`,
  off: '关',
  valueText: (percent, muted) =>
    muted ? `${percent}%，已静音` : `${percent}%`,
};
