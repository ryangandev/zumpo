import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onPhone } from '../../tests/phone';
import { renderApp } from '../../tests/render-app';
import { MISS_SHOWN_MS, newGame } from './game';

const SEED = 'k3f9x2';
const deck = newGame('Small', SEED).deck;

/** The places of each symbol's two cards, in the deck's order. */
const pairs = [
  ...deck
    .reduce(
      (places, symbol, index) =>
        places.set(symbol, [...(places.get(symbol) ?? []), index]),
      new Map<number, number[]>(),
    )
    .values(),
];

const turn = () => within(screen.getByRole('region', { name: 'Turn' }));

/**
 * A card by its place on the 4 × 4 board: the button that flips it while it
 * is face down, and the card itself once it is up.
 */
const card = (index: number) =>
  screen.getByLabelText(
    new RegExp(`^Row ${Math.floor(index / 4) + 1}, column ${(index % 4) + 1}:`),
  );

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
});

afterEach(() => {
  vi.useRealTimers();
});

async function flipCard(index: number) {
  await user.click(card(index));
}

/** Starts the challenge deck `SEED` deals on a Small board. */
async function startChallenge() {
  const view = await renderApp(`/games/pairs/solo?board=Small&seed=${SEED}`);
  await user.click(screen.getByRole('button', { name: 'Start' }));
  return view;
}

describe('Pairs on your own', () => {
  it('picks a board and flips cards with Chinese instructions', async () => {
    await renderApp('/games/pairs/solo', { locale: 'zh' });
    expect(screen.getByText('选一个棋盘。')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /小 · 4 × 4/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText('18 对。暂无最佳成绩')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '开始' }));
    expect(screen.getByRole('grid', { name: '卡牌' })).toBeInTheDocument();
    expect(screen.getByText('第 1 次翻牌')).toBeInTheDocument();
    expect(screen.getByText('翻一张牌')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /背面朝上$/ })[0]!);
    expect(screen.getByText('找到它的另一张')).toBeInTheDocument();
    expect(screen.getByText('你在哪里见过它？')).toBeInTheDocument();
  });

  it('is offered on the game’s page', async () => {
    await renderApp('/games/pairs');
    expect(screen.getByRole('link', { name: 'Play solo' })).toHaveAttribute(
      'href',
      '/games/pairs/solo',
    );
  });

  it('offers both boards on a first visit', async () => {
    const { router } = await renderApp('/games/pairs/solo', {
      firstVisit: true,
    });
    expect(router.state.location.pathname).toBe('/games/pairs/solo');
    expect(screen.getByText('Pick a board.')).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /Small · 4 × 4/ }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('18 pairs. No best yet')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Large · 6 × 6/ }));
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getAllByRole('gridcell')).toHaveLength(36);
    expect(turn().getByText('Turn 1')).toBeInTheDocument();
    expect(turn().getByText('Flip a card')).toBeInTheDocument();
  });

  it('plays a challenge’s own deck, on its own board', async () => {
    await renderApp(`/games/pairs/solo?board=Small&seed=${SEED}`);
    expect(
      screen.getByText(/^A friend sent you this deck\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Large/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await flipCard(pairs[0]![0]!);
    expect(card(pairs[0]![0]!)).toHaveAccessibleName(
      /: (Circle|Ring|Half|Square|Diamond|Triangle|Star|Sparkle|Hexagon) /,
    );
  });

  it('shows a miss for a moment, then turns it back', async () => {
    await startChallenge();
    await flipCard(pairs[0]![0]!);
    expect(turn().getByText('Find its pair')).toBeInTheDocument();
    expect(turn().getByText('Where did you see it?')).toBeInTheDocument();

    await flipCard(pairs[1]![0]!);
    expect(turn().getByText('Not a pair')).toBeInTheDocument();
    expect(turn().getByText('Turn 1')).toBeInTheDocument();

    await act(() => vi.advanceTimersByTime(MISS_SHOWN_MS));
    expect(turn().getByText('Flip a card')).toBeInTheDocument();
    expect(turn().getByText('Turn 2')).toBeInTheDocument();
    expect(card(pairs[0]![0]!)).toHaveAccessibleName(/face down$/);
  });

  it('clears the board, keeps the best and copies a challenge', async () => {
    await startChallenge();
    // One miss, then every pair.
    await flipCard(pairs[0]![0]!);
    await flipCard(pairs[1]![0]!);
    await act(() => vi.advanceTimersByTime(MISS_SHOWN_MS));
    for (const [a, b] of pairs) {
      await flipCard(a!);
      await flipCard(b!);
    }

    expect(
      screen.getByRole('heading', { name: '8 pairs in 9 turns.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your first Small board cleared on this device.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Board cleared')).toBeInTheDocument();
    expect(screen.getByText('8 pairs in a row')).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem('zumpo:solo:best:pairs:Small')!),
    ).toMatchObject({
      turns: 9,
    });
    expect(screen.getByText('9 turns')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Challenge a friend' }),
    );
    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}/games/pairs/solo?board=Small&seed=${SEED}`,
    );

    // Play again is a new deck, not the challenge again.
    await user.click(screen.getByRole('button', { name: 'Play again' }));
    expect(turn().getByText('Turn 1')).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(16);
  });

  it('puts the pairs found on the turn bar on a phone', async () => {
    onPhone();
    await startChallenge();
    await flipCard(pairs[0]![0]!);
    expect(turn().getByText('0 of 8 pairs')).toBeInTheDocument();
    expect(screen.queryByText('This game')).toBeNull();
  });
});
