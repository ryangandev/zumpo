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
/** A value on the side's This run card. */
const stat = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

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

/** Plays the run `SEED` deals. */
const startRun = () => renderApp(`/games/snap/solo?seed=${SEED}`);

describe('Snap on your own', () => {
  it('runs in Chinese, symbols and all', async () => {
    await renderApp(`/games/snap/solo?seed=${SEED}`, { locale: 'zh' });
    expect(screen.getByText('挑战')).toBeInTheDocument();
    expect(screen.getByText('怎样算相同')).toBeInTheDocument();
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

  it('deals at once, with two cards to learn from', async () => {
    await renderApp('/games/snap/solo');
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(screen.getByText('Not yet')).toBeInTheDocument();
    expect(screen.getByText('What makes a match')).toBeInTheDocument();
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
    expect(turn().getByRole('timer')).toHaveTextContent(/^0:0[3-4]/);
    expect(
      card('Middle card').getByRole('button', {
        name: `${nameOf(wrong)}, not a match`,
      }),
    ).toBeInTheDocument();

    // The mark goes, but which card the symbol is on stays until the next tap.
    await pause(WRONG_FLASH_MS);
    expect(
      card('Middle card').queryByRole('button', { name: /, not a match$/ }),
    ).toBeNull();
    expect(turn().getByText('Not a match, +3 s')).toBeInTheDocument();
    expect(
      turn().getByText(en.snap.onlyOn(wrong, 'middle')),
    ).toBeInTheDocument();
    expect(screen.getByText('1, +0:03')).toBeInTheDocument();
    await user.click(
      card('Middle card').getByRole('button', {
        name: nameOf(matchNow(model)!),
      }),
    );
    expect(turn().getByText('A match!')).toBeInTheDocument();
    await pause(MATCH_FLASH_MS);
    expect(turn().getByText('Spot the match')).toBeInTheDocument();
  });

  it('counts a taken card’s wrong tap once while the match is up', async () => {
    await startRun();
    const wrong = middleOf(model).find((s) => !model.mine.includes(s))!;
    await user.click(
      card('Middle card').getByRole('button', { name: nameOf(wrong) }),
    );
    await pause(WRONG_FLASH_MS);
    expect(stat('Wrong taps')).toBe('1, +0:03');
    await user.click(
      card('Middle card').getByRole('button', {
        name: nameOf(matchNow(model)!),
      }),
    );
    expect(turn().getByText('A match!')).toBeInTheDocument();
    expect(stat('Wrong taps')).toBe('1, +0:03');
    await pause(MATCH_FLASH_MS);
    expect(stat('Wrong taps')).toBe('1, +0:03');
  });

  it('ends after thirty cards, keeps the best and copies a challenge', async () => {
    await startRun();
    const match = matchNow(model)!;
    await user.click(
      card('Your card').getByRole('button', { name: nameOf(match) }),
    );
    expect(turn().getByText('A match!')).toBeInTheDocument();
    expect(
      card('Middle card').getByRole('button', {
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
    // The last two cards stay as the run ended, their match marked.
    expect(turn().getByText('All 30 cards taken')).toBeInTheDocument();
    expect(
      card('Middle card').getByLabelText(
        `${nameOf(matchNow(model)!)}, on both cards`,
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { name: 'Challenge a friend' }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Copy challenge link' }),
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
