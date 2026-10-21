import { LocaleProvider } from '../../i18n';
import { render as renderRaw, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DigitPad } from './digit-pad';
import { Keyboard } from './keyboard';
import { WordBoard } from './word-board';

const render = (ui: Parameters<typeof renderRaw>[0]) =>
  renderRaw(ui, { wrapper: LocaleProvider });

describe('Keyboard', () => {
  it('says what each letter is known to be, and presses keys', async () => {
    const user = userEvent.setup();
    const onLetter = vi.fn<(letter: string) => void>();
    const onEnter = vi.fn<() => void>();
    const onDelete = vi.fn<() => void>();
    render(
      <Keyboard
        marks={{ s: 'correct', t: 'present', e: 'absent' }}
        onLetter={onLetter}
        onEnter={onEnter}
        onDelete={onDelete}
      />,
    );
    const keys = within(screen.getByRole('group', { name: 'Keyboard' }));
    expect(keys.getAllByRole('button')).toHaveLength(28);
    expect(keys.getByRole('button', { name: 'S, right place' })).toBeVisible();
    expect(
      keys.getByRole('button', { name: 'T, in the word, somewhere else' }),
    ).toBeVisible();
    expect(
      keys.getByRole('button', { name: 'E, not in the word' }),
    ).toBeVisible();

    await user.click(keys.getByRole('button', { name: 'Q' }));
    await user.click(keys.getByRole('button', { name: 'Enter' }));
    await user.click(keys.getByRole('button', { name: 'Delete letter' }));
    expect(onLetter).toHaveBeenCalledWith('q');
    expect(onEnter).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });
});

describe('DigitPad', () => {
  it('keeps the focus on a key while a guess is in flight, and ignores it', async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn<() => void>();
    const pad = (disabled: boolean) => (
      <DigitPad
        onNoting={() => {}}
        onDigit={() => {}}
        onEnter={onEnter}
        onDelete={() => {}}
        disabled={disabled}
      />
    );
    const { rerender } = render(pad(false));
    const enter = screen.getByRole('button', { name: 'Enter' });
    enter.focus();
    await user.keyboard('{Enter}');
    expect(onEnter).toHaveBeenCalledOnce();

    rerender(pad(true));
    expect(enter).toHaveFocus();
    expect(enter).toHaveAttribute('aria-disabled', 'true');
    await user.keyboard('{Enter}');
    expect(onEnter).toHaveBeenCalledOnce();
  });
});

describe('WordBoard', () => {
  it('reads as its guesses and the row being typed, not its empty tiles', () => {
    render(
      <WordBoard
        label="Your guesses"
        rows={[
          {
            word: 'slate',
            marks: ['correct', 'absent', 'absent', 'present', 'absent'],
          },
        ]}
        typed="co"
      />,
    );
    const tiles = within(screen.getByRole('group', { name: 'Your guesses' }))
      .getAllByRole('img')
      .map((tile) => tile.getAttribute('aria-label'));
    expect(tiles).toEqual([
      'S, right place',
      'L, not in the word',
      'A, not in the word',
      'T, in the word, somewhere else',
      'E, not in the word',
      'C',
      'O',
    ]);
  });
});
