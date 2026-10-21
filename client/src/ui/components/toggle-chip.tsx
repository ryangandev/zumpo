import type { ReactNode } from 'react';
import { Icon } from './icon';
import styles from './toggle-chip.module.css';

export interface ToggleChipProps {
  on?: boolean;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * Zumpo/Toggle chip: one choice that can be on or off by itself. On shows
 * lime and a tick; Off shows a plus, so the chip keeps its width.
 */
export function ToggleChip({
  on = false,
  onToggle,
  children,
}: ToggleChipProps) {
  return (
    <button
      type="button"
      className={styles.chip}
      aria-pressed={on}
      // A click keeps the focus where it was, so a real keyboard's Enter
      // still goes where it went before.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
    >
      <Icon glyph={on ? 'check' : 'plus'} size={16} />
      {children}
    </button>
  );
}
