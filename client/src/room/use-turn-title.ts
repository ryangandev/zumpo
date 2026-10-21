import { useEffect, useSyncExternalStore } from 'react';
import { useMessages } from '../i18n';

const subscribe = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};
const isHidden = () => document.hidden;
const neverHidden = () => false;

/**
 * While the page is in a background tab and it is this player's go, the tab's
 * title says so ("(!) Your turn · Zumpo"), because a turn clock runs out
 * whether anybody is looking or not. The title goes back as soon as the tab
 * is looked at or the turn passes. Only the title: it changes no timing.
 */
export function useTurnTitle(yourTurn: boolean): void {
  const m = useMessages();
  const hidden = useSyncExternalStore(subscribe, isHidden, neverHidden);
  const signal = yourTurn && hidden;

  useEffect(() => {
    if (!signal) return;
    const before = document.title;
    document.title = m.room.turnTitle;
    return () => {
      document.title = before;
    };
  }, [signal, m]);
}
