import { cx } from '../cx';
import {
  LetterTile,
  type LetterTileSize,
  type LetterTileState,
} from './letter-tile';
import styles from './word-board.module.css';

/** A guess: its letters, or none on another player's board, and its marks. */
export interface WordBoardRow {
  word: string | null;
  marks: readonly ('correct' | 'present' | 'absent')[];
}

export interface WordBoardProps {
  rows: readonly WordBoardRow[];
  /** The letters typed into the next row. */
  typed?: string;
  size?: LetterTileSize;
  /** The board's accessible name: "Your guesses", "Maya’s board". */
  label: string;
  className?: string;
}

const ROWS = 6;
const LETTERS = 5;

/** Zumpo/Word board: six rows of five Letter tiles. */
export function WordBoard({
  rows,
  typed = '',
  size = 'regular',
  label,
  className,
}: WordBoardProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cx(styles.board, styles[size], className)}
    >
      {Array.from({ length: ROWS }, (_, row) => {
        const guess = rows[row];
        const open = row === rows.length;
        return (
          <div key={row} className={styles.row}>
            {Array.from({ length: LETTERS }, (_letter, index) => {
              let state: LetterTileState = 'empty';
              let letter: string | undefined;
              if (guess) {
                state = guess.marks[index] ?? 'empty';
                letter = guess.word?.[index];
              } else if (open && index < typed.length) {
                state = 'typed';
                letter = typed[index];
              }
              return (
                <LetterTile
                  key={index}
                  letter={letter}
                  state={state}
                  size={size}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
