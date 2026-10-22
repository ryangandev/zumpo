import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { useRef, type ReactNode } from 'react';
import { quiet } from '../../shell/quiet-focus';
import { cx } from '../cx';
import card from './card.module.css';
import styles from './dialog.module.css';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons, the confirming one first. Wrap a dismissing one in DialogClose. */
  actions: ReactNode;
  /**
   * What takes focus on opening; by default the first thing that can, a
   * field before a button. A destructive confirmation points this at its safe
   * choice, so Enter never destroys. `'title'` starts on the title, for a
   * dialog to read, such as How to play, with no ring until a key.
   */
  initialFocus?: BaseDialog.Popup.Props['initialFocus'] | 'title';
}

/** A dialog over the screen it comes from (leave, invite), behind an ink scrim. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  actions,
  initialFocus,
}: DialogProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const onTitle = initialFocus === 'title';
  return (
    <BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop
          className={cx('zumpo', styles.backdrop)}
          data-dialog-backdrop=""
        />
        <BaseDialog.Viewport className={cx('zumpo', styles.viewport)}>
          <BaseDialog.Popup
            className={cx(card.card, styles.popup)}
            initialFocus={
              onTitle
                ? () => (titleRef.current ? quiet(titleRef.current) : true)
                : initialFocus
            }
          >
            <BaseDialog.Title
              ref={titleRef}
              className={card.title}
              tabIndex={onTitle ? -1 : undefined}
            >
              {title}
            </BaseDialog.Title>
            {description != null && (
              <BaseDialog.Description className={card.description}>
                {description}
              </BaseDialog.Description>
            )}
            {children}
            <div className={card.actions}>{actions}</div>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

/** Closes the surrounding Dialog; render a Button through it. */
export const DialogClose = BaseDialog.Close;
