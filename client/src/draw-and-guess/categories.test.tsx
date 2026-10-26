import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type {
  DrawAndGuessRoomState,
  Result,
  WordCategory,
} from '../../../shared/wire-types';
import { WORD_CATEGORIES } from '../../../shared/draw-and-guess';
import { ME, drawAndGuessState } from '../tests/fixtures';
import { renderSeated } from '../tests/seated';
import { renderApp } from '../tests/render-app';
import type { FakeSocket } from '../tests/fake-socket';
import { drawAndGuess as zhCatalog } from '../i18n/zh/draw-and-guess';
import { room as zhRoom } from '../i18n/zh/room';

/** The arguments of each `event` request the app made. */
const asked = (fake: FakeSocket, event: string) =>
  fake.requests.filter((r) => r.event === event).map((r) => r.args);

const players = {
  p1: { username: 'Ryan', points: 0, isConnected: true },
  p2: { username: 'Maya', points: 0, isConnected: true },
};

/** A game Ryan (the viewer, and host unless said) won against Maya. */
const finished = (overrides: Partial<DrawAndGuessRoomState> = {}) =>
  drawAndGuessState({
    playerList: players,
    lastGame: {
      endedEarly: false,
      standings: [
        { playerId: ME, username: 'Ryan', points: 300 },
        { playerId: 'p2', username: 'Maya', points: 120 },
      ],
      wordCategory: 'Animals',
      rounds: 2,
      turns: 4,
    },
    ...overrides,
  });

const chip = (dialog: HTMLElement, name: string) =>
  within(dialog).getByRole('button', { name });

