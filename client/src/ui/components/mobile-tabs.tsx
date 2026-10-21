import { Tabs } from '@base-ui/react/tabs';
import type { ReactNode } from 'react';
import { cx } from '../cx';
import styles from './mobile-tabs.module.css';

export interface MobileTab<View extends string> {
  value: View;
  label: string;
  panel: ReactNode;
}

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
  return (
    <Tabs.Root
      className={styles.root}
      value={value}
      onValueChange={(next) => onValueChange(next as View)}
    >
      <Tabs.List className={cx(styles.list, className)}>
        {tabs.map((tab) => (
          <Tabs.Tab key={tab.value} value={tab.value} className={styles.tab}>
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {tabs.map((tab) => (
        <Tabs.Panel key={tab.value} value={tab.value} className={styles.panel}>
          {tab.panel}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
