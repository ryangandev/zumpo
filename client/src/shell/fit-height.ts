import { createContext, useContext, useLayoutEffect, useRef } from 'react';
import { ONE_COLUMN } from './use-media-query';

/**
 * The least a board is scaled to fit the window's height, which takes a
 * Medium minefield's cells to 22 px on a 720 px window: smaller than this
 * a board is hard to aim at, so the page scrolls instead.
 */
const MIN_SCALE = 0.5;

/** The scale a room's board was last fitted at, and the window it fitted. */
export interface FittedScale {
  scale: number;
  width: number;
  height: number;
}

/** Where a room's board scale is kept, and read back. */
export interface ScaleKeeper {
  get: () => FittedScale | null;
  set: (fitted: FittedScale) => void;
}

/** A keeper of no scale yet, for one room's page. */
export function scaleKeeper(): ScaleKeeper {
  let kept: FittedScale | null = null;
  return {
    get: () => kept,
    set: (fitted) => {
      kept = fitted;
    },
  };
}

/**
 * A room's board scale, kept for as long as the room's page is open
 * (RoomLayout), so a finished board drawn anew under its result can take
 * the scale the board had in play (`result`).
 */
export const KeptScale = createContext<ScaleKeeper | null>(null);

/**
 * How a board fits the window's height (useFitHeight): not at all, as a
 * board on your own (true), as a room's board in play (`room`), or as a
 * room's finished board drawn anew under its result (`result`).
 */
export type FitHeight = boolean | 'room' | 'result';

/**
 * A board with any keys under it (a word, a code, a minefield, a table of
 * cards), scaled down with every proportion kept when the page would
 * otherwise end below the window, so the last row and Enter are in view
 * without scrolling. Only beside a side column, where the board's column is
 * the page's tallest; on one column the page scrolls as it is. The element
 * is measured unscaled each time the window or the element changes size.
 * Scaled, it lays its content out wider by as much, so a board that pans or
 * a keyboard that narrows keeps its desktop layout. While it may scale, the
 * element is marked `data-fit-height`, so a page around it can tighten
 * itself on a short window (page.module.css).
 *
 * A board on your own (true) makes room for what follows it in its column,
 * and keeps its size when that grows, such as a row that comes under it at
 * the end.
 *
 * A room's board (`room`) is right under its turn bar, the element's
 * previous sibling. The bar can take a line for its hints and move the board
 * down without changing the board's size, so its height is watched too, and
 * the board measured again a frame later; the bar's height never follows the
 * board's scale. The board ends the play area: only the page's foot is made
 * room for, and the reserve the element asks for (`data-fit-reserve`, see
 * `fittedHeight`), not all that comes under the board in the stage, such as
 * a round's results or the standings at a game's end.
 *
 * A room's finished board drawn anew under its result (`result`) takes the
 * scale the room's board had in play, in this window (`KeptScale`), so it
 * keeps its size from the game to its results, and holds it until the window
 * changes. With none kept, such as for somebody who came in to watch the
 * results, it is measured as a room's board.
 *
 * `layout` names the layout the board is in, such as keys beside it or under
 * it, where that follows the window from a media query: the query changes in
 * a render after the window's resize, so a new `layout` measures afresh, and
 * a board laid out shorter may grow back.
 */
export function useFitHeight<T extends HTMLElement>(
  fit: FitHeight = true,
  layout?: unknown,
) {
  const enabled = fit !== false;
  const room = fit === 'room' || fit === 'result';
  const resume = fit === 'result';
  const ref = useRef<T>(null);
  const kept = useContext(KeptScale);
  /** Measures afresh, letting the board grow back; set while it may scale. */
  const remeasure = useRef(() => {});
  const laidOut = useRef(layout);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    // The board keeps its size as the game goes on, such as when its
    // controls go at the end; only a change of window or of layout lets it
    // grow back.
    let most = 1;
    // A finished board holds the scale its game was played at.
    const before = resume ? kept?.get() : null;
    let held =
      before != null &&
      before.width === window.innerWidth &&
      before.height === window.innerHeight;
    if (held && before) most = before.scale;
    const measure = () => {
      element.style.removeProperty('zoom');
      element.style.removeProperty('--fit-scale');
      const oneColumn = window.matchMedia(ONE_COLUMN).matches;
      element.toggleAttribute('data-fit-height', !oneColumn);
      if (oneColumn) return;
      if (!held) most = Math.min(most, heightScale(element, room));
      if (room && kept) {
        const { innerWidth: width, innerHeight: height } = window;
        kept.set({ scale: most, width, height });
      }
      if (most < 1) {
        element.style.setProperty('zoom', String(most));
        // Focus rings inside keep their on-screen width (app.css).
        element.style.setProperty('--fit-scale', String(most));
      }
    };
    const refit = () => {
      most = 1;
      held = false;
      measure();
    };
    measure();
    remeasure.current = refit;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // The bar's new height is measured a frame later, outside the observer
    // pass that reported it, so the board's new scale is never reported back
    // in the same pass.
    const bar = room ? element.previousElementSibling : null;
    let frame = 0;
    const barObserver = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    if (bar) barObserver.observe(bar);
    window.addEventListener('resize', refit);
    return () => {
      remeasure.current = () => {};
      observer.disconnect();
      barObserver.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', refit);
      element.style.removeProperty('zoom');
      element.style.removeProperty('--fit-scale');
      element.removeAttribute('data-fit-height');
    };
  }, [enabled, room, resume, kept]);

  // A new layout, which comes a render after the resize that brought it.
  useLayoutEffect(() => {
    if (laidOut.current === layout) return;
    laidOut.current = layout;
    remeasure.current();
  }, [layout]);

  return ref;
}

