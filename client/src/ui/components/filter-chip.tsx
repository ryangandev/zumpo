import type { ReactNode } from 'react';
import styles from './filter-chip.module.css';

export interface FilterChipProps {
  /** The chip whose filter is showing; exactly one in a row is. */
  selected?: boolean;
  onSelect: () => void;
  children: ReactNode;
  /** Its accessible name, where the label alone says too little. */
  name?: string;
}

/** Zumpo/Filter chip: one thing to pick, in a row of them. */
export function FilterChip({
  selected = false,
  onSelect,
  children,
  name,
}: FilterChipProps) {
  return (
    <button
      type="button"
      className={styles.chip}
      aria-pressed={selected}
      aria-label={name}
      onClick={onSelect}
    >
      {children}
    </button>
  );
}
