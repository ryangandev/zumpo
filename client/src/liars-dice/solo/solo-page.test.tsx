import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seededRandom } from '../../../../shared/seed';
import { renderApp } from '../../tests/render-app';
import { BOT_TURN_MS } from './game';
import { readRecord, writePicks } from './record';

// The same dice and the same bots every run.
vi.mock('./random', () => {
  let random = seededRandom(1);
  return {
    soloRandom: () => random(),
    reseed: (seed: number) => {
      random = seededRandom(seed);
    },
  };
});
const { reseed } = (await import('./random')) as unknown as {
  reseed: (seed: number) => void;
};

const turn = () => within(screen.getByRole('region', { name: 'Turn' }));
/** The chip picked in a group of the table picker, by its name. */
const picked = (group: string) => {
  const chip = within(screen.getByRole('group', { name: group })).getByRole(
    'button',
    { pressed: true },
  );
  return chip.getAttribute('aria-label') ?? chip.textContent;
};

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  localStorage.clear();
  reseed(7);
  vi.useFakeTimers({ shouldAdvanceTime: true });
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Liar’s Dice on your own', () => {
  it('is offered on the game’s page', async () => {
    await renderApp('/games/liars-dice');
    expect(screen.getByRole('link', { name: 'Play solo' })).toHaveAttribute(
      'href',
      '/games/liars-dice/solo',
    );
  });

  it('starts at once on a first visit, with three bots and three dice each', async () => {
    const { router } = await renderApp('/games/liars-dice/solo', {
      firstVisit: true,
    });
    expect(router.state.location.pathname).toBe('/games/liars-dice/solo');
    expect(screen.getByText('Pick a table.')).toBeInTheDocument();
    expect(picked('Bots')).toBe('3 bots');
    expect(picked('Dice each')).toBe('3 dice');
    expect(screen.queryByText(/^Taken from/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByText('Round 1')).toBeInTheDocument();
    const cups = screen.getAllByRole('region', {
      name: /^(Pip|Juno|Otto|Remy|Wren)$/,
    });
    expect(cups).toHaveLength(3);
    const { name } = JSON.parse(localStorage.getItem('zumpo:name')!) as {
      name: string;
    };
    const yours = within(screen.getByRole('region', { name: `${name} (you)` }));
    expect(
      yours.getAllByRole('img', { name: /^[1-6](, wild)?$/ }),
    ).toHaveLength(3);
    for (const cup of cups) {
      expect(
        within(cup).getAllByRole('img', { name: 'Hidden die' }),
      ).toHaveLength(3);
    }
  });

  it('offers the last table picked first', async () => {
    writePicks({ bots: 5, dicePerPlayer: 5 });
    await renderApp('/games/liars-dice/solo');
    expect(picked('Bots')).toBe('5 bots');
    expect(picked('Dice each')).toBe('5 dice');
    expect(screen.getByText('The classic: a longer game.')).toBeInTheDocument();
  });

  it('picks a table with one tap each', async () => {
    await renderApp('/games/liars-dice/solo', { firstVisit: true });
    await user.click(screen.getByRole('button', { name: '1 bot' }));
    await user.click(screen.getByRole('button', { name: '5 dice' }));
    expect(picked('Bots')).toBe('1 bot');
    expect(screen.getByText('The classic: a longer game.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(
      screen.getAllByRole('region', { name: /^(Pip|Juno|Otto|Remy|Wren)$/ }),
    ).toHaveLength(1);
  });

  it('plays a game to its end, and keeps it on this device', async () => {
    await renderApp('/games/liars-dice/solo', { name: 'Maya' });
    await user.click(screen.getByRole('button', { name: 'Start' }));

    // You call Liar whenever you can, and open as low as you may.
    for (let step = 0; step < 400; step++) {
      if (screen.queryByRole('heading', { name: /^(You won|Out in)/ })) break;
      const next = screen.queryByRole('button', { name: 'Next round' });
      const liar = screen.queryByRole('button', { name: 'Call Liar' });
      const open = screen.queryByRole('button', { name: /^Bid / });
      if (next) await user.click(next);
      else if (liar) await user.click(liar);
      else if (open) await user.click(open);
      else await act(() => vi.advanceTimersByTime(BOT_TURN_MS));
    }

    expect(
      screen.getByRole('heading', { name: /^(You won in|Out in)/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('The last call')).toBeInTheDocument();
    expect(readRecord().games).toBe(1);
    // Only a win bursts into confetti.
    expect(document.querySelector('canvas') !== null).toBe(
      readRecord().wins === 1,
    );
    await user.click(screen.getByRole('button', { name: 'Play again' }));
    expect(screen.getByText('Round 1')).toBeInTheDocument();
  });

  it('waits for you, and says what a bot bid', async () => {
    await renderApp('/games/liars-dice/solo');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    for (let step = 0; step < 6; step++) {
      if (screen.queryByRole('group', { name: 'Your bid' })) break;
      await act(() => vi.advanceTimersByTime(BOT_TURN_MS));
    }
    expect(turn().getByText('Your turn')).toBeInTheDocument();
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('asks before leaving a game under way, and not after it', async () => {
    const { router } = await renderApp('/games/liars-dice/solo');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    const dialog = within(
      screen.getByRole('dialog', { name: 'Leave this game?' }),
    );
    expect(
      dialog.getByText('This game ends here, and it is not counted.'),
    ).toBeInTheDocument();
    await user.click(dialog.getByRole('button', { name: 'Leave' }));
    expect(router.state.location.pathname).toBe('/games/liars-dice');
    expect(readRecord().games).toBe(0);
  });
});
