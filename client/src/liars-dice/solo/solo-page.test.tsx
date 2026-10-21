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
    expect(screen.getByRole('combobox', { name: 'Bots' })).toHaveTextContent(
      '3 bots',
    );

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
    expect(yours.getAllByRole('img', { name: /^[1-6]$/ })).toHaveLength(3);
    for (const cup of cups) {
      expect(
        within(cup).getAllByRole('img', { name: 'Hidden die' }),
      ).toHaveLength(3);
    }
  });

  it('says what a bid, a raise and a call are, before and during a game', async () => {
    await renderApp('/games/liars-dice/solo', { firstVisit: true });
    expect(
      screen.getByText(
        'A bid says how many dice on the whole table show one face, and ones count as any face.',
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('button', { name: 'How to play' }));
    const dialog = within(
      screen.getByRole('dialog', { name: 'How to play Liar’s Dice' }),
    );
    expect(dialog.getByText(/^A bid like “four 6s”/)).toBeInTheDocument();
    expect(
      dialog.getByText(/^On your turn, raise or call Liar/),
    ).toBeInTheDocument();
    expect(
      dialog.getByText(/^Call Liar and every cup opens\. If/),
    ).toBeInTheDocument();
    // Settings are on the start screen, not here.
    expect(dialog.queryByText('1 to 5 bots, 3 or 5 dice each')).toBeNull();
  });

  it('offers the last table picked first', async () => {
    writePicks({ bots: 5, dicePerPlayer: 5 });
    await renderApp('/games/liars-dice/solo');
    expect(screen.getByRole('combobox', { name: 'Bots' })).toHaveTextContent(
      '5 bots',
    );
    expect(
      screen.getByRole('combobox', { name: 'Dice each' }),
    ).toHaveTextContent('5 dice');
  });

  it('plays a game to its end, and keeps it on this device', async () => {
    await renderApp('/games/liars-dice/solo', { name: 'Maya' });
    await user.click(screen.getByRole('button', { name: 'Start' }));

    // You call Liar whenever you can, and open as low as you may.
    for (let step = 0; step < 400; step++) {
      if (screen.queryByRole('heading', { name: /^(You won|You finished)/ }))
        break;
      const next = screen.queryByRole('button', { name: 'Next round' });
      const liar = screen.queryByRole('button', { name: 'Call Liar' });
      const open = screen.queryByRole('button', { name: /^Bid / });
      if (next) await user.click(next);
      else if (liar) await user.click(liar);
      else if (open) await user.click(open);
      else await act(() => vi.advanceTimersByTime(BOT_TURN_MS));
    }

    expect(
      screen.getByRole('heading', { name: /^(You won in|You finished)/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('The last call')).toBeInTheDocument();
    expect(readRecord().games).toBe(1);
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

  it('holds the bots while How to play is open', async () => {
    await renderApp('/games/liars-dice/solo');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    for (let step = 0; step < 6; step++) {
      if (screen.queryByRole('group', { name: 'Your bid' })) break;
      await act(() => vi.advanceTimersByTime(BOT_TURN_MS));
    }
    await user.click(screen.getAllByRole('button', { name: /^Bid / })[0]!);
    const botsTurn = screen.getByRole('region', { name: 'Turn' }).textContent;
    expect(botsTurn).not.toMatch(/Your turn/);

    await user.click(screen.getByRole('button', { name: 'How to play' }));
    await act(() => vi.advanceTimersByTime(BOT_TURN_MS * 3));
    await user.click(screen.getByRole('button', { name: 'Back to the game' }));
    expect(screen.getByRole('region', { name: 'Turn' }).textContent).toBe(
      botsTurn,
    );

    await act(() => vi.advanceTimersByTime(BOT_TURN_MS));
    expect(screen.getByRole('region', { name: 'Turn' }).textContent).not.toBe(
      botsTurn,
    );
  });
});
