import type { ReactNode } from 'react';
import { cx } from '../ui/cx';
import styles from './stage.module.css';

/**
 * Centres a page's one focused card, as Figma's "Dialog stage" does. A card
 * that grows (a section that opens) is set at the top instead, so it grows
 * down and nothing above it moves.
 */
export function Stage({
  children,
  top = false,
}: {
  children: ReactNode;
  top?: boolean;
}) {
  return <div className={cx(styles.stage, top && styles.top)}>{children}</div>;
}
