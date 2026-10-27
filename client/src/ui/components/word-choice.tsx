import { useMessages } from '../../i18n';
import { cx } from '../cx';
import styles from './word-choice.module.css';

export type WordChoiceSize = 'regular' | 'compact';

export interface WordChoiceProps {
  word: string;
  onChoose: () => void;
  /**
   * Regular is a card; Compact a row, for a phone too short for three cards
   * (PH10).
   */
  size?: WordChoiceSize;
  className?: string;
}

/** Zumpo/Word choice: one of the drawer's three candidates, never shown to anyone else. */
export function WordChoice({
  word,
  onChoose,
  size = 'regular',
  className,
}: WordChoiceProps) {
  const m = useMessages();
  const letters = word.replaceAll(' ', '').length;
  return (
    <button
      type="button"
      className={cx(styles.choice, styles[size], className)}
      onClick={onChoose}
    >
      <span className={styles.word}>{word}</span>
      <span className={styles.detail}>{m.ui.word.letters(letters)}</span>
    </button>
  );
}
