import { itemAt } from '../../../../shared/list';
import { SNAP_SYMBOL_SIZE, snapSymbols } from '../generated/snap-symbols';

export interface SnapSymbolProps {
  /** Which of the 31 symbols, in their Figma order (shared/snap.ts). */
  symbol: number;
  /** Pixels; the design draws it at 40. A card scales it to its spot. */
  size?: number;
  className?: string;
}

/** Zumpo/Snap symbol: one of the 31 shapes on a Snap card. */
export function SnapSymbol({
  symbol,
  size = SNAP_SYMBOL_SIZE,
  className,
}: SnapSymbolProps) {
  const { parts, x, y, fill } = itemAt(snapSymbols, symbol);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${SNAP_SYMBOL_SIZE} ${SNAP_SYMBOL_SIZE}`}
      aria-hidden="true"
    >
      <g transform={`translate(${x} ${y})`} style={{ fill }}>
        {parts.map(({ d, evenOdd }) => (
          <path key={d} d={d} fillRule={evenOdd ? 'evenodd' : 'nonzero'} />
        ))}
      </g>
    </svg>
  );
}
