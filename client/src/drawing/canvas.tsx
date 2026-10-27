import { itemAt } from '../../../shared/list';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type PointerEvent,
  type ReactNode,
} from 'react';
import type { CanvasStroke, Coordinate } from '../../../shared/wire-types';
import type { CanvasChange, CanvasStream } from '../net/canvas-stream';
import { useHeightLeft } from '../shell/use-height-left';
import { cx } from '../ui/cx';
import { useMessages } from '../i18n';
import styles from './canvas.module.css';

/** The shared bitmap every client draws in, whatever its size on screen. */
export const CANVAS_WIDTH = 798;
export const CANVAS_HEIGHT = 598;

export interface Brush {
  color: string;
  size: number;
}

export interface DrawingCanvasProps {
  stream: CanvasStream;
  /** Set for the drawer while drawing: pointer input draws with it. */
  brush?: Brush;
  onStart?: (point: Coordinate, brush: Brush) => void;
  /** The next point of the stroke just started, which keeps its brush. */
  onMove?: (point: Coordinate) => void;
  onEnd?: () => void;
  /** Laid over the canvas: word choices, or a note while it is empty. */
  overlay?: ReactNode;
}

/**
 * The drawing canvas every drawing game shares: a white sheet in the bitmap's
 * proportions that paints a stream's strokes, and takes the drawer's pointer,
 * mouse, pen or finger alike.
 */
export function DrawingCanvas({
  stream,
  brush,
  onStart,
  onMove,
  onEnd,
  overlay,
}: DrawingCanvasProps) {
  const m = useMessages();
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<Coordinate | null>(null);

  // Size the bitmap to the element's pixels, so lines stay crisp, and repaint
  // everything whenever the size or the strokes change wholesale.
  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const context = element.getContext('2d');
    if (!context) return;

    const repaint = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(element.clientWidth * ratio));
      const height = Math.max(1, Math.round(element.clientHeight * ratio));
      if (element.width !== width || element.height !== height) {
        element.width = width;
        element.height = height;
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, width, height);
      context.setTransform(
        width / CANVAS_WIDTH,
        0,
        0,
        height / CANVAS_HEIGHT,
        0,
        0,
      );
      for (const stroke of stream.snapshot()) paint(context, stroke, 0);
    };

    const onChange = (change: CanvasChange) => {
      if (change.type === 'reset') repaint();
      else paint(context, change.stroke, change.from);
    };

    repaint();
    const unsubscribe = stream.subscribe(onChange);
    const observer = new ResizeObserver(repaint);
    observer.observe(element);
    return () => {
      unsubscribe();
      observer.disconnect();
    };
  }, [stream]);

  // A turn ending mid-stroke ends the stroke.
  useEffect(() => {
    if (!brush && drawing.current) {
      drawing.current = false;
      onEnd?.();
    }
  }, [brush, onEnd]);

  const pointOf = (event: { clientX: number; clientY: number }): Coordinate => {
    const rect = canvas.current!.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const y = ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
    return {
      x: Math.round(Math.min(CANVAS_WIDTH, Math.max(0, x)) * 10) / 10,
      y: Math.round(Math.min(CANVAS_HEIGHT, Math.max(0, y)) * 10) / 10,
    };
  };

  const down = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!brush || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const point = pointOf(event);
    last.current = point;
    onStart?.(point, brush);
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!brush || !drawing.current) return;
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [
      event.nativeEvent,
    ];
    for (const sample of events.length ? events : [event.nativeEvent]) {
      const point = pointOf(sample);
      const previous = last.current;
      // Under a bitmap pixel apart adds nothing but traffic.
      if (
        previous &&
        Math.abs(point.x - previous.x) < 1 &&
        Math.abs(point.y - previous.y) < 1
      ) {
        continue;
      }
      last.current = point;
      onMove?.(point);
    }
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    onEnd?.();
  };

  return (
    <div className={styles.sheet}>
      <canvas
        ref={canvas}
        className={cx(styles.canvas, brush && styles.drawable)}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        role="img"
        aria-label={brush ? m.ui.drawing.canvas : m.ui.drawing.image}
      />
      {overlay && <div className={styles.overlay}>{overlay}</div>}
    </div>
  );
}

/** Paints a stroke from point `from` on: the whole stroke, or its new end. */
function paint(
  context: CanvasRenderingContext2D,
  stroke: CanvasStroke,
  from: number,
) {
  const { points } = stroke;
  const [first] = points;
  if (!first) return;
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.lineWidth = stroke.size;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (points.length === 1) {
    context.beginPath();
    context.arc(first.x, first.y, stroke.size / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.beginPath();
  const start = itemAt(points, Math.max(0, from));
  context.moveTo(start.x, start.y);
  for (let index = Math.max(0, from) + 1; index < points.length; index += 1) {
    const point = itemAt(points, index);
    context.lineTo(point.x, point.y);
  }
  context.stroke();
}

/**
 * Where a sheet is played, or a drawing shown to work from. A phone plays on
 * one screen (play-board.tsx), so here the sheet keeps its 798 × 598
 * proportions in the height the controls leave it: as wide as the column, or
 * as tall as the room where that is less, but a sheet to draw on never
 * smaller than 5/8 of its column or 128 px tall, whichever is less: a phone
 * too short for that scrolls, and
 * the game keeps its turn in view (useTurnInView). Wider, it ends inside the
 * window with what follows it, such as Done (useHeightLeft), and a sheet to
 * draw on is never narrower than 40% of its column. A drawing only `shown`,
 * to work from, has no floor at any width.
 */
export function PlaySheet({
  children,
  shown = false,
  align = 'center',
}: {
  children: ReactNode;
  shown?: boolean;
  /**
   * Where on a phone the sheet stands in the height it is given, when that
   * is more than its 4:3 needs: centred, or at the top, right under what is
   * above it.
   */
  align?: 'center' | 'start';
}) {
  const box = useRef<HTMLDivElement>(null);
  useHeightLeft(box, true, true);
  return (
    <div
      ref={box}
      className={cx(
        styles.playSheet,
        shown && styles.shown,
        align === 'start' && styles.start,
      )}
      data-play-board=""
      data-play-grows={shown ? undefined : ''}
    >
      <div className={styles.fit}>{children}</div>
    </div>
  );
}
