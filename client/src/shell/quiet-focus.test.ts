import { fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { focusQuietly, QUIET } from './quiet-focus';

const button = (name: string) => {
  const element = document.createElement('button');
  element.textContent = name;
  document.body.append(element);
  return element;
};

describe('focusQuietly', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('hands over the focus with no ring until the next key', () => {
    const title = button('Found in 4.');
    focusQuietly(title);
    expect(title).toHaveFocus();
    expect(title).toHaveAttribute(QUIET);

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(title).not.toHaveAttribute(QUIET);
  });

  it('keeps the ring hidden through a touch or a click beside it', () => {
    const undo = button('Undo');
    focusQuietly(undo);
    fireEvent.pointerDown(document.body);
    expect(undo).toHaveAttribute(QUIET);
  });

  it('forgets the mark once the focus moves on', () => {
    const first = button('First');
    const second = button('Second');
    focusQuietly(first);
    second.focus();
    expect(first).not.toHaveAttribute(QUIET);
  });
});
