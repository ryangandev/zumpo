import { useId, type FormEventHandler, type ReactNode } from 'react';
import { Card } from '../ui';
import { Page } from './page';
import { PageHeading, type PageHeadingProps } from './page-heading';
import { Stage } from './stage';
import { PHONE, useMediaQuery } from './use-media-query';
import styles from './form-page.module.css';

export interface FormPageProps {
  /**
   * Over the card on a wide screen; without one, the card's title is the
   * page's, as on the create-room page.
   */
  heading?: PageHeadingProps;
  /**
   * On a phone the card folds into the page: its title becomes the page's,
   * under this eyebrow, if any, and over this subtitle, and its description
   * gives way. `title` sets the phone's line breaks, where Figma sets them
   * by hand.
   */
  phone: { eyebrow?: string; subtitle: ReactNode; title?: ReactNode };
  title: string;
  description?: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
  /** Buttons, primary first. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * A page that asks one thing: a name, a new room, a password. A wide screen
 * centres it in a card, under the page heading if it has one (DL04, DL07); a phone lays
 * the form straight on the page (MO02, MO05, MO06).
 */
export function FormPage({
  heading,
  phone,
  title,
  description,
  onSubmit,
  actions,
  children,
}: FormPageProps) {
  const onPhone = useMediaQuery(PHONE);
  const titleId = useId();

  if (onPhone) {
    return (
      <Page>
        <PageHeading
          eyebrow={phone.eyebrow}
          title={phone.title ?? title}
          subtitle={phone.subtitle}
          titleId={titleId}
        />
        <form
          className={styles.form}
          aria-labelledby={titleId}
          onSubmit={onSubmit}
        >
          {children}
          {actions != null && <div className={styles.actions}>{actions}</div>}
        </form>
      </Page>
    );
  }
  return (
    <Page>
      {heading && <PageHeading {...heading} />}
      <Stage>
        <Card
          title={title}
          description={description}
          onSubmit={onSubmit}
          actions={actions}
        >
          {children}
        </Card>
      </Stage>
    </Page>
  );
}
