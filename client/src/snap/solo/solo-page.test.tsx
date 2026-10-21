import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../i18n/en';
import { onPhone } from '../../tests/phone';
import { renderApp } from '../../tests/render-app';
import {
  afterFlash,
  MATCH_FLASH_MS,
  matchNow,
  middleOf,
  newRun,
  RUN_CARDS,
  tap,
  WRONG_FLASH_MS,
  type SoloRun,
} from './run';

const SEED = 'k3f9x2';

const turn = () => within(screen.getByRole('region', { name: 'Turn' }));
const card = (name: string) =>
  within(screen.getByRole('group', { name: new RegExp(`^${name}`) }));
const nameOf = (symbol: number) => en.ui.snap.symbol(symbol);

let user: ReturnType<typeof userEvent.setup>;
/** The run as the page plays it, to know where the match is. */
let model: SoloRun;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  model = newRun(SEED, 0);
});

afterEach(() => {
  vi.useRealTimers();
});

const pause = (ms: number) => act(() => vi.advanceTimersByTime(ms));

/** Taps the match on the middle card, and waits for the next card. */
async function takeCard() {
  const match = matchNow(model)!;
  await user.click(
    card('Middle card').getByRole('button', { name: nameOf(match) }),
  );
  model = afterFlash(tap(model, match, 0), 0);
  await pause(MATCH_FLASH_MS);
}

/** Starts the run `SEED` deals. */
async function startRun() {
  const view = await renderApp(`/games/snap/solo?seed=${SEED}`);
  await user.click(screen.getByRole('button', { name: 'Start' }));
  return view;
}

describe('Snap on your own', () => {
  it('runs in Chinese, symbols and all', async () => {
    await renderApp(`/games/snap/solo?seed=${SEED}`, { locale: 'zh' });
    expect(screen.getByText('30 张牌，看你多快。')).toBeInTheDocument();
    expect(screen.getByText(/^朋友发来了这副牌。/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '开始' }));
    const bar = within(screen.getByRole('region', { name: '当前回合' }));
    expect(bar.getByText('第 1 / 30 张')).toBeInTheDocument();
    expect(bar.getByText('找出相同的图案')).toBeInTheDocument();
    expect(screen.getByText('还剩 30 张')).toBeInTheDocument();
    const mine = within(screen.getByRole('group', { name: '你的牌' }));
    expect(mine.getAllByRole('button')).toHaveLength(6);
    const wrong = model.mine.find((s) => !middleOf(model).includes(s))!;
    await user.click(mine.getAllByRole('button')[model.mine.indexOf(wrong)]!);
    expect(bar.getByText('不是这个，+3 秒')).toBeInTheDocument();
    expect(bar.getByText(/只在你的牌上$/)).toBeInTheDocument();
  });

  it('is offered on the game’s page', async () => {
    await renderApp('/games/snap');
    expect(screen.getByRole('link', { name: 'Play solo' })).toHaveAttribute(
      'href',
      '/games/snap/solo',
    );
  });

  it('deals nothing until Start', async () => {
    await renderApp('/games/snap/solo');
    expect(screen.getByText('Thirty cards, one clock.')).toBeInTheDocument();
    expect(screen.getByText('Not yet')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Middle card' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(turn().getByText('Card 1 of 30')).toBeInTheDocument();
    expect(turn().getByText('Spot the match')).toBeInTheDocument();
    expect(card('Middle card').getAllByRole('button')).toHaveLength(6);
    expect(card('Your card').getAllByRole('button')).toHaveLength(6);
  });

  it('plays a challenge’s own deck', async () => {
    await startRun();
    expect(
      card('Middle card')
        .getAllByRole('button')
        .map((spot) => spot.getAttribute('aria-label')),
    ).toEqual(middleOf(model).map(nameOf));
  });

  it('marks a symbol on only one card as wrong, and adds 3 seconds', async () => {
    await startRun();
    const wrong = middleOf(model).find((s) => !model.mine.includes(s))!;
    await user.click(
      card('Middle card').getByRole('button', { name: nameOf(wrong) }),
    );
    expect(turn().getByText('Not a match, +3 s')).toBeInTheDocument();
    expect(
      turn().getByText(en.snap.onlyOn(wrong, 'middle')),
    ).toBeInTheDocument();
    expect(turn().getByRole('timer')).toHaveTextContent(/^00:0[3-4]/);
    expect(
      card('Middle card').getByRole('img', {
        name: `${nameOf(wrong)}, not a match`,
      }),
    ).toBeInTheDocument();

    await pause(WRONG_FLASH_MS);
    expect(turn().getByText('Spot the match')).toBeInTheDocument();
    expect(screen.getByText('1, +0:03')).toBeInTheDocument();
  });

  it('ends after thirty cards, keeps the best and copies a challenge', async () => {
    await startRun();
    const match = matchNow(model)!;
    await user.click(
      card('Your card').getByRole('button', { name: nameOf(match) }),
    );
    expect(turn().getByText('A match!')).toBeInTheDocument();
    expect(
      card('Middle card').getByRole('img', {
        name: `${nameOf(match)}, on both cards`,
      }),
    ).toBeInTheDocument();
    model = afterFlash(tap(model, match, 0), 0);
    await pause(MATCH_FLASH_MS);
    expect(turn().getByText('Card 2 of 30')).toBeInTheDocument();
    for (let taken = 1; taken < RUN_CARDS; taken++) await takeCard();

    expect(
      screen.getByRole('heading', { name: /^30 cards in 0:0\d\.$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your first run on this device.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Run complete')).toBeInTheDocument();
    expect(screen.getByText('Slowest card')).toBeInTheDocument();
    expect(localStorage.getItem('zumpo:solo:best:snap:thirty-cards')).toMatch(
      /^\d+$/,
    );
    expect(screen.getByText('Today')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Challenge a friend' }),
    );
    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}/games/snap/solo?seed=${SEED}`,
    );

    // Play again is a new run, not the challenge again.
    await user.click(screen.getByRole('button', { name: 'Play again' }));
    expect(turn().getByText('Card 1 of 30')).toBeInTheDocument();
  });

  it('keeps to the two cards on a phone', async () => {
    onPhone();
    await startRun();
    expect(card('Middle card').getAllByRole('button')).toHaveLength(6);
    expect(screen.queryByText('This run')).toBeNull();
  });
});
