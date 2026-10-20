import type { CanvasStroke, Coordinate } from '../../../shared/wire-types';

/**
 * What changed, so a canvas can draw just the new segment of a stroke rather
 * than repaint everything on every pointer move.
 */
export type CanvasChange =
  { type: 'reset' } | { type: 'extend'; stroke: CanvasStroke; from: number };

type Listener = (change: CanvasChange) => void;

/**
 * The shared drawing of a Draw & Guess room: the strokes so far, kept outside
 * React because a stroke grows dozens of times a second.
 *
 * The server streams other players' strokes and never echoes the drawer's own,
 * so the drawer's input is applied here directly as well as sent.
 */
export class CanvasStream {
  private strokes: CanvasStroke[] = [];
  private readonly listeners = new Set<Listener>();

  snapshot(): readonly CanvasStroke[] {
    return this.strokes;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  sync(strokes: CanvasStroke[]): void {
    this.strokes = strokes.map((stroke) => ({
      ...stroke,
      points: [...stroke.points],
    }));
    this.emit({ type: 'reset' });
  }

  start(point: Coordinate, color: string, size: number): void {
    const stroke = { color, size, points: [point] };
    this.strokes.push(stroke);
    this.emit({ type: 'extend', stroke, from: 0 });
  }

  /**
   * The next point of the last stroke, as the server records it: a page that
   * synced mid-stroke goes on with the stroke it was sent, so an undo takes
   * the whole of it away here too.
   */
  move(point: Coordinate): void {
    const stroke = this.strokes.at(-1);
    if (!stroke) return;
    stroke.points.push(point);
    this.emit({ type: 'extend', stroke, from: stroke.points.length - 2 });
  }

  /** A stroke is complete with its last point; nothing to close. */
  end(): void {}

  undo(): void {
    this.strokes.pop();
    this.emit({ type: 'reset' });
  }

  clear(): void {
    this.sync([]);
  }

  private emit(change: CanvasChange): void {
    for (const listener of this.listeners) listener(change);
  }
}