/**
 * How much of the page follows the element in its own column: what comes
 * after it there, and the page's foot. A column beside it, such as a side
 * column of cards longer than the board (a finished game's result, its
 * stats), is not the element's to make room for: the page scrolls for it.
 */
function belowOf(element: HTMLElement, rect: DOMRect): number {
  const pageBottom = document.documentElement.scrollHeight - window.scrollY;
  const found = columnOf(element);
  if (!found) return pageBottom - rect.bottom;
  const after = found.column.getBoundingClientRect().bottom - rect.bottom;
  return after + pageBottom - found.grid.getBoundingClientRect().bottom;
}

/**
 * What follows the element to the end of its play area: the rest of its
 * column beside a side column, such as a Done under a sheet, and the page's
 * foot. In one column, where the side's cards follow and the page scrolls to
 * them anyway, only the foot. Unlike `belowOf`, never the empty page under a
 * short page's content, which would shrink an element sized by it each time
 * it is measured.
 */
export function playAreaBelow(element: HTMLElement, rect: DOMRect): number {
  const found = columnOf(element);
  const after = found
    ? found.column.getBoundingClientRect().bottom - rect.bottom
    : 0;
  return after + pageFoot(element);
}

/** The element's column in a grid of columns around it, and that grid. */
function columnOf(
  element: HTMLElement,
): { column: HTMLElement; grid: HTMLElement } | null {
  let column: HTMLElement = element;
  for (
    let parent = element.parentElement;
    parent;
    column = parent, parent = parent.parentElement
  ) {
    const tracks = getComputedStyle(parent).gridTemplateColumns;
    if (tracks && tracks !== 'none' && tracks.trim().split(/\s+/).length > 1) {
      return { column, grid: parent };
    }
  }
  return null;
}

/**
 * How much of the page follows its main content: the footer and the space
 * around it, all that a room's play area leaves under itself.
 */
export function pageFoot(element: HTMLElement): number {
  const main = element.closest('main') ?? document.body;
  const pageBottom = document.documentElement.scrollHeight - window.scrollY;
  return pageBottom - main.getBoundingClientRect().bottom;
}

/**
 * The largest scale, at most 1, at which the element and what follows it end
 * inside the window, found by trying scales: scaled, the element lays its
 * content out wider, which can make it shorter still (a Gomoku table puts
 * its seats back beside the board). Called with the element unscaled. A
 * room board ends the play area: only the page's foot follows it.
 */
function heightScale(element: HTMLElement, inRoom: boolean): number {
  const rect = element.getBoundingClientRect();
  if (rect.height === 0) return 1;
  const top = rect.top + window.scrollY;
  const below = inRoom ? pageFoot(element) : belowOf(element, rect);
  if (top + fittedHeight(element, rect) + below <= window.innerHeight) {
    return 1;
  }
  // A pixel spare, so rounding never leaves the page a pixel too tall.
  const room = window.innerHeight - top - below - 1;
  const fits = (scale: number) => {
    element.style.setProperty('zoom', String(scale));
    return (
      fittedHeight(element, element.getBoundingClientRect(), scale) <= room
    );
  };
  let low = MIN_SCALE;
  let high = 1;
  if (!fits(low)) return low;
  for (let step = 0; step < 8; step++) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  element.style.removeProperty('zoom');
  return low;
}

/**
 * The height of what is fitted: the whole element, or, where a part of it
 * is marked `data-fit-end`, down to that part's foot and the element's own
 * padding and border under it. What comes after that part, such as a round's
 * results under a Minesweeper board, comes and goes during a game, so it is
 * left out and never rescales the board. Its room is made once instead: the
 * element's `data-fit-reserve` (in px, unscaled) is left free under the
 * part, for it to grow into and to scroll within, so the page never grows
 * past the window when it comes.
 */
function fittedHeight(
  element: HTMLElement,
  rect: DOMRect,
  scale = Number(element.style.zoom || 1),
): number {
  const end = element.querySelector('[data-fit-end]');
  if (!end) return rect.height;
  const style = getComputedStyle(element);
  const foot =
    Number.parseFloat(style.paddingBottom) +
    Number.parseFloat(style.borderBottomWidth);
  const reserve = Number(element.dataset.fitReserve ?? 0);
  return footOf(end) - rect.top + (foot + reserve) * scale;
}

/** Where an element ends on screen, or its children, for one not drawn. */
function footOf(element: Element): number {
  const { height, bottom } = element.getBoundingClientRect();
  if (height > 0 || element.children.length === 0) return bottom;
  return Math.max(...[...element.children].map(footOf));
}
