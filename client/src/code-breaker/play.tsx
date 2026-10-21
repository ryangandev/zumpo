import { useState, type ReactNode } from 'react';
import { useMessages, type Messages } from '../i18n';
import { CodeBoard, DigitPad, Notice, type CodeBoardRow } from '../ui';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import { cx } from '../ui/cx';
import {
  useNoteOverBoard,
  useTypingKeys,
  type Typing,
} from '../shell/board-typing';
import { cycleNote, DIGIT, type Draft, type Notes } from './draft';
import styles from './play.module.css';

/** What a checked guess said, for a screen reader: "4 1 7 0: 2 in place, 2 elsewhere". */
export const describeRow = (row: CodeBoardRow, m: Messages) =>
  m.codeBreaker.row(row.guess, m.ui.code.mark(row.mark.right, row.mark.moved));

/**
 * CB02-CB05, CB09, CB16, CB18: your board, a prompt under it or what is
 * wrong with the row, and the pad with its notes, which a finished board
 * does without. A phone, and a room's board while guessing, have no prompt;
 * what is wrong is said over the board.
 *
 * With Notes on, a digit key, on the pad or a real keyboard, notes its digit
 * instead of typing it; Enter and Backspace still act on the row.
 */
export function PlayArea({
  rows,
  draft,
  problem,
  prompt,
  typing,
  notes,
  onNotes,
  ruledOut,
  pad,
  disabled,
  className,
  children,
}: {
  rows: readonly CodeBoardRow[];
  draft: Draft;
  /** Why the last Enter was turned back: "Already guessed". */
  problem: string | null;
  /** A line under the board when nothing is wrong; none on a phone. */
  prompt?: ReactNode;
  typing: Typing;
  notes: Notes;
  onNotes: (notes: Notes) => void;
  /** Digits the game knows are out, dimmed on the pad: on your own only. */
  ruledOut?: readonly string[];
  /** False once the board is done. */
  pad: boolean;
  /** A paused board: reconnecting, or a guess on its way. */
  disabled?: boolean;
  className?: string;
  /** Beside the board: a room's others (CB09). */
  children?: ReactNode;
}) {
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  const [noting, setNoting] = useState(false);
  const { play, over } = useNoteOverBoard(problem ? rows.length : null);
  const onDigit = (digit: string) =>
    noting ? onNotes(cycleNote(notes, digit)) : typing.onKey(digit);
  useTypingKeys({ ...typing, onKey: onDigit }, pad && !disabled, DIGIT);
  const last = rows.at(-1);
  const line =
    prompt !== undefined && noting && pad ? m.codeBreaker.notesPrompt : prompt;
  const board = (
    <CodeBoard
      rows={rows}
      typed={pad ? draft.typed : ''}
      nudge={draft.nudge}
      size="compact"
      label={m.codeBreaker.yourGuesses}
      describe={(row) => describeRow(row, m)}
    />
  );
  return (
    <div ref={play} className={cx(styles.play, className)}>
      {children ? (
        <div className={styles.boards}>
          {board}
          {children}
        </div>
      ) : (
        board
      )}
      {phone || line === undefined ? (
        // With nothing to say under the board, or no room for it on a phone,
        // there is no line: a row turned back is said over the board, so the
        // pad stays where it is.
        problem && (
          <div ref={over} className={styles.over}>
            <Notice tone="error">{problem}</Notice>
          </div>
        )
      ) : (
        // One line under the board, as tall as a note while the pad is up,
        // so the pad never moves when a row is turned back.
        <div className={cx(styles.line, pad && styles.steady)}>
          {problem ? (
            <Notice tone="error">{problem}</Notice>
          ) : (
            <p className={styles.prompt}>{line}</p>
          )}
        </div>
      )}
      {pad && (
        <DigitPad
          notes={notes}
          ruledOut={ruledOut}
          noting={noting}
          onNoting={() => setNoting(!noting)}
          onDigit={onDigit}
          onDelete={typing.onDelete}
          onEnter={typing.onEnter}
          layout={phone ? 'phone' : 'desktop'}
          disabled={disabled}
          className={styles.pad}
        />
      )}
      <p className={styles.announce} aria-live="polite">
        {last ? describeRow(last, m) : ''}
      </p>
    </div>
  );
}
