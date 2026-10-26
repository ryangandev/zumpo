import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { useId, type ReactNode } from 'react';
import { cx } from '../cx';
import fieldStyles from './field.module.css';
import chipStyles from './filter-chip.module.css';
import styles from './filter-chip-field.module.css';

export interface ChipOption<Value extends string | number> {
  value: Value;
  /** What the chip shows, such as "3". */
  label: string;
  /** What it is called when the label alone would be unclear: "3 bots". */
  name?: string;
}

export interface FilterChipFieldProps<Value extends string | number> {
  label: ReactNode;
  options: readonly ChipOption<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
  helper?: ReactNode;
  className?: string;
}

/**
 * Zumpo/Input's label and helper around a row of Zumpo/Filter chips (LD01):
 * a few presets picked with one tap, where a menu would take two. It is one
 * choice, so it is a radio group: one Tab stop, and the arrow keys move it.
 */
export function FilterChipField<Value extends string | number>({
  label,
  options,
  value,
  onValueChange,
  helper,
  className,
}: FilterChipFieldProps<Value>) {
  const id = useId();
  return (
    <div className={cx(fieldStyles.field, className)}>
      <span id={`${id}-label`} className={fieldStyles.label}>
        {label}
      </span>
      <RadioGroup<Value>
        aria-labelledby={`${id}-label`}
        aria-describedby={helper != null ? `${id}-helper` : undefined}
        value={value}
        onValueChange={(next) => onValueChange(next)}
        className={styles.chips}
      >
        {options.map((option) => (
          <Radio.Root
            key={option.value}
            value={option.value}
            aria-label={option.name}
            className={chipStyles.chip}
          >
            {option.label}
          </Radio.Root>
        ))}
      </RadioGroup>
      {helper != null && (
        <span id={`${id}-helper`} className={fieldStyles.helper}>
          {helper}
        </span>
      )}
    </div>
  );
}
