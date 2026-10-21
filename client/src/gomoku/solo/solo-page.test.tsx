import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../tests/render-app';
import { THINKING_MS } from './computer';
import { readPicks, readRecord, writePicks } from './record';

// The computer's best move every time, worked out here rather than in a worker.
vi.mock('./think', async () => {
  const { chooseMove } = await import('./computer');
  return {
    think: (...args: Parameters<typeof chooseMove>) =>
      Promise.resolve(chooseMove(args[0], args[1], args[2], () => 0)),
  };
});

const turn = () => within(screen.getByRole('region', { name: 'Turn' }));
const board = () => screen.getByRole('grid', { name: 'Gomoku board' });
const point = (name: string) =>
  within(board()).getByRole('gridcell', { name: new RegExp(`^${name},`) });

/** Points far from each other on the edges, which never make five. */
const SCATTERED = [
  'A1',
  'C1',
  'E1',
  'G1',
  'I1',
  'K1',
  'M1',
  'O1',
  'A3',
  'O3',
  'A5',
  'O5',
  'A15',
  'C15',
  'E15',
];

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Lets the computer think and place its stone. */
const computerMoves = () => act(() => vi.advanceTimersByTimeAsync(THINKING_MS));

describe('Gomoku on your own', () => {
  it('is offered on the game’s page', async () => {
    await renderApp('/games/gomoku');
    expect(screen.getByRole('link', { name: 'Play solo' })).toHaveAttribute(
      'href',
      '/games/gomoku/solo',
    );
  });

  it('offers Medium, playing Black, to a first game', async () => {
    await renderApp('/games/gomoku/solo');
    expect(screen.getByText('Pick a game.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Level' })).toHaveTextContent(
      'Medium',
    );
    expect(
      screen.getByRole('combobox', { name: 'Your stones' }),
    ).toHaveTextContent('Black, you move first');
  });

  it('waits for your stone, then lets the computer think before it answers', async () => {
    await renderApp('/games/gomoku/solo');
    await user.click(screen.getByRole('button', { name: 'Start' }));

    expect(screen.getByText('Move 1')).toBeInTheDocument();
    expect(turn().getByText('Your turn')).toBeInTheDocument();
    expect(turn().getByText('Place a black stone')).toBeInTheDocument();
    expect(turn().queryByRole('timer')).toBeNull();
    expect(screen.getByText('White · Medium')).toBeInTheDocument();

    await user.click(point('H8'));
    expect(turn().getByText('Computer’s turn')).toBeInTheDocument();
    expect(turn().getByText('You played H8')).toBeInTheDocument();
    expect(screen.getByText('White · thinking')).toBeInTheDocument();
    expect(point('J9')).toHaveAttribute('aria-disabled', 'true');

    await computerMoves();
    expect(screen.getByText('Move 3')).toBeInTheDocument();
    expect(turn().getByText('Your turn')).toBeInTheDocument();
    expect(turn().getByText(/^The computer played [A-O]\d+$/)).toBeVisible();
    expect(
      within(board()).getByRole('gridcell', {
        name: /white stone, last placed$/,
      }),
    ).toBeInTheDocument();
  });

  it('takes back your last stone and the computer’s answer', async () => {
    await renderApp('/games/gomoku/solo');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    // Nothing to take back before your first stone.
    expect(screen.queryByRole('button', { name: 'Take back' })).toBeNull();

    await user.click(point('H8'));
    expect(screen.queryByRole('button', { name: 'Take back' })).toBeNull();
    await computerMoves();
    await user.click(point('A1'));
    await computerMoves();
    expect(screen.getByText('Move 5')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Take back' }));
    expect(screen.getByText('Move 3')).toBeInTheDocument();
    expect(point('A1')).toHaveAccessibleName(/^A1, empty/);
    expect(turn().getByText('Your turn')).toBeInTheDocument();
    expect(turn().getByText(/^The computer played [A-O]\d+$/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Take back' }));
    expect(screen.getByText('Move 1')).toBeInTheDocument();
    expect(point('H8')).toHaveAccessibleName(/^H8, empty/);
    expect(screen.queryByRole('button', { name: 'Take back' })).toBeNull();
  });

  it('keeps the focus on the point you played from the keyboard', async () => {
    await renderApp('/games/gomoku/solo');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    while (!board().contains(document.activeElement)) await user.tab();
    expect(point('H8')).toHaveFocus();

    await user.keyboard('{ArrowLeft}{Enter}');
    expect(point('G8')).toHaveAccessibleName('G8, black stone, last placed');
    await computerMoves();
    expect(point('G8')).toHaveFocus();
  });

  it('opens on the centre when you play White', async () => {
    writePicks({ level: 'easy', color: 'white' });
    await renderApp('/games/gomoku/solo');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(turn().getByText('Computer’s turn')).toBeInTheDocument();
    await computerMoves();
    expect(point('H8')).toHaveAccessibleName('H8, black stone, last placed');
    expect(turn().getByText('Place a white stone')).toBeInTheDocument();
  });

  it('ends on the computer’s five, counts the game, and swaps colours to play again', async () => {
    await renderApp('/games/gomoku/solo');
    await user.click(screen.getByRole('button', { name: 'Start' }));

    for (const name of SCATTERED) {
      if (screen.queryByText('Computer won')) break;
      await user.click(point(name));
      await computerMoves();
    }
    expect(screen.getByText('Computer won')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /^The computer won on move \d+\.$/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /^Five in a row, from [A-O]\d+ to [A-O]\d+\. Play again and you take White\.$/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('White · five in a row')).toBeInTheDocument();
    expect(
      within(board()).getAllByRole('gridcell', {
        name: /white stone, in the winning line$/,
      }),
    ).toHaveLength(5);
    expect(readRecord().medium).toEqual({
      wins: 0,
      losses: 1,
      draws: 0,
      run: 0,
    });

    await user.click(screen.getByRole('button', { name: 'Play again' }));
    expect(readPicks()).toEqual({ level: 'medium', color: 'white' });
    expect(turn().getByText('Computer’s turn')).toBeInTheDocument();
  });

  it('offers the last picks first', async () => {
    writePicks({ level: 'hard', color: 'black' });
    await renderApp('/games/gomoku/solo');
    expect(screen.getByRole('combobox', { name: 'Level' })).toHaveTextContent(
      'Hard',
    );
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByText('White · Hard')).toBeInTheDocument();
  });
});
