import { useId } from 'react';
import { cx } from '../cx';
import styles from './how-to-play.module.css';

export interface HowToPlayProps {
  /**
   * "How to play" over a waiting card's version, or the mode on a game's
   * page; with one it is a region named by it. A dialog has its title.
   */
  heading?: string;
  /** What you are trying to do, in ink; a dialog says it as its description. */
  goal?: string;
  /** A line each, every one behind a coral dot. */
  steps: readonly string[];
  className?: string;
}

/**
 * Zumpo/How to play: a game's rules in half a minute, on a room's waiting
 * card (P19, D01-D03), in its How to play dialog (P15) and on the game's
 * page (DL01, CB15).
 */
export function HowToPlay({ heading, goal, steps, className }: HowToPlayProps) {
  const id = useId();
  const Box = heading ? 'section' : 'div';
  return (
    <Box
      className={cx(styles.howTo, className)}
      aria-labelledby={heading ? id : undefined}
    >
      {heading && (
        <h3 id={id} className={styles.heading}>
          {heading}
        </h3>
      )}
      {goal && <p className={styles.goal}>{goal}</p>}
      <ul className={styles.steps}>
        {steps.map((step) => (
          <li key={step} className={styles.step}>
            {step}
          </li>
        ))}
      </ul>
    </Box>
  );
}
