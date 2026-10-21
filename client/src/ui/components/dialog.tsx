import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import type { ReactNode } from 'react';
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
   * choice, so Enter never destroys.
   */
  initialFocus?: BaseDialog.Popup.Props['initialFocus'];
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
            initialFocus={initialFocus}
          >
            <BaseDialog.Title className={card.title}>{title}</BaseDialog.Title>
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
