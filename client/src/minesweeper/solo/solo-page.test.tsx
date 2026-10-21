import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onPhone } from '../../tests/phone';
import { renderApp } from '../../tests/render-app';
import { newGame, reveal } from './game';

/** A seeded stand-in for Math.random, so a test knows where the mines go. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** The Small board the first click at row 5, column 5 lays with `seed`. */
function smallBoard(seed: number) {
  vi.spyOn(Math, 'random').mockImplementation(seeded(seed));
  return reveal(newGame('Small'), 40, 0, seeded(seed)).layout;
}

const cell = (row: number, column: number) =>
  screen.getByRole('button', {
    name: new RegExp(`^Row ${row}, column ${column}:`),
  });

const turn = () => within(screen.getByRole('region', { name: 'Turn' }));

beforeEach(() => {
  localStorage.clear();
});

describe('Play solo', () => {
  it('starts at once, with Chinese instructions', async () => {
    const user = userEvent.setup();
    await renderApp('/games/minesweeper/solo', { locale: 'zh' });
    expect(screen.queryByRole('button', { name: '开始' })).toBeNull();
    expect(
      screen.getByRole('grid', { name: '棋盘，9 列，9 行' }),
    ).toBeInTheDocument();
    expect(screen.getByText('剩余 10 颗雷')).toBeInTheDocument();
    expect(screen.getByText('第一次点击一定安全')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '插旗' }));
    expect(screen.getByText('插旗模式：点击插旗')).toBeInTheDocument();
  });

  it('is offered on the games that have it', async () => {
    const { unmount } = await renderApp('/games/minesweeper');
    expect(screen.getByRole('link', { name: 'Play solo' })).toHaveAttribute(
      'href',
      '/games/minesweeper/solo',
    );
    unmount();
    await renderApp('/games/draw-and-guess');
    expect(screen.queryByRole('link', { name: 'Play solo' })).toBeNull();
  });

  it('plays Small on a first visit, and remembers a board changed at the end', async () => {
    const user = userEvent.setup();
    // Nothing stored yet: beforeEach clears this device.
    const layout = smallBoard(7);
    const { router } = await renderApp('/games/minesweeper/solo');
    expect(router.state.location.pathname).toBe('/games/minesweeper/solo');
    expect(
      screen.getByRole('grid', { name: 'Board, 9 by 9' }),
    ).toBeInTheDocument();

    await user.click(cell(5, 5));
    const mine = layout.indexOf(true);
    await user.click(cell(Math.floor(mine / 9) + 1, (mine % 9) + 1));
    await user.click(screen.getByRole('button', { name: 'Change board' }));
    const dialog = within(
      screen.getByRole('dialog', { name: 'Pick a board.' }),
    );
    expect(
      dialog.getByRole('radio', { name: /Small · 9 × 9/ }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(dialog.getByText('99 mines. No best yet')).toBeInTheDocument();
    await user.click(dialog.getByRole('radio', { name: /Large · 30 × 16/ }));
    await user.click(dialog.getByRole('button', { name: 'Play' }));
    expect(router.state.location.search).toBe('?board=Large');
    expect(turn().getByText('99 mines left')).toBeInTheDocument();
    expect(
      turn().getByText('Your first click is always safe'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Leave' }));
    expect(router.state.location.pathname).toBe('/games/minesweeper');
    // The router renders a navigation as a transition; act sees it through.
    await act(() => router.navigate('/games/minesweeper/solo'));
    expect(
      screen.getByRole('grid', { name: 'Board, 30 by 16' }),
    ).toBeInTheDocument();
  });
});

describe('a board on your own', () => {
  it('opens, flags and chords', async () => {
    const user = userEvent.setup();
    smallBoard(7);
    await renderApp('/games/minesweeper/solo?board=Small');

    await user.click(cell(5, 5));
    // The first click always opens an area; an empty cell has nothing to do.
    expect(
      screen.getByRole('gridcell', { name: 'Row 5, column 5: empty' }),
    ).toBeInTheDocument();
    const hidden = screen.getAllByRole('button', { name: /: hidden$/ });

    // Right-click flags and lifts a flag; a plain click leaves a flag alone.
    fireEvent.contextMenu(hidden[0]!);
    expect(turn().getByText('9 mines left')).toBeInTheDocument();
    await user.click(hidden[0]!);
    expect(hidden[0]).toHaveAccessibleName(/: flagged$/);
    fireEvent.contextMenu(hidden[0]!);
    expect(turn().getByText('10 mines left')).toBeInTheDocument();

    // Flag mode makes a click flag.
    await user.click(screen.getByRole('button', { name: 'Flag' }));
    expect(screen.getByRole('button', { name: 'Flag' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(turn().getByText('Flag mode: a click flags')).toBeInTheDocument();
    await user.click(hidden[1]!);
    expect(hidden[1]).toHaveAccessibleName(/: flagged$/);
    expect(turn().getByText('9 mines left')).toBeInTheDocument();
  });

  it('is lost on a mine, and starts again', async () => {
    const user = userEvent.setup();
    const layout = smallBoard(7);
    await renderApp('/games/minesweeper/solo?board=Small');
    await user.click(cell(5, 5));

    const mine = layout.indexOf(true);
    await user.click(cell(Math.floor(mine / 9) + 1, (mine % 9) + 1));
    expect(turn().getByText('You hit a mine')).toBeInTheDocument();
    expect(
      turn().getByText(/^You cleared [1-9]\d* of 71 safe cells$/),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('gridcell', { name: /: the mine you hit$/ }),
    ).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Row / })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(turn().getByText('10 mines left')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /: hidden$/ })).toHaveLength(
      81,
    );
    // Try again has gone with the last board; the new board has the focus.
    expect(
      screen
        .getByRole('grid', { name: 'Board, 9 by 9' })
        .contains(document.activeElement),
    ).toBe(true);
  });

  it('is won by opening every safe cell, and keeps the best', async () => {
    const user = userEvent.setup();
    const layout = smallBoard(7);
    await renderApp('/games/minesweeper/solo?board=Small');
    await user.click(cell(5, 5));
    layout.forEach((isMine, index) => {
      const target = screen.queryByRole('button', {
        name: `Row ${Math.floor(index / 9) + 1}, column ${(index % 9) + 1}: hidden`,
      });
      if (!isMine && target) fireEvent.click(target);
    });

    expect(
      screen.getByRole('heading', { name: /^Cleared in \d:\d\d\.$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your first Small board cleared on this device.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Board cleared')).toBeInTheDocument();
    expect(localStorage.getItem('zumpo:solo:best:minesweeper:Small')).toMatch(
      /^\d+$/,
    );
    expect(
      screen.getAllByRole('gridcell', { name: /: flagged$/ }),
    ).toHaveLength(10);

    await user.click(screen.getByRole('button', { name: 'Change board' }));
    expect(screen.getByText(/^10 mines\. Best: \d:\d\d$/)).toBeInTheDocument();
  });

  it('flags with Flag mode on a phone', async () => {
    onPhone();
    const user = userEvent.setup();
    smallBoard(7);
    await renderApp('/games/minesweeper/solo?board=Small');
    await user.click(cell(5, 5));
    expect(turn().getByText('Long-press to flag')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Flag' }));
    expect(turn().getByText('Flag mode: a tap flags')).toBeInTheDocument();
    // A phone keeps to the board: no side cards.
    expect(screen.queryByText('This game')).toBeNull();
  });
});
