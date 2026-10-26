import type { ReactNode } from 'react';
import { cx } from '../cx';
import { Icon, type GlyphName } from './icon';
import styles from './chat-message.module.css';

export type ChatMessageKind =
  'player' | 'system' | 'score' | 'divider' | 'success' | 'alert' | 'close';

const GLYPHS: Record<
  Exclude<ChatMessageKind, 'player' | 'divider' | 'close'>,
  GlyphName
> = {
  system: 'info',
  score: 'check',
  success: 'check',
  alert: 'alert',
};

export interface ChatMessageProps {
  /**
   * Player: what someone typed (a wrong guess is just this). System: joins,
   * the game starting, said quietly. Score: somebody scored, as quietly.
   * Divider: a new turn or step begins. Success: a moment that matters, a
   * correct guess or the game won. Alert: something went wrong for somebody,
   * like a departure. Close: the viewer's own guess a letter or two off the
   * word, which nobody else sees, with its `note`.
   */
  kind: ChatMessageKind;
  /** The Alert icon, for a game with its own: the mine in Minesweeper. */
  alertIcon?: GlyphName;
  /**
   * The player's name, for kinds player and close; the viewer's own lines
   * say You.
   */
  name?: string;
  /** Close's Note, after the guess: "So close!". */
  note?: string;
  /** One line, ending in an ellipsis: the few lines under a phone's board. */
  truncate?: boolean;
  /** Flashes once as it appears: the viewer's own guess, just sent. */
  flash?: boolean;
  children: ReactNode;
}

/** Zumpo/Chat message: one line in the room chat. */
export function ChatMessage({
  kind,
  name,
  note,
  alertIcon = GLYPHS.alert,
  truncate = false,
  flash = false,
  children,
}: ChatMessageProps) {
  const spoken = kind === 'player' || kind === 'close';
  return (
    <li
      className={cx(
        styles.message,
        styles[kind],
        truncate && styles.truncate,
        flash && styles.flash,
      )}
    >
      {spoken ? (
        <span className={styles.name}>{name}</span>
      ) : kind === 'divider' ? null : (
        <span className={styles.iconSlot}>
          <Icon glyph={kind === 'alert' ? alertIcon : GLYPHS[kind]} size={16} />
        </span>
      )}
      <span className={styles.text}>{children}</span>
      {kind === 'close' && note ? (
        <span className={styles.note}>{note}</span>
      ) : null}
    </li>
  );
}
