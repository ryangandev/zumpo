import { Slider as BaseSlider } from '@base-ui/react/slider';
import { cx } from '../cx';
import styles from './slider.module.css';

export interface SliderProps {
  /** 0 to 100. */
  value: number;
  onValueChange: (value: number) => void;
  /** The accessible name, as the slider shows no words of its own. */
  label: string;
  /** What a screen reader says of a value, such as "70%, muted". */
  valueText: (value: number) => string;
  /**
   * State=Muted: dimmed as a disabled control is, but still working, so
   * moving it can turn the sound back on.
   */
  muted?: boolean;
  className?: string;
}

/**
 * Zumpo/Slider: a volume from 0 to 100, set by dragging the thumb or
 * pressing the track. The arrow keys move it by 5, Page Up and Page Down by
 * 10, Home and End to the ends. The thumb travels inside the track, so at 0
 * and at 100 it stays whole. Hover rings the thumb in sand, a drag in peach,
 * and the keyboard's focus is the 2 px ink ring outside it.
 */
export function Slider({
  value,
  onValueChange,
  label,
  valueText,
  muted = false,
  className,
}: SliderProps) {
  return (
    <BaseSlider.Root
      className={cx(styles.slider, muted && styles.muted, className)}
      value={value}
      onValueChange={(next) => onValueChange(next)}
      min={0}
      max={100}
      step={5}
      largeStep={10}
      thumbAlignment="edge"
    >
      <BaseSlider.Control className={styles.control}>
        <BaseSlider.Track className={styles.track}>
          <BaseSlider.Indicator className={styles.level} />
          <BaseSlider.Thumb
            className={styles.thumb}
            getAriaLabel={() => label}
            getAriaValueText={(_, current) => valueText(current)}
          />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
