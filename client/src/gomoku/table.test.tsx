import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '../i18n';
import { GomokuTable } from './table';
import styles from './table.module.css';

const wrapper = LocaleProvider;

const board = { stones: Array(225).fill(null), label: 'Board' };

/** The table's actions row, or null where it has none. */
const actionsRow = (container: HTMLElement) =>
  container.querySelector(`.${styles.actions}`);

describe('a Gomoku table', () => {
  it('leaves out an empty actions row', () => {
    const { container } = render(
      <GomokuTable board={board} seats={[]} phone />,
      { wrapper },
    );
    expect(actionsRow(container)).toBeNull();
  });

  it('holds the actions row while it is empty, for the buttons to come', () => {
    const { container, rerender } = render(
      <GomokuTable board={board} seats={[]} phone holdActions />,
      { wrapper },
    );
    expect(actionsRow(container)).toBeEmptyDOMElement();

    // The results fill the same row: the board above it does not move.
    const held = actionsRow(container);
    rerender(
      <GomokuTable
        board={board}
        seats={[]}
        phone
        holdActions
        actions={<button type="button">Play again</button>}
      />,
    );
    expect(actionsRow(container)).toBe(held);
    expect(held).toHaveTextContent('Play again');
  });
});
