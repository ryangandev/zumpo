import { useEffect, useLayoutEffect, useRef } from 'react';

/** What a board does with a key: one more character, one fewer, or check. */
export interface Typing {
  onKey: (key: string) => void;
  onDelete: () => void;
  /** Enter, for a board that checks a row; without it Enter is left alone. */
  onEnter?: () => void;
  /** Escape, for a board that has a way back to its start. */
  onEscape?: () => void;
}

/**
 * A real keyboard types into a board too: the keys `accepts` takes (letters
 * for Daily Word, digits for Code Breaker), Backspace, Enter and Escape,
 * unless a text field has the focus (the chat) or a key comes with Ctrl, Alt
 * or Cmd.
 * Enter on a focused button presses that button, unless something was typed
 * since the focus came to it: a tab just tapped keeps the focus, and the row
 * typed after it is what Enter is for.
 */
export function useTypingKeys(
  typing: Typing,
  enabled: boolean,
  accepts: RegExp,
) {
  const latest = useRef(typing);
  useEffect(() => {
    latest.current = typing;
  });
  useEffect(() => {
    if (!enabled) return;
    let typedSinceFocus = false;
    const onFocus = () => {
      typedSinceFocus = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input, textarea, select, [role="dialog"]'))
      ) {
        return;
      }
      const onButton =
        target instanceof HTMLElement && target.closest('button, a') !== null;
      if (event.key === 'Enter') {
        const onEnter = latest.current.onEnter;
        if (!onEnter || (onButton && !typedSinceFocus)) return;
        event.preventDefault();
        onEnter();
      } else if (event.key === 'Escape') {
        latest.current.onEscape?.();
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        typedSinceFocus = true;
        latest.current.onDelete();
      } else if (accepts.test(event.key)) {
        typedSinceFocus = true;
        latest.current.onKey(event.key.toLowerCase());
      }
    };
    window.addEventListener('focusin', onFocus);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('focusin', onFocus);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, accepts]);
}

/**
 * Puts a note over a board (its `[role="group"]`, whose children are its
 * rows) across the middle of the row under the one being fixed, so that row
 * stays readable, or of the row above it when it is the last.
 */
export function useNoteOverBoard(typedRow: number | null) {
  const play = useRef<HTMLDivElement>(null);
  const over = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const board = play.current?.querySelector('[role="group"]');
    const note = over.current;
    if (typedRow === null || !board || !note) return;
    const row = board.children[typedRow + 1] ?? board.children[typedRow - 1];
    if (row instanceof HTMLElement) {
      note.style.top = `${row.offsetTop + row.offsetHeight / 2}px`;
    }
  }, [typedRow]);
  return { play, over };
}