describe('the word categories', () => {
  it('are picked in a dialog between games, and sent when saved', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(finished());
    fake.answer('room:settings', (): Result => ({ ok: true }));

    const field = screen.getByRole('button', {
      name: 'Word categories All 15',
    });
    expect(field).toHaveAttribute('aria-haspopup', 'dialog');
    await user.click(field);
    const dialog = await screen.findByRole('dialog', {
      name: 'Word categories',
    });
    expect(within(dialog).getByText('All 15 picked')).toBeInTheDocument();
    // With every chip on, there is nothing to choose all of, but the button
    // stays where it is.
    expect(
      within(dialog).getByRole('button', { name: 'Choose all' }),
    ).toHaveAttribute('aria-disabled', 'true');

    await user.click(chip(dialog, 'Vehicles'));
    await user.click(chip(dialog, 'Animals'));
    expect(chip(dialog, 'Vehicles')).toHaveAttribute('aria-pressed', 'false');
    expect(within(dialog).getByText('13 of 15 picked')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(asked(fake, 'room:settings')).toEqual([
        [
          'r1',
          {
            rounds: 2,
            categories: WORD_CATEGORIES.filter(
              (category) => category !== 'Vehicles' && category !== 'Animals',
            ),
          },
        ],
      ]),
    );
  });

  it('keep the last one picked, and can all be chosen again', async () => {
    const user = userEvent.setup();
    const { fake, update } = await renderSeated(
      finished({ categories: ['Food', 'Music'] }),
    );
    fake.answer('room:settings', (): Result => ({ ok: true }));
    await user.click(
      screen.getByRole('button', { name: 'Word categories 2 of 15' }),
    );
    const dialog = await screen.findByRole('dialog');

    await user.click(chip(dialog, 'Food'));
    expect(chip(dialog, 'Music')).toHaveAttribute('aria-disabled', 'true');
    expect(chip(dialog, 'Music')).toHaveAccessibleDescription(
      'At least one stays picked.',
    );
    expect(chip(dialog, 'Food')).not.toHaveAccessibleDescription();
    await user.click(chip(dialog, 'Music'));
    expect(chip(dialog, 'Music')).toHaveAttribute('aria-pressed', 'true');
    expect(within(dialog).getByText('1 of 15 picked')).toBeInTheDocument();
    expect(
      within(dialog).getByText('At least one stays picked.'),
    ).toBeInTheDocument();

    const chooseAll = within(dialog).getByRole('button', {
      name: 'Choose all',
    });
    expect(chooseAll).not.toHaveAttribute('aria-disabled');
    await user.click(chooseAll);
    expect(within(dialog).getByText('All 15 picked')).toBeInTheDocument();
    // Disabled now, it keeps the focus the press gave it.
    expect(chooseAll).toHaveAttribute('aria-disabled', 'true');
    expect(chooseAll).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(asked(fake, 'room:settings')).toEqual([]);

    // The next snapshot is what the field shows, by name when one is left.
    update(finished({ categories: ['Sea Life'] }));
    expect(
      screen.getByRole('button', { name: 'Word categories Sea Life' }),
    ).toBeInTheDocument();
  });

  it('send nothing when saved as they were', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(finished());
    fake.answer('room:settings', (): Result => ({ ok: true }));
    await user.click(
      screen.getByRole('button', { name: 'Word categories All 15' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(chip(dialog, 'Jobs'));
    await user.click(chip(dialog, 'Jobs'));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(asked(fake, 'room:settings')).toEqual([]);
  });

  it('are picked from the keyboard, and Escape forgets what was picked', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(finished());
    fake.answer('room:settings', (): Result => ({ ok: true }));
    const field = screen.getByRole('button', {
      name: 'Word categories All 15',
    });
    field.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog');
    const chooseAll = within(dialog).getByRole('button', {
      name: 'Choose all',
    });

    // Choose all, then each chip in turn, then Save and Cancel.
    await waitFor(() => expect(chooseAll).toHaveFocus());
    await user.tab();
    expect(chip(dialog, 'Animals')).toHaveFocus();
    await user.keyboard(' ');
    expect(chip(dialog, 'Animals')).toHaveAttribute('aria-pressed', 'false');
    for (const category of WORD_CATEGORIES.slice(1)) {
      await user.tab();
      expect(chip(dialog, category)).toHaveFocus();
    }
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toHaveFocus();
    await user.tab();
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toHaveFocus();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(asked(fake, 'room:settings')).toEqual([]);
    expect(field).toHaveAccessibleName('Word categories All 15');
    await waitFor(() => expect(field).toHaveFocus());

    await user.keyboard('{Enter}');
    expect(chip(await screen.findByRole('dialog'), 'Animals')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('are said to a guest with the next game’s rounds', async () => {
    const guest = { owner: { username: 'Maya', playerId: 'p2' } };
    const { update } = await renderSeated(finished(guest));
    expect(
      screen.getByText('Next game: 2 rounds, all 15 categories'),
    ).toBeInTheDocument();
    update(finished({ ...guest, categories: ['Jobs', 'Places'] }));
    expect(
      screen.getByText('Next game: 2 rounds, 2 categories'),
    ).toBeInTheDocument();
    update(finished({ ...guest, categories: ['Jobs'] }));
    expect(screen.getByText('Next game: 2 rounds of Jobs')).toBeInTheDocument();
  });

  it.each<[WordCategory[], string]>([
    [
      [...WORD_CATEGORIES],
      '2 players, 2 rounds. The word category is drawn at random from all 15 when the game starts.',
    ],
    [
      ['Fantasy', 'Music', 'Nature'],
      '2 players, 2 rounds. The word category is drawn at random from 3 categories when the game starts.',
    ],
    [['Fantasy'], '2 players, 2 rounds. The word category is Fantasy.'],
  ])(
    'tell the waiting host where the word comes from',
    async (categories, text) => {
      await renderSeated(
        drawAndGuessState({ playerList: players, categories }),
      );
      expect(screen.getByText(text)).toBeInTheDocument();
    },
  );

  it.each<[WordCategory[], string]>([
    [
      [...WORD_CATEGORIES],
      'The word category is drawn at random from all 15 when the game starts.',
    ],
    [
      ['Food', 'Jobs'],
      'The word category is drawn at random from 2 categories when the game starts.',
    ],
    [['League of Legends'], 'The word category is League of Legends.'],
  ])(
    'tell a waiting guest where the word comes from too',
    async (categories, text) => {
      await renderSeated(
        drawAndGuessState({
          playerList: players,
          owner: { username: 'Maya', playerId: 'p2' },
          categories,
        }),
      );
      expect(
        screen.getByText(
          `2 players, 2 rounds. ${text} Only the host can start the game.`,
        ),
      ).toBeInTheDocument();
    },
  );

  it('are worded in Chinese', async () => {
    const user = userEvent.setup();
    const { fake } = await renderApp('/games/draw-and-guess/new', {
      locale: 'zh',
    });
    await user.click(
      screen.getByRole('button', { name: '词语类别 全部 15 个' }),
    );
    const dialog = await screen.findByRole('dialog', { name: '词语类别' });
    expect(
      within(dialog).getByText('每局游戏从选中的类别里随机抽一个。'),
    ).toBeInTheDocument();
    await user.click(chip(dialog, '海洋生物'));
    expect(
      within(dialog).getByText('已选 14 个，共 15 个'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '全选' }));
    await user.click(chip(dialog, 'League of Legends'));
    await user.click(within(dialog).getByRole('button', { name: '保存' }));
    expect(
      screen.getByRole('button', { name: '词语类别 已选 14 个' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '创建房间' }));
    await waitFor(() =>
      expect(fake.requests).toContainEqual({
        event: 'room:create',
        args: [
          expect.objectContaining({
            settings: {
              rounds: 2,
              categories: WORD_CATEGORIES.filter(
                (category) => category !== 'League of Legends',
              ),
            },
          }),
        ],
      }),
    );
  });

  it('are said in Chinese to a waiting host and a guest', () => {
    const t = zhCatalog;
    expect(t.setup(4, 2, [...WORD_CATEGORIES])).toBe(
      '4 人，2 轮。词语都是英文单词，游戏开始时会从全部 15 个类别中随机选择词语类别。',
    );
    expect(t.setup(4, 2, ['Food', 'Jobs'])).toBe(
      '4 人，2 轮。词语都是英文单词，游戏开始时会从选中的 2 个类别中随机选择词语类别。',
    );
    expect(t.setup(4, 2, ['Household'])).toBe(
      '4 人，2 轮。词语都是英文单词，词语类别是“家居用品”。',
    );
    expect(t.nextSetting(3, ['Sea Life'])).toBe('3 轮，海洋生物');
    // A guest reads the host's line, and who starts.
    expect(zhRoom.guestSetup(t.setup(4, 2, ['Household']))).toBe(
      '4 人，2 轮。词语都是英文单词，词语类别是“家居用品”。只有房主可以开始游戏。',
    );
  });
});
