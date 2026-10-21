import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seededRandom } from '../../../../shared/seed';
import { renderApp } from '../../tests/render-app';
import { BOT_TURN_MS } from './game';
import { readPicks, readRecord, writePicks } from './record';

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
/** The chip picked in a group of Change table, by its name. */
const picked = (group: string) => {
  const chip = within(
    screen.getByRole('radiogroup', { name: group }),
  ).getByRole('radio', { checked: true });
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

/** The bots' cups at the table. */
const botCups = () =>
  screen.getAllByRole('region', { name: /^(Pip|Juno|Otto|Remy|Wren)$/ });

/** Plays to the end: Liar whenever you can, and as low an opening as you may. */
async function playToEnd() {
  for (let step = 0; step < 400; step++) {
    if (screen.queryByRole('heading', { name: /^(You won|You finished)/ }))
      return;
    const next = screen.queryByRole('button', { name: 'Next round' });
    const liar = screen.queryByRole('button', { name: 'Call Liar' });
    const open = screen.queryByRole('button', { name: /^Bid / });
    if (next) await user.click(next);
    else if (liar) await user.click(liar);
    else if (open) await user.click(open);
    else await act(() => vi.advanceTimersByTime(BOT_TURN_MS));
  }
}

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
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(screen.getByText('Round 1')).toBeInTheDocument();
    const cups = botCups();
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

  it('sits at the last table picked', async () => {
    writePicks({ bots: 5, dicePerPlayer: 5 });
    await renderApp('/games/liars-dice/solo', { name: 'Maya' });
    expect(botCups()).toHaveLength(5);
    const yours = within(screen.getByRole('region', { name: 'Maya (you)' }));
    expect(
      yours.getAllByRole('img', { name: /^[1-6](, wild)?$/ }),
    ).toHaveLength(5);
  });

  it('plays a game to its end, keeps it, and changes the table with one tap each', async () => {
    await renderApp('/games/liars-dice/solo', { name: 'Maya' });
    await playToEnd();

    expect(
      screen.getByRole('heading', { name: /^(You won in|You finished)/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('The last call')).toBeInTheDocument();
    expect(readRecord().games).toBe(1);
    // Only a win bursts into confetti.
    expect(document.querySelector('canvas') !== null).toBe(
      readRecord().wins === 1,
    );
    await user.click(screen.getByRole('button', { name: 'Play again' }));
    expect(screen.getByText('Round 1')).toBeInTheDocument();
    expect(botCups()).toHaveLength(3);

    await playToEnd();
    await user.click(screen.getByRole('button', { name: 'Change table' }));
    const dialog = within(
      screen.getByRole('dialog', { name: 'Pick a table.' }),
    );
    expect(
      dialog.getByText(/^You have won [0-2] of 2 games here/),
    ).toBeInTheDocument();
    expect(picked('Bots')).toBe('3 bots');
    expect(picked('Dice each')).toBe('3 dice');
    await user.click(dialog.getByRole('radio', { name: '1 bot' }));
    await user.click(dialog.getByRole('radio', { name: '5 dice' }));
    expect(picked('Bots')).toBe('1 bot');
    expect(dialog.getByText('The classic: a longer game.')).toBeInTheDocument();
    await user.click(dialog.getByRole('radio', { name: '1 bot' }));
    await user.keyboard('{ArrowRight}');
    expect(picked('Bots')).toBe('2 bots');
    expect(dialog.getByRole('radio', { name: '2 bots' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(picked('Bots')).toBe('1 bot');
    await user.click(dialog.getByRole('button', { name: 'Play' }));
    expect(botCups()).toHaveLength(1);
    expect(readPicks()).toEqual({ bots: 1, dicePerPlayer: 5 });
  });

  it('waits for you, and says what a bot bid', async () => {
    await renderApp('/games/liars-dice/solo');
    for (let step = 0; step < 6; step++) {
      if (screen.queryByRole('group', { name: 'Your bid' })) break;
      await act(() => vi.advanceTimersByTime(BOT_TURN_MS));
    }
    expect(turn().getByText('Your turn')).toBeInTheDocument();
    expect(screen.queryByRole('timer')).toBeNull();
  });

  it('asks before leaving a game under way, and not after it', async () => {
    const { router } = await renderApp('/games/liars-dice/solo');
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

  it('holds the bots while it asks before leaving, so staying costs nothing', async () => {
    await renderApp('/games/liars-dice/solo');
    for (let step = 0; step < 6; step++) {
      if (screen.queryByRole('group', { name: 'Your bid' })) break;
      await act(() => vi.advanceTimersByTime(BOT_TURN_MS));
    }
    await user.click(screen.getAllByRole('button', { name: /^Bid / })[0]!);
    const botsTurn = screen.getByRole('region', { name: 'Turn' }).textContent;

    await user.click(screen.getByRole('button', { name: 'Leave' }));
    await act(() => vi.advanceTimersByTime(BOT_TURN_MS * 3));
    const dialog = screen.getByRole('dialog', { name: 'Leave this game?' });
    await user.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(screen.getByRole('region', { name: 'Turn' }).textContent).toBe(
      botsTurn,
    );

    await act(() => vi.advanceTimersByTime(BOT_TURN_MS));
    expect(screen.getByRole('region', { name: 'Turn' }).textContent).not.toBe(
      botsTurn,
    );
  });

  it('holds the bots while How to play is open', async () => {
    await renderApp('/games/liars-dice/solo');
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
