import { useId, type ReactNode } from 'react';
import { cx } from '../cx';
import { ToggleChip } from './toggle-chip';
import fieldStyles from './field.module.css';
import styles from './chip-field.module.css';

export interface ChipFieldOption<Value extends string> {
  value: Value;
  /** What the chip shows. */
  label: string;
}

export interface ChipFieldProps<Value extends string> {
  label: ReactNode;
  options: readonly ChipFieldOption<Value>[];
  /** The chips that are on. */
  value: readonly Value[];
  onToggle: (value: Value) => void;
  /**
   * Chips that may not be turned off, such as the last one on where at least
   * one must stay; they keep their look and say they are unavailable.
   */
  locked?: readonly Value[];
  /** The text button beside the label, such as Choose all; none when absent. */
  action?: { label: string; onClick: () => void };
  helper?: ReactNode;
  className?: string;
}

/**
 * Zumpo/Chip field: a labelled set of Zumpo/Toggle chips, any number on,
 * with an optional text action beside the label and a helper under them.
 * Each chip is a toggle button, so Tab walks the chips one by one.
 */
export function ChipField<Value extends string>({
  label,
  options,
  value,
  onToggle,
  locked = [],
  action,
  helper,
  className,
}: ChipFieldProps<Value>) {
  const id = useId();
  return (
    <div className={cx(fieldStyles.field, className)}>
      <div className={styles.heading}>
        <span id={`${id}-label`} className={fieldStyles.label}>
          {label}
        </span>
        {action && (
          <button
            type="button"
            className={styles.action}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
      </div>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={helper != null ? `${id}-helper` : undefined}
        className={styles.chips}
      >
        {options.map((option) => (
          <ToggleChip
            key={option.value}
            on={value.includes(option.value)}
            locked={locked.includes(option.value)}
            onToggle={() => onToggle(option.value)}
          >
            {option.label}
          </ToggleChip>
        ))}
      </div>
      {helper != null && (
        <span id={`${id}-helper`} className={fieldStyles.helper}>
          {helper}
        </span>
      )}
    </div>
  );
}
