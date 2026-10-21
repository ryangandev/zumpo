import { Tabs } from '@base-ui/react/tabs';
import type { ReactNode } from 'react';
import { useMessages } from '../../i18n';
import { cx } from '../cx';
import styles from './mobile-tabs.module.css';

export interface MobileTab<View extends string> {
  value: View;
  label: string;
  panel: ReactNode;
  /** Lines that arrived while the tab was out of sight: Chat's unread mark. */
  unread?: number;
}

/** The mark says 9+ past nine: past that a count is only "a lot". */
const MOST = 9;

export interface MobileTabsProps<View extends string> {
  tabs: readonly MobileTab<View>[];
  value: View;
  onValueChange: (view: View) => void;
  className?: string;
}

/** Zumpo/Mobile tabs: a phone room shows one of board, players and chat at a time. */
export function MobileTabs<View extends string>({
  tabs,
  value,
  onValueChange,
  className,
}: MobileTabsProps<View>) {
  const m = useMessages();
  return (
    <Tabs.Root
      className={styles.root}
      value={value}
      onValueChange={(next) => onValueChange(next as View)}
    >
      <Tabs.List className={cx(styles.list, className)}>
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.value}
            value={tab.value}
            className={styles.tab}
            aria-label={
              tab.unread ? m.ui.chat.unread(tab.label, tab.unread) : undefined
            }
          >
            {tab.label}
            {tab.unread ? (
              <span className={styles.unread} aria-hidden>
                {tab.unread > MOST ? `${MOST}+` : tab.unread}
              </span>
            ) : null}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {tabs.map((tab) => (
        <Tabs.Panel key={tab.value} value={tab.value}>
          {tab.panel}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
