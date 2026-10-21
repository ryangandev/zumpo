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

/** Plays the challenge deck `SEED` deals on a Small board. */
const startChallenge = () =>
  renderApp(`/games/pairs/solo?board=Small&seed=${SEED}`);

describe('Pairs on your own', () => {
  it('deals at once, with Chinese instructions', async () => {
    await renderApp('/games/pairs/solo', { locale: 'zh' });
    expect(screen.queryByRole('button', { name: '开始' })).toBeNull();
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

  it('deals a Small board on a first visit', async () => {
    const { router } = await renderApp('/games/pairs/solo', {
      firstVisit: true,
    });
    expect(router.state.location.pathname).toBe('/games/pairs/solo');
    expect(screen.getAllByRole('gridcell')).toHaveLength(16);
    expect(turn().getByText('Turn 1')).toBeInTheDocument();
    expect(turn().getByText('Flip a card')).toBeInTheDocument();
  });

  it('plays a challenge’s own deck, on its own board', async () => {
    await startChallenge();
    expect(screen.getByText('Challenge')).toBeInTheDocument();
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

  it('keeps a miss up while How to play is open', async () => {
    await startChallenge();
    await flipCard(pairs[0]![0]!);
    await flipCard(pairs[1]![0]!);
    await user.click(screen.getByRole('button', { name: 'How to play' }));
    await act(() => vi.advanceTimersByTime(MISS_SHOWN_MS * 3));
    await user.click(screen.getByRole('button', { name: 'Back to the game' }));
    expect(turn().getByText('Not a pair')).toBeInTheDocument();
    expect(card(pairs[0]![0]!)).not.toHaveAccessibleName(/face down$/);

    await act(() => vi.advanceTimersByTime(MISS_SHOWN_MS));
    expect(turn().getByText('Flip a card')).toBeInTheDocument();
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
    // A first clear is a new best too, so it is celebrated.
    expect(document.querySelector('canvas')).not.toBeNull();
    expect(screen.getByText('Board cleared')).toBeInTheDocument();
    expect(screen.getByText('8 pairs in a row')).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem('zumpo:solo:best:pairs:Small')!),
    ).toMatchObject({
      turns: 9,
    });
    expect(screen.getByText('9 turns')).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { name: 'Challenge a friend' }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Copy challenge link' }),
    );
    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}/games/pairs/solo?board=Small&seed=${SEED}`,
    );

    // Play again is a new deck, not the challenge again.
    await user.click(screen.getByRole('button', { name: 'Play again' }));
    expect(turn().getByText('Turn 1')).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(16);
  });

  it('celebrates a new best', async () => {
    localStorage.setItem(
      'zumpo:solo:best:pairs:Small',
      JSON.stringify({ turns: 12, ms: 60_000 }),
    );
    await startChallenge();
    for (const [a, b] of pairs) {
      await flipCard(a!);
      await flipCard(b!);
    }
    expect(screen.getByText(/^A new best on this device/)).toBeInTheDocument();
    expect(document.querySelector('canvas')).not.toBeNull();
  });

  it('does not celebrate a board cleared short of the best', async () => {
    localStorage.setItem(
      'zumpo:solo:best:pairs:Small',
      JSON.stringify({ turns: 4, ms: 30_000 }),
    );
    await startChallenge();
    for (const [a, b] of pairs) {
      await flipCard(a!);
      await flipCard(b!);
    }
    expect(screen.queryByText(/^A new best on this device/)).toBeNull();
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('changes the board at the end, keeps it, and leaves without asking', async () => {
    const { router } = await startChallenge();
    for (const [a, b] of pairs) {
      await flipCard(a!);
      await flipCard(b!);
    }
    await user.click(screen.getByRole('button', { name: 'Change board' }));
    const dialog = within(
      screen.getByRole('dialog', { name: 'Pick a board.' }),
    );
    expect(
      dialog.getByRole('radio', { name: /Small · 4 × 4/ }),
    ).toHaveAttribute('aria-checked', 'true');
    await user.click(dialog.getByRole('radio', { name: /Large · 6 × 6/ }));
    await user.click(dialog.getByRole('button', { name: 'Play' }));
    // A challenge is played once: the next deck is a new one.
    expect(router.state.location.search).toBe('');
    expect(screen.getAllByRole('gridcell')).toHaveLength(36);

    await flipCard(0);
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe('/games/pairs');
    // The router renders a navigation as a transition; act sees it through.
    await act(() => router.navigate('/games/pairs/solo'));
    expect(screen.getAllByRole('gridcell')).toHaveLength(36);
  });

  it('puts the pairs found on the turn bar on a phone', async () => {
    onPhone();
    await startChallenge();
    await flipCard(pairs[0]![0]!);
    expect(turn().getByText('0 of 8 pairs')).toBeInTheDocument();
    expect(screen.queryByText('This game')).toBeNull();
  });
});
