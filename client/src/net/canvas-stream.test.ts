import { describe, expect, it } from 'vitest';
import { CanvasStream, type CanvasChange } from './canvas-stream';

function watch(stream: CanvasStream) {
  const changes: CanvasChange['type'][] = [];
  stream.subscribe((change) => changes.push(change.type));
  return changes;
}

describe('the canvas stream', () => {
  it('grows a stroke point by point', () => {
    const stream = new CanvasStream();
    const changes = watch(stream);
    stream.start({ x: 0, y: 0 }, '#000', 4);
    stream.move({ x: 1, y: 1 });
    stream.end();
    stream.start({ x: 5, y: 5 }, '#f00', 8);

    expect(stream.snapshot()).toEqual([
      {
        color: '#000',
        size: 4,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
      { color: '#f00', size: 8, points: [{ x: 5, y: 5 }] },
    ]);
    expect(changes).toEqual(['extend', 'extend', 'extend']);
  });

  it('goes on with a stroke it was synced mid-way, and undoes all of it', () => {
    const stream = new CanvasStream();
    stream.sync([{ color: '#f00', size: 8, points: [{ x: 1, y: 1 }] }]);
    stream.move({ x: 2, y: 2 });
    expect(stream.snapshot()).toEqual([
      {
        color: '#f00',
        size: 8,
        points: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
      },
    ]);
    stream.undo();
    expect(stream.snapshot()).toEqual([]);
  });

  it('ignores a move with no stroke to go on with', () => {
    const stream = new CanvasStream();
    stream.move({ x: 2, y: 2 });
    expect(stream.snapshot()).toEqual([]);
  });

  it('repaints on undo, clear and sync', () => {
    const stream = new CanvasStream();
    const changes = watch(stream);
    stream.start({ x: 0, y: 0 }, '#000', 4);
    stream.end();
    stream.undo();
    expect(stream.snapshot()).toEqual([]);

    stream.sync([{ color: '#000', size: 4, points: [{ x: 1, y: 1 }] }]);
    expect(stream.snapshot()).toHaveLength(1);
    stream.clear();
    expect(stream.snapshot()).toEqual([]);
    expect(changes).toEqual(['extend', 'reset', 'reset', 'reset']);
  });

  it('keeps its own copy of synced strokes', () => {
    const stream = new CanvasStream();
    const strokes = [{ color: '#000', size: 4, points: [{ x: 1, y: 1 }] }];
    stream.sync(strokes);
    stream.start({ x: 2, y: 2 }, '#000', 4);
    expect(strokes).toHaveLength(1);
  });
});
