import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  CENTRE,
  columnOf,
  isOnBoard,
  pointAt,
  pointName,
  rowOf,
  SIZE,
  STAR_POINTS,
} from '../../../../shared/gomoku';
import { useMessages } from '../../i18n';
import { cx } from '../cx';
import { Stone, type StoneColor } from './stone';
import styles from './gomoku-board.module.css';

export interface GomokuBoardProps {
  /** What is on each point, read row by row from the top left. */
  stones: readonly (StoneColor | null)[];
  /** Regular has 36 px points, for a desktop; Small 22 px, for a phone. */
  size?: 'regular' | 'small';
  /** The last stone placed, which carries the coral dot. */
  last?: number | null;
  /** Each line of five that won, its points in order along it. */
  winLines?: readonly (readonly number[])[] | null;
  /** The viewer's colour, shown faint where they would play; none to only show. */
  color?: StoneColor | null;
  /**
   * A faint stone the board holds whatever the pointer does: a first tap on
   * a touch screen, or a stone sent and not yet answered.
   */
  pending?: number | null;
  /** Takes no stone for now, while keeping the focus and the faint stone. */
  disabled?: boolean;
  /** A click, a second tap on the faint stone, or Enter. */
  onPlace?: (point: number) => void;
  /** A first tap on a touch screen; without it a tap places at once. */
  onPreview?: (point: number) => void;
  /** The board's accessible name. */
  label: string;
  className?: string;
}

const STARS = new Set(STAR_POINTS);

/** 0 to 14: the rows down the board, and the columns across it. */
const LINES = Array.from({ length: SIZE }, (_, index) => index);

/** The 15 lines down and 15 across, one unit apart, through every point. */
const GRID = LINES.map(
  (line) => `M${line} 0V${SIZE - 1}M0 ${line}H${SIZE - 1}`,
).join('');

/** A step of the arrow keys, in columns and in rows up the board. */
const STEPS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
};

/**
 * Zumpo/Gomoku board: 15 × 15 lines on peach, the five star points, the
 * stones, the faint stone, the focus ring (Zumpo/Point focus) and the coral
 * win line (Zumpo/Win line). The board is one control, a grid of points:
 * the arrow keys move between them, starting at the last stone or the centre,
 * and Enter or Space places a stone. Its points never remount, so the focus
 * stays on the point it was on through a move.
 */
export function GomokuBoard({
  stones,
  size = 'regular',
  last = null,
  winLines = null,
  color = null,
  pending = null,
  disabled = false,
  onPlace,
  onPreview,
  label,
  className,
}: GomokuBoardProps) {
  const m = useMessages();
  const cells = useRef<(HTMLDivElement | null)[]>([]);
  const pointer = useRef<string>('mouse');
  // Where the arrow keys have moved to; null follows the last stone.
  const [cursor, setCursor] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [keyed, setKeyed] = useState<number | null>(null);
  const tabbable = cursor ?? last ?? CENTRE;
  const live = onPlace !== undefined && color !== null && !disabled;
  const playable = (point: number) => live && stones[point] === null;
  const won = new Set(winLines?.flat());

  // The faint stone: one the board holds, else the pointer's or the keys'.
  const faint =
    pending ??
    (hovered !== null && playable(hovered)
      ? hovered
      : keyed !== null && playable(keyed)
        ? keyed
        : null);

  const place = (point: number, confirm: boolean) => {
    if (!playable(point)) return;
    if (confirm && onPreview && pending !== point) onPreview(point);
    else onPlace?.(point);
  };

  const move = (event: KeyboardEvent<HTMLDivElement>, point: number) => {
    const step = STEPS[event.key];
    if (step) {
      event.preventDefault();
      const column = columnOf(point) + step[0];
      const row = rowOf(point) + step[1];
      if (!isOnBoard(column, row)) return;
      const next = pointAt(column, row);
      setCursor(next);
      cells.current[next]?.focus();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      place(point, false);
    }
  };

  const nameOf = (point: number) => {
    const stone = stones[point] ?? null;
    return m.ui.gomoku.point(pointName(point), stone, {
      last: point === last,
      won: won.has(point),
    });
  };

  return (
    <div className={cx(styles.frame, className)}>
      <div
        className={cx(styles.board, size === 'small' && styles.small)}
        role="grid"
        aria-label={label}
        aria-disabled={live ? undefined : true}
        onPointerLeave={() => setHovered(null)}
        onBlur={(event) => {
          // Leaving the board: the keys start again at the last stone.
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setCursor(null);
          }
        }}
      >
        <svg
          className={styles.lines}
          viewBox={`0 0 ${SIZE - 1} ${SIZE - 1}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={GRID} />
        </svg>
        {LINES.map((row) => (
          <div key={row} role="row" className={styles.row}>
            {LINES.map((column) => {
              const point = row * SIZE + column;
              const stone = stones[point] ?? null;
              return (
                <div
                  key={point}
                  ref={(cell) => {
                    cells.current[point] = cell;
                  }}
                  role="gridcell"
                  className={cx(styles.point, playable(point) && styles.open)}
                  tabIndex={point === tabbable ? 0 : -1}
                  aria-label={nameOf(point)}
                  aria-disabled={playable(point) ? undefined : true}
                  onPointerDown={(event: PointerEvent) => {
                    pointer.current = event.pointerType;
                  }}
                  onPointerEnter={(event: PointerEvent) => {
                    if (event.pointerType === 'mouse') setHovered(point);
                  }}
                  onClick={() => {
                    setCursor(point);
                    place(point, pointer.current !== 'mouse');
                  }}
                  onKeyDown={(event) => move(event, point)}
                  onFocus={(event) => {
                    setCursor(point);
                    setKeyed(isKeyFocus(event.currentTarget) ? point : null);
                  }}
                  onBlur={() => setKeyed(null)}
                >
                  {STARS.has(point) && stone === null && (
                    <span className={styles.star} />
                  )}
                  {stone !== null ? (
                    <Stone
                      color={stone}
                      size={size}
                      mark={
                        won.has(point)
                          ? 'win'
                          : point === last
                            ? 'last'
                            : 'none'
                      }
                    />
                  ) : (
                    faint === point &&
                    color !== null && <Stone color={color} size={size} ghost />
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {winLines?.map((line) => (
          <WinLine key={line.join()} line={line} />
        ))}
      </div>
    </div>
  );
}

/** Whether the focus came from the keyboard, which shows the faint stone. */
function isKeyFocus(element: Element): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return false;
  }
}

/** Zumpo/Win line: a coral bar from the first stone of a five to its last. */
function WinLine({ line }: { line: readonly number[] }) {
  const first = line[0] ?? 0;
  const end = line.at(-1) ?? first;
  const columns = columnOf(end) - columnOf(first);
  // Rows count down the board here, as the screen does.
  const rows = rowOf(first) - rowOf(end);
  return (
    <span
      className={styles.winLine}
      aria-hidden="true"
      style={
        {
          '--column': columnOf(first),
          '--row': SIZE - rowOf(first),
          '--span': Math.hypot(columns, rows),
          '--angle': `${(Math.atan2(rows, columns) * 180) / Math.PI}deg`,
        } as CSSProperties
      }
    />
  );
}
