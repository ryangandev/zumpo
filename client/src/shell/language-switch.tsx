import { itemAt } from '../../../shared/list';
import { useRef } from 'react';
import { LOCALE_NAMES, LOCALES, useLocale, useMessages } from '../i18n';
import { cx } from '../ui/cx';
import styles from './language-switch.module.css';

/**
 * The footer's language switch: every language by its own name, the current
 * one in ink, as one radio group, so a test counting pressed buttons never
 * sees it. It is the one control not drawn in Figma (docs/design.md).
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const m = useMessages();
  const { locale, setLocale } = useLocale();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <span
      role="radiogroup"
      aria-label={m.shell.language.label}
      className={cx(styles.switch, className)}
    >
      {LOCALES.map((candidate, index) => (
        <button
          key={candidate}
          ref={(button) => {
            buttons.current[index] = button;
          }}
          type="button"
          role="radio"
          lang={candidate}
          aria-label={LOCALE_NAMES[candidate]}
          className={styles.language}
          aria-checked={candidate === locale}
          tabIndex={candidate === locale ? 0 : -1}
          onClick={() => setLocale(candidate)}
          onKeyDown={(event) => {
            const forward =
              event.key === 'ArrowRight' || event.key === 'ArrowDown';
            const backward =
              event.key === 'ArrowLeft' || event.key === 'ArrowUp';
            if (!forward && !backward) return;
            event.preventDefault();
            const next =
              (index + (forward ? 1 : -1) + LOCALES.length) % LOCALES.length;
            setLocale(itemAt(LOCALES, next));
            buttons.current[next]?.focus();
          }}
        >
          {LOCALE_NAMES[candidate]}
        </button>
      ))}
    </span>
  );
}
