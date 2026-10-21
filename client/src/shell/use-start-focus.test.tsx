import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onTouch } from '../tests/phone';
import { LANDING } from './quiet-focus';
import { useStartFocus } from './use-start-focus';

/** A stage with whatever controls a test gives it, and a chat and a dialog. */
function Stage({
  started,
  controls,
  dialog = false,
}: {
  started: boolean;
  controls: ReactNode;
  dialog?: boolean;
}) {
  const stage = useRef<HTMLDivElement>(null);
  useStartFocus(started, stage);
  return (
    <>
      <input aria-label="Chat" />
      {dialog && (
        <div role="dialog" aria-label="Leave room?">
          <button>Stay</button>
        </div>
      )}
      <div ref={stage}>{controls}</div>
    </>
  );
}

const card = <button>Card</button>;

describe('useStartFocus', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('moves the focus to the first control as the game starts', () => {
    const { rerender } = render(<Stage started={false} controls={card} />);
    expect(document.body).toHaveFocus();

    rerender(<Stage started controls={card} />);
    expect(screen.getByRole('button', { name: 'Card' })).toHaveFocus();
  });

  it('passes over text fields, including an input with no type', () => {
    render(
      <Stage
        started
        controls={
          <>
            <input aria-label="Line" />
            <input aria-label="Name" type="text" />
            <input aria-label="Ready" type="checkbox" />
          </>
        }
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Ready' })).toHaveFocus();
  });

  it('leaves the focus in an open dialog', () => {
    const { rerender } = render(
      <Stage started={false} controls={card} dialog />,
    );
    screen.getByRole('button', { name: 'Stay' }).focus();

    rerender(<Stage started controls={card} dialog />);
    expect(screen.getByRole('button', { name: 'Stay' })).toHaveFocus();
  });

  it('leaves the focus in the chat', () => {
    const { rerender } = render(<Stage started={false} controls={card} />);
    screen.getByRole('textbox', { name: 'Chat' }).focus();

    rerender(<Stage started controls={card} />);
    expect(screen.getByRole('textbox', { name: 'Chat' })).toHaveFocus();
  });

  it('waits while no control is reachable, and takes the first that comes', () => {
    const { rerender } = render(
      <Stage started controls={<button disabled>Bid</button>} />,
    );
    expect(document.body).toHaveFocus();

    rerender(<Stage started controls={<button>Bid</button>} />);
    expect(screen.getByRole('button', { name: 'Bid' })).toHaveFocus();
  });

  it('follows the controls as they change until the first key', () => {
    const { rerender } = render(
      <Stage started controls={<button key="a">Deal</button>} />,
    );
    expect(screen.getByRole('button', { name: 'Deal' })).toHaveFocus();

    // The dealt control replaces the first one: the focus follows it.
    rerender(<Stage started controls={<button key="b">Card</button>} />);
    expect(screen.getByRole('button', { name: 'Card' })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Tab' });
    rerender(<Stage started controls={<button key="c">Next</button>} />);
    expect(document.body).toHaveFocus();
  });

  it('stops after the first touch', () => {
    const { rerender } = render(
      <Stage started controls={<button disabled>Bid</button>} />,
    );
    fireEvent.pointerDown(window);

    rerender(<Stage started controls={<button>Bid</button>} />);
    expect(document.body).toHaveFocus();
  });

  it('takes the focus again when the next game starts', () => {
    const { rerender } = render(<Stage started controls={card} />);
    fireEvent.keyDown(window, { key: 'Tab' });
    screen.getByRole('button', { name: 'Card' }).blur();

    rerender(<Stage started={false} controls={<button>Play again</button>} />);
    expect(document.body).toHaveFocus();

    rerender(<Stage started controls={card} />);
    expect(screen.getByRole('button', { name: 'Card' })).toHaveFocus();
  });

  it('prefers a board typed into over the keys before it', () => {
    render(
      <Stage
        started
        controls={
          <>
            <button>Q</button>
            <div
              role="group"
              aria-label="Board"
              tabIndex={-1}
              data-start-focus
            />
          </>
        }
      />,
    );
    expect(screen.getByRole('group', { name: 'Board' })).toHaveFocus();
  });

  it('holds the focus on the turn while there is no control, then gives it to the first', () => {
    const turn = (
      <section aria-label="Turn" tabIndex={-1} data-start-fallback>
        Maya is choosing a word
      </section>
    );
    const { rerender } = render(<Stage started controls={turn} />);
    expect(screen.getByRole('region', { name: 'Turn' })).toHaveFocus();

    rerender(
      <Stage
        started
        controls={
          <>
            {turn}
            <button>Apple</button>
          </>
        }
      />,
    );
    expect(screen.getByRole('button', { name: 'Apple' })).toHaveFocus();
  });

  it('takes the focus from the heading a page landed on', () => {
    const { rerender } = render(<Stage started={false} controls={card} />);
    const heading = document.createElement('h1');
    heading.tabIndex = -1;
    heading.setAttribute(LANDING, '');
    document.body.prepend(heading);
    heading.focus();

    rerender(<Stage started controls={card} />);
    expect(screen.getByRole('button', { name: 'Card' })).toHaveFocus();
    heading.remove();
  });

  it('hands the focus over on a touch screen too, its ring hidden until a key', () => {
    onTouch();
    fireEvent.pointerDown(window);
    render(<Stage started controls={card} />);
    const button = screen.getByRole('button', { name: 'Card' });
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute('data-quiet-focus');

    // The first key shows where the focus is.
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(button).not.toHaveAttribute('data-quiet-focus');
  });
});
