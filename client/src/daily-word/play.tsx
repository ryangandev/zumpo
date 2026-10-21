import { itemAt } from '../../../shared/list';
import { useMessages, type Messages } from '../i18n';
import type { ReactNode } from 'react';
import type { DailyWordMark } from '../../../shared/wire-types';
import { keyMarks, WORD_LENGTH } from '../../../shared/daily-word';
import { Keyboard, Notice, WordBoard, type WordBoardRow } from '../ui';
import { PlayBoard, playColumn } from '../shell/play-board';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import { cx } from '../ui/cx';
import {
  useNoteOverBoard,
  useTypingKeys,
  type Typing,
} from '../shell/board-typing';
import styles from './play.module.css';

/** A Daily Word row takes letters, from either case. */
const LETTER = /^[a-z]$/i;

/** What a checked guess said, for a screen reader: "STARE: S not in the word, …". */
export function describeRow(
  word: string,
  marks: readonly DailyWordMark[],
  m: Messages,
) {
  const letters = [...word.toUpperCase()].map((letter, index) =>
    m.dailyWord.rowLetter(letter, m.ui.word.marks[itemAt(marks, index)]),
  );
  return m.dailyWord.row(word.toUpperCase(), letters);
}

/**
 * DW01-DW03, DW07, DW08, DW12, DW13: your board, a prompt under it or what
 * is wrong with the row, and the keyboard, which a finished board does
 * without. A phone, and a room's board while guessing, have no prompt; what
 * is wrong is said over the board.
 */
export function PlayArea({
  rows,
  typed,
  problem,
  prompt,
  typing,
  keyboard,
  disabled,
  beside = false,
  className,
}: {
  rows: readonly (WordBoardRow & { word: string })[];
  typed: string;
  /** Why the last Enter was turned back: "Not in the word list". */
  problem: string | null;
  /** A line under the board when nothing is wrong; none on a phone. */
  prompt?: ReactNode;
  typing: Typing;
  /** False once the board is done. */
  keyboard: boolean;
  /** A paused board: reconnecting, or a guess on its way. */
  disabled?: boolean;
  /**
   * The keyboard beside the board and its line, not under them: on your own
   * on a short wide window (SHORT_WIDE), while the keyboard is up.
   */
  beside?: boolean;
  className?: string;
}) {
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  const { play, over } = useNoteOverBoard(problem ? rows.length : null);
  useTypingKeys(typing, keyboard && !disabled, LETTER);
  const last = rows.at(-1);
  const board = (
    <WordBoard
      rows={rows}
      typed={typed.slice(0, WORD_LENGTH)}
      size={phone ? 'compact' : 'regular'}
      label={m.dailyWord.yourGuesses}
      typingTarget={keyboard}
    />
  );
  return (
    <div
      ref={play}
      className={cx(
        styles.play,
        keyboard && playColumn,
        beside && styles.beside,
        className,
      )}
    >
      {/* In play the board gives the height the keyboard needs; done, it
          stays where it was, as tall as it is. */}
      <PlayBoard
        min={0.6}
        current={rows.length}
        inPlay={keyboard}
        className={styles.board}
      >
        {board}
      </PlayBoard>
      {phone || !prompt ? (
        // With nothing to say under the board, or no room for it on a phone,
        // there is no line: a row turned back is said over the board, so the
        // keys stay where they are.
        problem && (
          <div ref={over} className={styles.over}>
            <Notice tone="error">{problem}</Notice>
          </div>
        )
      ) : (
        // One line under the board, as tall as a note while the keyboard is
        // up, so the keyboard never moves when a row is turned back.
        <div className={cx(styles.line, keyboard && styles.steady)}>
          {problem ? (
            <Notice tone="error">{problem}</Notice>
          ) : (
            <p className={styles.prompt}>{prompt}</p>
          )}
        </div>
      )}
      {keyboard && (
        <Keyboard
          className={styles.keys}
          marks={Object.fromEntries(keyMarks(rows))}
          disabled={disabled}
          onLetter={typing.onKey}
          onDelete={typing.onDelete}
          onEnter={typing.onEnter}
        />
      )}
      <p className={styles.announce} aria-live="polite">
        {last ? describeRow(last.word, last.marks, m) : ''}
      </p>
    </div>
  );
}
