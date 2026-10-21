import { cx } from '../cx';
import { Icon } from './icon';
import styles from './countdown.module.css';

/** The last seconds of a phase you act in turn the clock urgent. */
export const URGENT_SECONDS = 5;

export interface CountdownProps {
  /** Seconds left, as the server sent them; the client never runs its own clock. */
  seconds: number;
  /** What the clock is for: "to pick", "to draw". */
  label: string;
  /** Someone else is acting, or a reveal is on. */
  waiting?: boolean;
  /**
   * False for a clock that ends nothing you are doing: the time to a hint,
   * the time on this card, a run's time. It takes the quiet Info tone, a
   * line and no fill, so it never reads as time running out, and it never
   * turns urgent.
   */
  deadline?: boolean;
  className?: string;
}

/** "0:45", "1:12": as every other time on the site is written. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Zumpo/Countdown: the server-driven phase clock, or on your own the run's.
 * A deadline is a filled pill, lime while you act, sand while you wait and
 * peach at the end; any other clock is the Info outline.
 */
export function Countdown({
  seconds,
  label,
  waiting = false,
  deadline = true,
  className,
}: CountdownProps) {
  const tone = !deadline
    ? 'info'
    : waiting
      ? 'waiting'
      : seconds <= URGENT_SECONDS
        ? 'urgent'
        : 'running';
  return (
    <span
      role="timer"
      data-tone={tone}
      className={cx(
        styles.countdown,
        tone !== 'running' && styles[tone],
        className,
      )}
    >
      <Icon glyph="clock" size={20} />
      <span className={styles.time}>
        {[...formatClock(seconds)].map((char, index) =>
          char === ':' ? (
            char
          ) : (
            <span key={index} className={styles.digit}>
              {char}
            </span>
          ),
        )}
      </span>
      <span className={styles.label} data-countdown-label="">
        {label}
      </span>
    </span>
  );
}
