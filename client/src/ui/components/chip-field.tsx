import { useId, type ReactNode } from 'react';
import { cx } from '../cx';
import { FilterChip } from './filter-chip';
import fieldStyles from './field.module.css';
import styles from './chip-field.module.css';

export interface ChipOption<Value extends string | number> {
  value: Value;
  /** What the chip shows, such as "3". */
  label: string;
  /** What it is called when the label alone would be unclear: "3 bots". */
  name?: string;
}

export interface ChipFieldProps<Value extends string | number> {
  label: ReactNode;
  options: readonly ChipOption<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
  helper?: ReactNode;
  className?: string;
}

/**
 * Zumpo/Input's label and helper around a row of Zumpo/Filter chips (LD01):
 * a few presets picked with one tap, where a menu would take two.
 */
export function ChipField<Value extends string | number>({
  label,
  options,
  value,
  onValueChange,
  helper,
  className,
}: ChipFieldProps<Value>) {
  const id = useId();
  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      aria-describedby={helper != null ? `${id}-helper` : undefined}
      className={cx(fieldStyles.field, className)}
    >
      <span id={`${id}-label`} className={fieldStyles.label}>
        {label}
      </span>
      <div className={styles.chips}>
        {options.map((option) => (
          <FilterChip
            key={option.value}
            selected={option.value === value}
            onSelect={() => onValueChange(option.value)}
            name={option.name}
          >
            {option.label}
          </FilterChip>
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
