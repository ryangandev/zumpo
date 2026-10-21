import type { FormEventHandler, ReactNode } from 'react';
import { useId } from 'react';
import { cx } from '../cx';
import styles from './card.module.css';

export interface CardProps {
  /**
   * Focused (the default) is the one card of a page or dialog. Panel is a
   * card in a page's column, under the page's own heading: it fills the
   * column, sits closer, and its title is an h2.
   */
  kind?: 'focused' | 'panel';
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons, primary first. */
  actions?: ReactNode;
  /** Makes the card a form, so Enter submits it. */
  onSubmit?: FormEventHandler<HTMLFormElement>;
  /** Marks the card as waiting on something, as a loading state does. */
  busy?: boolean;
  /**
   * The title can be given the focus from code, never by Tab: a card that
   * appears as what was being done ends, such as a game's result.
   */
  focusableTitle?: boolean;
  className?: string;
}

/**
 * Zumpo/Card: the focused card of a one-question page (a name, a new room, a
 * password), or a panel in a page's column (an empty or loading lobby).
 */
export function Card({
  kind = 'focused',
  title,
  description,
  children,
  actions,
  onSubmit,
  busy,
  focusableTitle = false,
  className,
}: CardProps) {
  const titleId = useId();
  const Title = kind === 'panel' ? 'h2' : 'h1';
  const content = (
    <>
      <Title
        id={titleId}
        className={styles.title}
        tabIndex={focusableTitle ? -1 : undefined}
      >
        {title}
      </Title>
      {description != null && (
        <p className={styles.description}>{description}</p>
      )}
      {children}
      {actions != null && <div className={styles.actions}>{actions}</div>}
    </>
  );
  const props = {
    className: cx(styles.card, kind === 'panel' && styles.panel, className),
    'aria-labelledby': titleId,
    'aria-busy': busy || undefined,
  };
  return onSubmit ? (
    <form {...props} onSubmit={onSubmit}>
      {content}
    </form>
  ) : (
    <section {...props}>{content}</section>
  );
}
