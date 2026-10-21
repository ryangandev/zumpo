import type { CanvasStroke } from '../../../shared/wire-types';

type Listener = () => void;

/**
 * The finished drawings a room has sent this page, by id: Doodle Chain sends
 * each one once, apart from the snapshots, to whoever may see it. Ids name
 * their game, so drawings of an earlier game are never mistaken for new ones.
 */
export class DrawingStore {
  private drawings = new Map<string, readonly CanvasStroke[]>();
  private readonly listeners = new Set<Listener>();

  get(id: string): readonly CanvasStroke[] | undefined {
    return this.drawings.get(id);
  }

  /** A new map whenever a drawing arrives, which is what React compares. */
  snapshot(): ReadonlyMap<string, readonly CanvasStroke[]> {
    return this.drawings;
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  add(id: string, strokes: CanvasStroke[]): void {
    this.drawings = new Map(this.drawings).set(id, strokes);
    for (const listener of this.listeners) listener();
  }
}
