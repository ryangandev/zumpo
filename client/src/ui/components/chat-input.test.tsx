import { LocaleProvider } from '../../i18n';
import { render as renderRaw, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CHAT_MAX_LENGTH, ChatInput } from './chat-input';

const render = (ui: Parameters<typeof renderRaw>[0]) =>
  renderRaw(ui, { wrapper: LocaleProvider });

describe('ChatInput', () => {
  it('sends the trimmed message on Enter and clears the box', async () => {
    const onSend = vi.fn<(text: string) => void>();
    render(<ChatInput onSend={onSend} />);
    const box = screen.getByRole('textbox', { name: 'Message' });
    await userEvent.type(box, '  a turtle?  {Enter}');
    expect(onSend).toHaveBeenCalledExactlyOnceWith('a turtle?');
    expect(box).toHaveValue('');
  });

  it('takes the focus for a new turn, but never out of a dialog', () => {
    const { rerender } = render(
      <>
        <div role="dialog" aria-label="How to play">
          <button type="button">Got it</button>
        </div>
        <ChatInput onSend={() => {}} focusKey="turn 1" />
      </>,
    );
    const box = screen.getByRole('textbox', { name: 'Message' });
    expect(box).toHaveFocus();

    screen.getByRole('button', { name: 'Got it' }).focus();
    rerender(
      <>
        <div role="dialog" aria-label="How to play">
          <button type="button">Got it</button>
        </div>
        <ChatInput onSend={() => {}} focusKey="turn 2" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Got it' })).toHaveFocus();
  });

  it('sends with the Send button too', async () => {
    const onSend = vi.fn<(text: string) => void>();
    render(<ChatInput onSend={onSend} />);
    await userEvent.type(screen.getByRole('textbox'), 'snail');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledExactlyOnceWith('snail');
  });

  it('does not send an empty message', async () => {
    const onSend = vi.fn<(text: string) => void>();
    render(<ChatInput onSend={onSend} />);
    await userEvent.type(screen.getByRole('textbox'), '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('stops at the length the server accepts', () => {
    render(<ChatInput onSend={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'maxLength',
      String(CHAT_MAX_LENGTH),
    );
  });

  it('locks with the reason in place of the placeholder', () => {
    render(<ChatInput onSend={() => {}} lockedReason="You are drawing" />);
    const box = screen.getByRole('textbox');
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute('placeholder', 'You are drawing');
    expect(
      screen.queryByRole('button', { name: 'Send' }),
    ).not.toBeInTheDocument();
  });
});
