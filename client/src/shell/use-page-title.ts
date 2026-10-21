import { useEffect } from 'react';

const SITE = 'Zumpo';

/** The browser tab's title for a page: "Daily Word · Zumpo", or "Zumpo" alone. */
export function pageTitle(page?: string): string {
  return page ? `${page} · ${SITE}` : SITE;
}

/**
 * Names the browser tab after the page, so a row of tabs tells the games
 * apart. Each page says its own name; the home page says none. The one place
 * `document.title` is set for a page (a background tab's turn signal aside).
 */
export function usePageTitle(page?: string): void {
  useEffect(() => {
    document.title = pageTitle(page);
  }, [page]);
}
