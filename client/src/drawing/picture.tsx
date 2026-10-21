import type { CanvasStroke } from '../../../shared/wire-types';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from './canvas';

/**
 * A finished drawing, replayed from its strokes as vectors: sharp at any size,
 * and nothing to paint again when it scrolls or resizes.
 */
export function Picture({
  strokes,
  label,
  className,
}: {
  strokes: readonly CanvasStroke[];
  label: string;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
      role="img"
      aria-label={label}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {strokes.map((stroke, index) => {
        const [first, ...rest] = stroke.points;
        if (!first) return null;
        // A tap is a dot, as the canvas paints it.
        if (!rest.length) {
          return (
            <circle
              key={index}
              cx={first.x}
              cy={first.y}
              r={stroke.size / 2}
              fill={stroke.color}
            />
          );
        }
        const d = `M${first.x} ${first.y}${rest.map((point) => `L${point.x} ${point.y}`).join('')}`;
        return (
          <path
            key={index}
            d={d}
            stroke={stroke.color}
            strokeWidth={stroke.size}
          />
        );
      })}
    </svg>
  );
}
