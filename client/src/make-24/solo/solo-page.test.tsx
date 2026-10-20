import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Step } from '../../../../shared/make-24';
import { stepsToSolve } from '../../tests/make-24';
import { onPhone } from '../../tests/phone';
import { renderApp } from '../../tests/render-app';
import { newRun, RUN_HANDS, SKIPPED_PAUSE_MS, SOLVED_PAUSE_MS } from './run';

const SEED = 'k3f9x2';
const deals = newRun(SEED, 0).deals;

const SIGNS = { '+': 'plus', '-': 'minus', '*': 'times', '/': 'divided by' };

const turn = () => within(screen.getByRole('region', { name: 'Turn' }));

/** The cards on the table, in order. */
const cards = () => screen.getAllByRole('button', { name: /^-?\d/ });

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
});

afterEach(() => {
  vi.useRealTimers();
});

async function take({ left, op, right }: Step) {
  const before = cards();
  await user.click(before[left]!);
  await user.click(screen.getByRole('button', { name: SIGNS[op] }));
  await user.click(before[right]!);
}

async function solve(deal: readonly number[]) {
  for (const step of stepsToSolve(deal)) await take(step);
}

const pause = (ms: number) => act(() => vi.advanceTimersByTime(ms));

/** Starts the run `SEED` deals. */
async function startRun() {
  const view = await renderApp(`/games/make-24/solo?seed=${SEED}`);
  await user.click(screen.getByRole('button', { name: 'Start' }));
  return view;
}

describe('Make 24 on your own', () => {
  it('is offered on the game’s page', async () => {
    await renderApp('/games/make-24');
    expect(screen.getByRole('link', { name: 'Play solo' })).toHaveAttribute(
      'href',
      '/games/make-24/solo',
    );
  });

  it('starts on a first visit when asked', async () => {
    const { router } = await renderApp('/games/make-24/solo', {
      firstVisit: true,
    });
    expect(router.state.location.pathname).toBe('/games/make-24/solo');
    expect(screen.getByText('Ten hands, one clock.')).toBeInTheDocument();
    expect(screen.getByText('Not yet')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Turn' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(turn().getByText('Hand 1 of 10')).toBeInTheDocument();
    expect(turn().getByText('Make 24')).toBeInTheDocument();
    expect(cards()).toHaveLength(4);
  });

  it('plays a challenge’s own hands', async () => {
    await renderApp(`/games/make-24/solo?seed=${SEED}`);
    expect(
      screen.getByText(/^A friend sent you these ten hands\./),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(cards().map((card) => card.textContent)).toEqual(
      deals[0]!.map(String),
    );
  });

  it('says what a wrong answer makes', async () => {
    await startRun();
    const wrong = [
      { left: 0, op: '+', right: 1 },
      { left: 0, op: '+', right: 1 },
      { left: 0, op: '+', right: 1 },
    ] as const;
    for (const step of wrong) await take(step);

    // 3 + 7 + 7 + 9
    expect(turn().getByText('That makes 26')).toBeInTheDocument();
    expect(screen.getByText('Not 24')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start over' }));
    expect(cards()).toHaveLength(4);
  });

  it('stops the clock on a solve, then deals the next hand', async () => {
    await startRun();
    await solve(deals[0]!);

    expect(turn().getByText('24! Nice.')).toBeInTheDocument();
    expect(turn().getByText(/^Solved in 0:0\d$/)).toBeInTheDocument();
    expect(screen.getByText('Next hand in a moment.')).toBeInTheDocument();
    expect(screen.getByText('Your steps')).toBeInTheDocument();

    await pause(SOLVED_PAUSE_MS);
    expect(turn().getByText('Hand 2 of 10')).toBeInTheDocument();
    expect(cards().map((card) => card.textContent)).toEqual(
      deals[1]!.map(String),
    );
  });

  it('shows one way through a skipped hand, for 30 seconds', async () => {
    await startRun();
    await user.click(screen.getByRole('button', { name: 'Skip, +30 s' }));

    expect(turn().getByText('Skipped')).toBeInTheDocument();
    expect(turn().getByRole('timer')).toHaveTextContent(/^00:30/);
    expect(
      screen.getByText('One way to make it. Next hand in a moment.'),
    ).toBeInTheDocument();

    await pause(SKIPPED_PAUSE_MS);
    expect(turn().getByText('Hand 2 of 10')).toBeInTheDocument();
  });

  it('ends with every hand, keeps the best and copies a challenge', async () => {
    await startRun();
    for (let hand = 0; hand < RUN_HANDS; hand++) {
      if (hand === 0) await solve(deals[hand]!);
      else {
        await user.click(screen.getByRole('button', { name: 'Skip, +30 s' }));
      }
      if (hand < RUN_HANDS - 1) {
        await pause(hand === 0 ? SOLVED_PAUSE_MS : SKIPPED_PAUSE_MS);
      }
    }

    expect(
      screen.getByRole('heading', { name: /^10 hands in 4:3\d\.$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your first run on this device.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Run complete')).toBeInTheDocument();
    expect(screen.getByText('9, +4:30')).toBeInTheDocument();

    const hands = within(
      screen.getByRole('region', { name: 'Every hand' }),
    ).getAllByRole('listitem');
    expect(hands).toHaveLength(RUN_HANDS);
    expect(hands[0]).toHaveTextContent(deals[0]!.join(' '));
    expect(hands[1]).toHaveTextContent(/Skipped · /);
    expect(localStorage.getItem('zumpo:solo:best:make-24:ten-hands')).toMatch(
      /^\d+$/,
    );
    expect(screen.getByText('Today')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Challenge a friend' }),
    );
    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}/games/make-24/solo?seed=${SEED}`,
    );
    expect(
      screen.getByRole('button', { name: 'Link copied' }),
    ).toBeInTheDocument();

    // Play again is a new run, not the challenge again.
    await user.click(screen.getByRole('button', { name: 'Play again' }));
    expect(turn().getByText('Hand 1 of 10')).toBeInTheDocument();
  });

  it('keeps to the hand on a phone', async () => {
    onPhone();
    await startRun();
    await take(stepsToSolve(deals[0]!)[0]!);
    expect(screen.queryByText('Your steps')).toBeNull();
    expect(screen.queryByText('This run')).toBeNull();
  });
});
