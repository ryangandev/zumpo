import { useMessages, type Messages } from '../../i18n';
import {
  useRef,
  type FocusEventHandler,
  type KeyboardEvent,
  type KeyboardEventHandler,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { cx } from '../cx';
import { Icon } from './icon';
import styles from './mine-cell.module.css';

/** What one client can see of a cell. */
export type MineCellState =
  | { kind: 'hidden' }
  /** Your locked pick this round; nobody else sees it. */
  | { kind: 'picked' }
  | { kind: 'open'; adjacent: number }
  /** Somebody hit a mine here; it stays on the board. On your own, a mine shown once the game is lost. */
  | { kind: 'mine' }
  /** On your own: a hidden cell you flagged. */
  | { kind: 'flag' }
  /** On your own, once lost: a flag with no mine under it. */
  | { kind: 'wrong-flag' }
  /** On your own: the mine that lost the game. */
  | { kind: 'hit' };

export interface MineCellProps {
  state: MineCellState;
  /** Compact (26 px) is for the 30 × 16 board; Regular is 44 px, 36 px on phones. */
  size?: 'regular' | 'compact';
  /**
   * Makes the cell a button: a pick in a room, a reveal or a chord on your
   * own. Whoever renders the board passes it only to cells that can act.
   */
  onPick?: () => void;
  /** Right-click or long-press: on your own, plants or lifts a flag. */
  onMark?: () => void;
  /** The cell's position, for its accessible name. */
  row: number;
  column: number;
  /** A Pick marker laid over the cell during the reveal. */
  marker?: ReactNode;
  /**
   * A board's roving tab stop: 0 on the one cell the Tab key reaches, -1 on
   * the rest, which the arrow keys reach. Without it the cell is not focusable.
   */
  tabIndex?: number;
  /** Keys the cell does not use itself, such as the arrows that move on. */
  onKeyDown?: KeyboardEventHandler<HTMLSpanElement>;
  onFocus?: FocusEventHandler<HTMLSpanElement>;
  ref?: Ref<HTMLSpanElement>;
}

/** How long a touch is held before it flags instead of opening. */
const LONG_PRESS_MS = 450;

function describe(state: MineCellState, m: Messages): string {
  switch (state.kind) {
    case 'hidden':
      return m.ui.mine.hidden;
    case 'picked':
      return m.ui.mine.picked;
    case 'mine':
      return m.ui.mine.mine;
    case 'flag':
      return m.ui.mine.flag;
    case 'wrong-flag':
      return m.ui.mine.wrongFlag;
    case 'hit':
      return m.ui.mine.hit;
    case 'open':
      return state.adjacent === 0
        ? m.ui.mine.empty
        : m.ui.mine.adjacent(state.adjacent);
  }
}

/**
 * Zumpo/Mine cell. Rooms have no flags and no separate lock button. The cell
 * is itself the control, so it keeps the focus when a pick or a reveal takes
 * its action away: Enter or Space picks, F flags.
 */
export function MineCell({
  state,
  size = 'regular',
  onPick,
  onMark,
  row,
  column,
  marker,
  tabIndex,
  onKeyDown,
  onFocus,
  ref,
}: MineCellProps) {
  const m = useMessages();
  const compact = size === 'compact';
  const iconSize = compact
    ? { picked: 12, mine: 16, flag: 12 }
    : { picked: 18, mine: 22, flag: 18 };
  const actionable = onPick != null || onMark != null;
  const className = cx(
    styles.cell,
    compact && styles.compact,
    (state.kind === 'hidden' || state.kind === 'flag') && styles.hidden,
    state.kind === 'picked' && styles.picked,
    state.kind === 'mine' && styles.mine,
    state.kind === 'hit' && styles.hitMine,
    state.kind === 'open' && state.adjacent > 0 && styles[`n${state.adjacent}`],
    actionable && styles.actionable,
    actionable &&
      (state.kind === 'hidden' || state.kind === 'flag') &&
      styles.pickable,
  );
  const label = m.ui.position(row + 1, column + 1, describe(state, m));
  const press = useLongPress(onMark);

  const keyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onPick?.();
    } else if (event.key.toLowerCase() === 'f' && !hasModifier(event)) {
      event.preventDefault();
      onMark?.();
    } else {
      onKeyDown?.(event);
    }
  };

  // A grid cell of the board's role="grid", and the whole cell is the target.
  return (
    <span
      ref={ref}
      className={className}
      role="gridcell"
      aria-label={label}
      tabIndex={tabIndex}
      // On a board you can reach, a cell with nothing to do says so.
      aria-disabled={tabIndex !== undefined && !actionable ? true : undefined}
      onKeyDown={keyDown}
      onFocus={onFocus}
      onClick={
        actionable
          ? () => {
              if (press.consumed()) return;
              onPick?.();
            }
          : undefined
      }
      onContextMenu={
        onMark
          ? (event) => {
              event.preventDefault();
              // A long touch fires contextmenu on some browsers; it already flagged.
              if (!press.consumed()) onMark();
            }
          : undefined
      }
      {...press.handlers}
    >
      {state.kind === 'picked' && <Icon glyph="lock" size={iconSize.picked} />}
      {(state.kind === 'mine' || state.kind === 'hit') && (
        <Icon glyph="mine" size={iconSize.mine} />
      )}
      {state.kind === 'flag' && (
        <Icon glyph="flag" size={iconSize.flag} className={styles.flag} />
      )}
      {state.kind === 'wrong-flag' && (
        <span className={styles.crossed}>
          <Icon glyph="flag" size={iconSize.flag} className={styles.flag} />
          <svg
            className={styles.cross}
            width={iconSize.flag}
            height={iconSize.flag}
            viewBox={`0 0 ${iconSize.flag} ${iconSize.flag}`}
            aria-hidden="true"
          >
            <line
              x1={1}
              y1={1}
              x2={iconSize.flag - 1}
              y2={iconSize.flag - 1}
              strokeWidth={compact ? 1.5 : 2}
            />
          </svg>
        </span>
      )}
      {state.kind === 'open' && state.adjacent > 0 && (
        <span aria-hidden="true">{state.adjacent}</span>
      )}
      {marker}
    </span>
  );
}

function hasModifier(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}

/**
 * A held touch calls `onLongPress` once and swallows the click that follows,
 * so a long-press flags rather than opens. Mouse and pen use right-click.
 */
function useLongPress(onLongPress?: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    /** True once after a long-press fired; resets itself. */
    consumed() {
      const was = fired.current;
      fired.current = false;
      return was;
    },
    handlers: onLongPress
      ? {
          onPointerDown(event: PointerEvent) {
            if (event.pointerType !== 'touch') return;
            fired.current = false;
            cancel();
            timer.current = setTimeout(() => {
              fired.current = true;
              onLongPress();
            }, LONG_PRESS_MS);
          },
          onPointerUp: cancel,
          onPointerLeave: cancel,
          onPointerCancel: cancel,
        }
      : {},
  };
}
