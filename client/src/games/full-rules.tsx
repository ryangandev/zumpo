import { useId, useState } from 'react';
import { Button } from '../ui';
import { useMessages } from '../i18n';
import type { GameType } from '../../../shared/wire-types';
import styles from './full-rules.module.css';

/**
 * Every rule of a game, behind a Full rules button under its short version:
 * on the game's page (DL01, CB15) and in a room's How to play dialog (P15,
 * P21). The rules are the catalog's, one paragraph per blank line; they
 * start closed each time the component mounts.
 */
export function FullRules({ game }: { game: GameType }) {
  const m = useMessages();
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={styles.fullRules}>
      <Button
        variant="secondary"
        icon={open ? 'chevron-up' : 'chevron-down'}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {open ? m.ui.hideFullRules : m.ui.fullRules}
      </Button>
      <div id={id} className={styles.rules} hidden={!open}>
        {paragraphs(m.games.of[game].rules).map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}

/** A rules text's paragraphs: blank lines split them, single breaks stay. */
function paragraphs(rules: string) {
  return rules.split(/\n\s*\n/);
}
