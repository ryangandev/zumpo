import { useRef, useState, type KeyboardEvent } from 'react';
import { itemAt } from '../../../shared/list';
import type {
  MinesweeperPickResult,
  MinesweeperRoomState,
} from '../../../shared/wire-types';
import {
  MineCell,
  PickMarker,
  type MineCellProps,
  type MineCellState,
  type PickOutcome,
} from '../ui';
import { cx } from '../ui/cx';
import { initialsOf } from '../players/avatar';
import { PlayBoard } from '../shell/play-board';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import { HIDDEN, KNOWN_MINE } from '../../../shared/minesweeper';
import { useMessages } from '../i18n';
import styles from './board.module.css';

export interface BoardProps {
  state: MinesweeperRoomState;
  /** Set while this player may pick: picks are simultaneous and final. */
  onPick?: (index: number) => void;
  /** Lays each pick of the round over its cell, during the reveal. */
  showPicks: boolean;
  /** The board of a game on: a phone fits it into its one screen. */
  inPlay?: boolean;
}

/**
 * The shared minefield of a room: each player's view of it, with every pick
 * of the round laid over its cell during the reveal.
 */
export function Board({ state, onPick, showPicks, inPlay = true }: BoardProps) {
  const { width, height, board, myPick } = state;
  const markers = showPicks ? markersByCell(state.lastRound) : new Map();

  const cellState = (index: number): MineCellState => {
    const value = itemAt(board, index);
    if (value === KNOWN_MINE) return { kind: 'mine' };
    if (value === HIDDEN) {
      return index === myPick && state.phase === 'picking'
        ? { kind: 'picked' }
        : { kind: 'hidden' };
    }
    return { kind: 'open', adjacent: value };
  };

  return (
    <MineGrid
      width={width}
      height={height}
      inPlay={inPlay}
      cell={(index) => {
        const cell = cellState(index);
        return {
          state: cell,
          onPick:
            onPick && cell.kind === 'hidden' ? () => onPick(index) : undefined,
          pick: markers.get(index),
        };
      }}
    />
  );
}

export interface MineGridProps {
  width: number;
  height: number;
  /** What a cell shows and does, and whose pick lies over it. */
  cell: (index: number) => MineGridCell;
  /**
   * The board of a game on, which a phone fits into its one screen: a Small
   * board scaled to the room left, a wider one panning within it.
   */
  inPlay?: boolean;
}

export type MineGridCell = Pick<
  MineCellProps,
  'state' | 'onPick' | 'onMark'
> & {
  /** A room's reveal: a pick laid over the cell. */
  pick?: { outcome: PickOutcome; initials: string };
};

/**
 * Any minefield, in a room or on your own. A Large board uses compact cells;
 * on a phone, a Small board is scaled to fit, and a wider one keeps
 * full-size cells and pans. The board is one Tab stop: the arrow keys move
 * between cells (Home and End along a row), and each cell takes Enter or
 * Space to pick and F to flag.
 */
export function MineGrid({
  width,
  height,
  cell,
  inPlay = false,
}: MineGridProps) {
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  // Compact cells fit a Large board on a desktop; a phone pans instead.
  const size = width > 16 && !phone ? 'compact' : 'regular';
  const pans = width > 9;
  const cells = useRef<(HTMLSpanElement | null)[]>([]);
  // The one cell the Tab key reaches, where the arrow keys last left it.
  const [cursor, setCursor] = useState(0);
  const tabbable = cursor < width * height ? cursor : 0;

  const move = (event: KeyboardEvent<HTMLSpanElement>, index: number) => {
    const row = Math.floor(index / width);
    const column = index % width;
    const target = (() => {
      switch (event.key) {
        case 'ArrowLeft':
          return column > 0 ? index - 1 : null;
        case 'ArrowRight':
          return column < width - 1 ? index + 1 : null;
        case 'ArrowUp':
          return row > 0 ? index - width : null;
        case 'ArrowDown':
          return row < height - 1 ? index + width : null;
        case 'Home':
          return row * width;
        case 'End':
          return row * width + width - 1;
        default:
          return undefined;
      }
    })();
    if (target === undefined) return;
    event.preventDefault();
    if (target === null) return;
    setCursor(target);
    cells.current[target]?.focus();
  };

  const grid = (
    <div
      className={cx(
        styles.viewport,
        size === 'compact' && styles.compact,
        pans && styles.pans,
      )}
    >
      <div
        className={styles.board}
        role="grid"
        aria-label={m.minesweeper.boardGrid(width, height)}
        aria-rowcount={height}
        aria-colcount={width}
      >
        {Array.from({ length: height }, (_, row) => (
          <div key={row} className={styles.row} role="row">
            {Array.from({ length: width }, (_cell, column) => {
              const index = row * width + column;
              const { pick, ...props } = cell(index);
              return (
                <MineCell
                  key={column}
                  ref={(element) => {
                    cells.current[index] = element;
                  }}
                  row={row}
                  column={column}
                  size={size}
                  tabIndex={index === tabbable ? 0 : -1}
                  onKeyDown={(event) => move(event, index)}
                  onFocus={() => setCursor(index)}
                  marker={
                    pick && (
                      <PickMarker
                        outcome={pick.outcome}
                        initials={pick.initials}
                        size={size}
                      />
                    )
                  }
                  {...props}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
  // Wider screens show the board as it is, its cells' focus rings reaching
  // into the panel's padding.
  if (!inPlay || !phone) return grid;
  // A board that pans is never scaled: it scrolls, down within the room
  // left and sideways within itself.
  // It sits under the turn bar, the spare height under it, where a round's
  // results lie over the board's foot.
  return pans ? (
    <PlayBoard min={1} fitWidth={false} align="start">
      {grid}
    </PlayBoard>
  ) : (
    <PlayBoard align="start">{grid}</PlayBoard>
  );
}

/** One marker per picked cell: whose it was, or "×2" when it was shared. */
function markersByCell(picks: readonly MinesweeperPickResult[]) {
  const byCell = new Map<number, MinesweeperPickResult[]>();
  for (const pick of picks) {
    byCell.set(pick.index, [...(byCell.get(pick.index) ?? []), pick]);
  }
  const markers = new Map<number, { outcome: PickOutcome; initials: string }>();
  for (const [index, cellPicks] of byCell) {
    const outcome: PickOutcome = cellPicks.some((pick) => pick.hitMine)
      ? 'mine'
      : cellPicks.every((pick) => pick.autoPlayed)
        ? 'auto'
        : 'safe';
    markers.set(index, {
      outcome,
      initials:
        cellPicks.length > 1
          ? `×${cellPicks.length}`
          : initialsOf(itemAt(cellPicks, 0).username),
    });
  }
  return markers;
}
