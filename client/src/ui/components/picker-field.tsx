import { useId, type ReactNode } from 'react';
import { cx } from '../cx';
import { Icon } from './icon';
import fieldStyles from './field.module.css';
import selectStyles from './select-field.module.css';

export interface PickerFieldProps {
  label: ReactNode;
  /** What is picked, in words: "All 15". */
  value: string;
  /** Opens what the value is picked in, such as a dialog. */
  onOpen: () => void;
  /** True while that is open, which turns the chevron as a menu's does. */
  open?: boolean;
  helper?: ReactNode;
  className?: string;
}

/**
 * Zumpo/Input with Select on, for a choice too large for a menu: it shows
 * what is picked and opens a dialog to pick it in, as Draw & Guess's word
 * categories do.
 */
export function PickerField({
  label,
  value,
  onOpen,
  open = false,
  helper,
  className,
}: PickerFieldProps) {
  const id = useId();
  return (
    <div className={cx(fieldStyles.field, className)}>
      <span id={`${id}-label`} className={fieldStyles.label}>
        {label}
      </span>
      <button
        type="button"
        className={cx(fieldStyles.box, selectStyles.trigger)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-describedby={helper != null ? `${id}-helper` : undefined}
        data-popup-open={open ? '' : undefined}
        onClick={onOpen}
      >
        <span id={`${id}-value`} className={selectStyles.value}>
          {value}
        </span>
        <span className={selectStyles.chevron} aria-hidden>
          <Icon glyph="chevron-down" size={20} />
        </span>
      </button>
      {helper != null && (
        <span id={`${id}-helper`} className={fieldStyles.helper}>
          {helper}
        </span>
      )}
    </div>
  );
}
