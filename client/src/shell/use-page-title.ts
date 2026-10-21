import { useEffect } from 'react';

const SITE = 'Zumpo';

/**
 * The browser tab's title has one owner: the page says its parts, the turn
 * signal says its prefix, and whichever changes the title is rebuilt from both.
 */
let parts: readonly string[] = [];
let signal: string | null = null;

function render(): void {
  document.title = [signal, ...parts, SITE].filter(Boolean).join(' · ');
}

/**
 * Names the browser tab after the page, most specific first ("Friday table ·
 * Liar's Dice · Zumpo"), so a row of tabs tells the games apart. The home page
 * says no parts and is plain "Zumpo".
 */
export function usePageTitle(...page: string[]): void {
  const key = page.join('\u0000');
  useEffect(() => {
    parts = key ? key.split('\u0000') : [];
    render();
  }, [key]);
}

/** Puts a prefix on the title ("(!) Your turn"), or takes it off with null. */
export function setTitleSignal(prefix: string | null): void {
  signal = prefix;
  render();
}
