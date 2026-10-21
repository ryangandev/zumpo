import { useMessages } from '../../i18n';
import { cx } from '../cx';
import { Avatar, type AvatarTone } from './avatar';
import { Die, type DieProps } from './die';
import { Tag } from './tag';
import styles from './cup.module.css';

/** Default; Turn marks whose turn it is; Lost the player who loses a die in a reveal. */
export type CupState = 'default' | 'turn' | 'lost';

export interface CupProps {
  name: string;
  initials: string;
  tone: AvatarTone;
  /** Under the name: "3 dice", "Deciding", "Lost a die". */
  detail: string;
  you?: boolean;
  state?: CupState;
  /** Regular dice for your own cup; Compact for everybody else's. */
  size?: 'regular' | 'compact';
  /** Stack puts the dice under the player; Row beside them, as on a phone's narrow table. */
  layout?: 'stack' | 'row';
  /** Every die the player started with: their own face up, others Hidden until a call, lost ones Empty. */
  dice: readonly Pick<DieProps, 'face' | 'state'>[];
  /** Changes when the dice are rolled, which gives them a shake. */
  roll?: number;
  className?: string;
}

/** Zumpo/Cup: a player at the table, and their dice. */
export function Cup({
  name,
  initials,
  tone,
  detail,
  you = false,
  state = 'default',
  size = 'compact',
  layout = 'stack',
  dice,
  roll,
  className,
}: CupProps) {
  const m = useMessages();
  return (
    <section
      className={cx(
        styles.cup,
        layout === 'row' && styles.row,
        state !== 'default' && styles[state],
        className,
      )}
      aria-label={you ? m.ui.youName(name) : name}
    >
      <div className={styles.player}>
        <Avatar initials={initials} tone={tone} />
        <div className={styles.details}>
          <span className={styles.nameLine}>
            <span className={styles.name}>{name}</span>
            {you && (
              <Tag size="compact" tone="sand">
                {m.ui.you}
              </Tag>
            )}
          </span>
          <span className={styles.detail}>{detail}</span>
        </div>
      </div>
      <div
        key={roll}
        className={cx(styles.dice, size === 'regular' && styles.regular)}
        role="list"
        aria-label={m.ui.dice.title}
      >
        {dice.map((die, index) => (
          <span
            key={index}
            role="listitem"
            className={cx(
              styles.slot,
              roll !== undefined && die.face !== 'empty' && styles.rolled,
            )}
          >
            <Die face={die.face} state={die.state} size={size} />
          </span>
        ))}
      </div>
    </section>
  );
}
