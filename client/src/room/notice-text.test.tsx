import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { RoomNotice } from '../../../shared/wire-types';
import { en } from '../i18n/en';
import { zh } from '../i18n/zh';
import { FakeSocket } from '../tests/fake-socket';
import { drawAndGuessState } from '../tests/fixtures';
import { renderApp } from '../tests/render-app';
import { noticeText } from './notice-text';

describe('room announcements', () => {
  it.each<[RoomNotice, string, string]>([
    [
      { type: 'room:joined', name: '阿青' },
      '阿青 has joined the room.',
      '阿青 加入了房间。',
    ],
    [
      { type: 'room:renamed', before: 'Sam', name: '山姆' },
      'Sam is now 山姆.',
      'Sam 改名为 山姆。',
    ],
    [
      { type: 'room:owner-left', name: 'Ana', owner: 'Ben' },
      'Ana has left the room. Ben is now the host.',
      'Ana 离开了房间，Ben 成为新房主。',
    ],
    [
      { type: 'cb:started', rounds: 3, seconds: 180 },
      'Game has started! 3 codes, 3 minutes each.',
      '游戏开始！共 3 局，每局 3 分钟。',
    ],
    [
      { type: 'dw:started', rounds: 3, seconds: 90 },
      'Game has started! 3 words, 90 seconds each.',
      '游戏开始！共 3 个单词，每个 90 秒。',
    ],
    [
      { type: 'dg:started', category: 'Animals' },
      'Game has started! The word category for this game is "Animals"!',
      '游戏开始！本局词语类别是“动物”！',
    ],
    [
      { type: 'dg:started', category: 'League of Legends' },
      'Game has started! The word category for this game is "League of Legends"!',
      '游戏开始！本局词语类别是“League of Legends”！',
    ],
    [
      { type: 'game:over', names: ['Ada', 'Bob'], points: 1, unit: 'pair' },
      'Game over: Ada and Bob tie with 1 pair!',
      '游戏结束：Ada 和 Bob 并列获胜，1 对！',
    ],
    [
      { type: 'game:over', names: ['Ada'], points: 1, unit: 'die' },
      'Game over: Ada wins with 1 die left!',
      '游戏结束：Ada 获胜，还剩 1 颗骰子！',
    ],
    [
      {
        type: 'ld:called',
        name: 'Ada',
        bid: { count: 2, face: 5 },
        matched: 0,
        loser: 'Bob',
      },
      'Ada called Liar on two 5s: there were none. Bob loses a die.',
      'Ada 对 2 个 5 喊了“吹牛”：实际有 0 个。Bob 丢一颗骰子。',
    ],
    [
      {
        type: 'hush:mistake',
        name: 'Ada',
        card: 20,
        held: [{ name: 'Bob', cards: [3, 7] }],
      },
      'Ada played 20, but Bob held 3 and 7.',
      'Ada 出了 20，但 Bob 还拿着 3 和 7。',
    ],
    [
      { type: 'hush:cleared', level: 2, clean: true, lifeBack: true },
      'Level 2 cleared without a slip: a life back!',
      '第 2 关完美通过，赢回一条命！',
    ],
    [
      { type: 'dw:revealed', word: 'APPLE' },
      'The word was APPLE.',
      '答案是 APPLE。',
    ],
    [
      { type: 'dg:turn', round: 2, drawer: 'Ana' },
      'Round 2 · Ana draws',
      '第 2 轮 · Ana 来画',
    ],
    [
      { type: 'ms:mines', round: 4, hits: [{ name: 'Ana', points: -20 }] },
      'Round 4: Ana hit a mine (−20).',
      '第 4 轮：Ana 踩到了雷（−20）。',
    ],
    [
      {
        type: 'ms:mines',
        round: 4,
        hits: [
          { name: 'Ana', points: -20 },
          { name: 'Ben', points: -15 },
        ],
      },
      'Round 4: Ana (−20) and Ben (−15) hit mines.',
      '第 4 轮：Ana（−20） 和 Ben（−15） 踩到了雷。',
    ],
    [
      {
        type: 'make24:hand',
        hand: 2,
        solved: [
          { name: 'Ana', points: 148 },
          { name: 'Ben', points: 120 },
        ],
      },
      'Hand 2: Ana +148, Ben +120',
      '第 2 手：Ana +148、Ben +120',
    ],
    [
      { type: 'dc:step', step: 1, kind: 'prompt' },
      'Step 1 · Write',
      '第 1 步 · 写',
    ],
    [
      { type: 'dc:skipped', step: 4, kind: 'drawing' },
      'Step 4 is skipped: every description came back empty, so nobody had words to draw.',
      '第 4 步跳过了：上一步的描述都是空的，没人有字可画。',
    ],
    [
      { type: 'room:disconnected', name: '' },
      'A player lost connection.',
      '某位玩家 的连接中断了。',
    ],
  ])('renders %j in the viewer’s language', (notice, english, chinese) => {
    expect(noticeText(notice, en)).toBe(english);
    expect(noticeText(notice, zh)).toBe(chinese);
  });

  it('rewords both history and new notices after a language switch, keeping player text verbatim', async () => {
    const user = userEvent.setup();
    const fake = new FakeSocket();
    fake.answer('room:sync', () => ({ ok: true as const }));
    await renderApp('/games/draw-and-guess/rooms/r1', { fake, locale: 'zh' });
    act(() => {
      fake.serverEmits('room:state', drawAndGuessState());
      fake.serverEmits('chat:history', 'r1', [
        {
          id: 1,
          kind: 'system',
          notice: { type: 'room:created', name: 'Sam' },
        },
        {
          id: 2,
          kind: 'player',
          playerId: 'p2',
          username: 'Bob',
          text: 'hello，朋友',
        },
      ]);
      fake.serverEmits('chat:message', 'r1', {
        id: 3,
        kind: 'success',
        notice: { type: 'dg:guessed', name: 'Bob', points: 90 },
      });
    });
    expect(screen.getByText('Sam 创建了房间。')).toBeVisible();
    expect(screen.getByText('Bob 猜中了！(+90)')).toBeVisible();
    expect(screen.getByText('hello，朋友')).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'English' }));
    expect(screen.getByText('Sam created the room.')).toBeVisible();
    expect(
      screen.getByText('Bob guessed the correct word! (+90)'),
    ).toBeVisible();
    expect(screen.queryByText('Sam 创建了房间。')).not.toBeInTheDocument();
    expect(screen.getByText('hello，朋友')).toBeVisible();
  });
});
