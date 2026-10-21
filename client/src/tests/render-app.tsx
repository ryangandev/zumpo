import { act, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../app';
import { LocaleProvider, type Locale } from '../i18n';
import { SessionProvider } from '../net/session';
import { ME } from './fixtures';
import { FakeSocket } from './fake-socket';

/**
 * The whole app at `path`, talking to a fake server, with a player who has
 * chosen `name` themselves. `picked` makes it the name picked for them;
 * `firstVisit` stores nothing at all.
 */
export async function renderApp(
  path: string,
  {
    name = 'Ryan',
    picked = false,
    firstVisit = false,
    locale,
    fake = new FakeSocket(),
  }: {
    name?: string;
    picked?: boolean;
    firstVisit?: boolean;
    /** A language chosen from the switch; English, as the browser's, without. */
    locale?: Locale;
    fake?: FakeSocket;
  } = {},
) {
  sessionStorage.clear();
  if (locale) localStorage.setItem('zumpo:locale', locale);
  else localStorage.removeItem('zumpo:locale');
  if (firstVisit) localStorage.removeItem('zumpo:name');
  else localStorage.setItem('zumpo:name', JSON.stringify({ name, picked }));
  fake.session = { playerId: ME, token: 't1', reconnectGraceMs: 30_000 };
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <LocaleProvider>
      <SessionProvider socket={fake.asSocket()}>
        <RouterProvider router={router} />
      </SessionProvider>
    </LocaleProvider>,
  );
  // Connect, as the server would accept the handshake.
  await act(async () => {
    if (fake.active) fake.open();
  });
  return { ...view, fake, router };
}
