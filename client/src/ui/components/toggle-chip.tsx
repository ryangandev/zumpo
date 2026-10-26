import type { ReactNode } from 'react';
import { Icon } from './icon';
import styles from './toggle-chip.module.css';

export interface ToggleChipProps {
  on?: boolean;
  onToggle: () => void;
  /**
   * May not be toggled now, as the last chip on where one must stay: it
   * keeps its look, says it is unavailable, and a press does nothing.
   */
  locked?: boolean;
  children: ReactNode;
}

/**
 * Zumpo/Toggle chip: one choice that can be on or off by itself. On shows
 * lime and a tick; Off shows a plus, so the chip keeps its width.
 */
export function ToggleChip({
  on = false,
  onToggle,
  locked = false,
  children,
}: ToggleChipProps) {
  return (
    <button
      type="button"
      className={styles.chip}
      aria-pressed={on}
      aria-disabled={locked || undefined}
      // A click keeps the focus where it was, so a real keyboard's Enter
      // still goes where it went before.
      onMouseDown={(event) => event.preventDefault()}
      onClick={locked ? undefined : onToggle}
    >
      <Icon glyph={on ? 'check' : 'plus'} size={16} />
      {children}
    </button>
  );
}
