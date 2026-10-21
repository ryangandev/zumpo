import type { ReactNode } from 'react';
import { Tag } from '../ui';
import { cx } from '../ui/cx';
import styles from './page-heading.module.css';

export interface PageHeadingProps {
  /** The sand tag above the title, in capitals, if any. */
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** The home page's large two-line title. */
  hero?: boolean;
  /** The title's id, for a form or section it names. */
  titleId?: string;
}

/** A page's sand eyebrow tag, if any, title and muted subtitle. */
export function PageHeading({
  eyebrow,
  title,
  subtitle,
  hero,
  titleId,
}: PageHeadingProps) {
  return (
    <div className={styles.heading}>
      {eyebrow != null && <Tag className={styles.eyebrow}>{eyebrow}</Tag>}
      <h1 id={titleId} className={cx(styles.title, hero && styles.hero)}>
        {title}
      </h1>
      {subtitle != null && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
  );
}
