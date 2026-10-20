import { itemAt } from '../../../../shared/list';
import { PAIRS_SYMBOL_SIZE, pairsSymbols } from '../generated/pairs-symbols';

export interface PairsSymbolProps {
  /** Which of the 18 symbols, in their Figma order. */
  symbol: number;
  /** Pixels; the design draws it at 40, 44 on a card, 30 on a compact one. */
  size?: number;
  className?: string;
}

/** "Ring Sky": a symbol's name, its shape and its colour. */
export const symbolName = (symbol: number) => itemAt(pairsSymbols, symbol).name;

export type SymbolName = (typeof pairsSymbols)[number]['name'];

/** The symbol a name stands for, for artwork and samples. */
export const symbolNamed = (name: SymbolName) =>
  pairsSymbols.findIndex((symbol) => symbol.name === name);

/** Zumpo/Pairs symbol: the face of a Pairs card. */
export function PairsSymbol({
  symbol,
  size = PAIRS_SYMBOL_SIZE,
  className,
}: PairsSymbolProps) {
  const { d, x, y, fill } = itemAt(pairsSymbols, symbol);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${PAIRS_SYMBOL_SIZE} ${PAIRS_SYMBOL_SIZE}`}
      aria-hidden="true"
    >
      <path
        d={d}
        transform={`translate(${x} ${y})`}
        fillRule="evenodd"
        style={{ fill }}
      />
    </svg>
  );
}
