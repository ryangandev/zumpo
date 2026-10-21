import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Step } from '../../../../shared/make-24';
import { stepsToSolve } from '../../tests/make-24';
import { onPhone } from '../../tests/phone';
import { renderApp } from '../../tests/render-app';
import { newRun, RUN_HANDS, SOLVED_PAUSE_MS } from './run';

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

/** Plays the run `SEED` deals. */
const startRun = () => renderApp(`/games/make-24/solo?seed=${SEED}`);

describe('Make 24 on your own', () => {
  it('is offered on the game’s page', async () => {
    await renderApp('/games/make-24');
    expect(screen.getByRole('link', { name: 'Play solo' })).toHaveAttribute(
      'href',
      '/games/make-24/solo',
    );
  });

  it('deals at once on a first visit', async () => {
    const { router } = await renderApp('/games/make-24/solo', {
      firstVisit: true,
    });
    expect(router.state.location.pathname).toBe('/games/make-24/solo');
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(screen.getAllByText('Ten hands').length).toBeGreaterThan(0);
    expect(screen.getByText('Not yet')).toBeInTheDocument();
    expect(turn().getByText('Hand 1 of 10')).toBeInTheDocument();
    expect(turn().getByText('Make 24')).toBeInTheDocument();
    expect(cards()).toHaveLength(4);
  });

  it('plays a challenge’s own hands', async () => {
    await startRun();
    expect(screen.getByText('Challenge')).toBeInTheDocument();
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

    await pause(SOLVED_PAUSE_MS);
    expect(turn().getByText('Hand 2 of 10')).toBeInTheDocument();
    expect(cards().map((card) => card.textContent)).toEqual(
      deals[1]!.map(String),
    );
  });

  it('shows one way through a skipped hand until Next hand, for 30 seconds', async () => {
    await startRun();
    await user.click(screen.getByRole('button', { name: 'Skip, +30 s' }));

    expect(turn().getByText('Skipped')).toBeInTheDocument();
    expect(turn().getByRole('timer')).toHaveTextContent(/^0:30/);
    expect(screen.getByText('One way to make it.')).toBeInTheDocument();

    // It stays up, off the clock, until the player moves on.
    await pause(10_000);
    expect(turn().getByText('Skipped')).toBeInTheDocument();
    expect(turn().getByRole('timer')).toHaveTextContent(/^0:30/);
    const next = screen.getByRole('button', { name: 'Next hand' });
    expect(next).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(turn().getByText('Hand 2 of 10')).toBeInTheDocument();
  });

  it('plays from the keyboard', async () => {
    await startRun();
    const [first, ...rest] = stepsToSolve(deals[0]!);
    const keyOf = { '+': '+', '-': '-', '*': 'x', '/': '/' } as const;
    // A wrong first step, undone with Backspace.
    await user.keyboard('1+2');
    expect(cards()).toHaveLength(3);
    await user.keyboard('{Backspace}');
    expect(cards()).toHaveLength(4);
    await user.keyboard('1+2');
    await user.keyboard('{Escape}');
    expect(cards()).toHaveLength(4);
    for (const { left, op, right } of [first!, ...rest]) {
      await user.keyboard(`${left + 1}${keyOf[op]}${right + 1}`);
    }
    expect(turn().getByText('24! Nice.')).toBeInTheDocument();
  });

  it('leaves Enter to a focused button after keys are typed', async () => {
    await startRun();
    act(() => screen.getByRole('button', { name: 'Skip, +30 s' }).focus());
    await user.keyboard('1');
    await user.keyboard('{Enter}');
    expect(turn().getByText('Skipped')).toBeInTheDocument();
  });

  it('stops the clock while How to play is open', async () => {
    await startRun();
    await pause(1000);
    await user.click(screen.getByRole('button', { name: 'How to play' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await pause(4000);
    await user.click(screen.getByRole('button', { name: 'Back to the game' }));
    expect(turn().getByRole('timer')).toHaveTextContent(/^0:01/);
    await pause(1000);
    expect(turn().getByRole('timer')).toHaveTextContent(/^0:02/);
  });

  it('ends with every hand, keeps the best and copies a challenge', async () => {
    await startRun();
    for (let hand = 0; hand < RUN_HANDS; hand++) {
      if (hand === 0) await solve(deals[hand]!);
      else {
        await user.click(screen.getByRole('button', { name: 'Skip, +30 s' }));
      }
      if (hand === 0) await pause(SOLVED_PAUSE_MS);
      else if (hand < RUN_HANDS - 1) {
        await user.click(screen.getByRole('button', { name: 'Next hand' }));
      }
    }

    expect(
      screen.getByRole('heading', { name: /^Solved 1 of 10 in 4:3\d\.$/ }),
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

    expect(
      screen.getByRole('heading', { name: 'Challenge a friend' }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Copy challenge link' }),
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
    expect(screen.queryByText('This run')).toBeNull();
    expect(screen.queryByText(/^Keys:/)).toBeNull();
  });
});
