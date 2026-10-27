import { useId, type SVGProps } from 'react';
import type { Colour, Fill, Shape } from '../../../../shared/trios';
import { cx } from '../cx';
import styles from './trios-shape.module.css';

export interface TriosShapeProps {
  shape: Shape;
  fill: Fill;
  colour: Colour;
  /** Its box in pixels: 40 on a Regular card, 24 on a Compact, 16 on a Mini. */
  size?: number;
  /**
   * Figma's Stripes: Coarse wherever the box is 16 px or under, unless given,
   * as the gallery gives it to draw Coarse at Figma's 40 px.
   */
  stripes?: 'fine' | 'coarse';
  className?: string;
}

type SVGAttrs = Pick<SVGProps<SVGElement>, 'className'>;

/** The outline of each shape in its 40 × 40 box, as in Figma. */
function Outline({ shape, ...props }: { shape: Shape } & SVGAttrs) {
  switch (shape) {
    case 'circle':
      return <circle cx={20} cy={20} r={18} {...props} />;
    case 'square':
      return <rect x={4} y={4} width={32} height={32} rx={4} {...props} />;
    case 'triangle':
      return <path d="M20 2L38.5 35H1.5Z" {...props} />;
  }
}

/** Stripes 1.5 wide every 5, across the whole box, clipped to the shape. */
const STRIPES = {
  x: [1.75, 6.75, 11.75, 16.75, 21.75, 26.75, 31.75, 36.75],
  width: 1.5,
};

/**
 * At 16 pixels and under (a Mini card) fine stripes blur into a tint, so
 * they are fewer and heavier: 2.5 wide every 7.5, a whole pixel every three
 * at 16, which reads as stripes at 1x.
 */
const COARSE_STRIPES = { x: [2.5, 10, 17.5, 25, 32.5], width: 2.5 };
const COARSE_SIZE = 16;

/**
 * Zumpo/Trios shape: one shape of a Trios card, solid, striped or in
 * outline, in one of the three Trios colours. It scales as a whole, stroke
 * included, as an instance does in Figma.
 */
export function TriosShape({
  shape,
  fill,
  colour,
  size = 40,
  stripes = size <= COARSE_SIZE ? 'coarse' : 'fine',
  className,
}: TriosShapeProps) {
  const clip = useId();
  const lines = stripes === 'coarse' ? COARSE_STRIPES : STRIPES;
  return (
    <svg
      className={cx(styles.shape, styles[colour], className)}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
    >
      {fill === 'striped' && (
        <>
          <clipPath id={clip}>
            <Outline shape={shape} />
          </clipPath>
          <g clipPath={`url(#${clip})`}>
            {lines.x.map((x) => (
              <rect key={x} x={x} y={0} width={lines.width} height={40} />
            ))}
          </g>
        </>
      )}
      <Outline
        shape={shape}
        className={fill === 'solid' ? styles.solid : styles.outline}
      />
    </svg>
  );
}
