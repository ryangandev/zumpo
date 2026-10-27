import { lazy, Suspense, type ComponentType } from 'react';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  ScrollRestoration,
  useParams,
  type RouteObject,
} from 'react-router';
import type { GameType } from '../../shared/wire-types';
import { isGameType } from './games/catalog';
import { SoundProvider } from './audio';
import { LocaleProvider } from './i18n';
import { SessionProvider } from './net/session';
import CreateRoomPage from './pages/create-room';
import GamePage from './pages/game';
import HomePage from './pages/home';
import NotFoundPage from './pages/not-found';
import CrashedPage from './pages/crashed';

// The design system gallery, for development only: the build drops it.
const DesignGallery = import.meta.env.DEV
  ? lazy(() => import('./ui/gallery/gallery'))
  : null;

// Every declared sound through the real engine, for development only too.
const SoundLab = import.meta.env.DEV
  ? lazy(() => import('./audio/dev/sound-lab'))
  : null;

function Root() {
  return (
    <div className="zumpo">
      <Outlet />
      <ScrollRestoration />
    </div>
  );
}

function Loading() {
  return null;
}

/** A page under /games/:game, for a game that exists. */
function GameRoute({
  page: Page,
}: {
  page: ComponentType<{ gameType: GameType }>;
}) {
  const { game } = useParams();
  if (!isGameType(game)) return <NotFoundPage />;
  return <Page key={game} gameType={game} />;
}

/**
 * A game on your own and a room bring every game's board, so each loads only
 * when it is opened: the home page, where most visits start, downloads
 * neither. The router keeps the page it leaves on screen while one loads.
 */
async function soloRoute() {
  const { default: SoloPage } = await import('./solo/solo-page');
  return { Component: () => <GameRoute page={SoloPage} /> };
}

async function roomRoute() {
  const { default: RoomPage } = await import('./room/room-page');
  return { Component: () => <RoomRoute page={RoomPage} /> };
}

/** /games/:game/rooms/:roomId, for a game that exists. */
function RoomRoute({
  page: Page,
}: {
  page: ComponentType<{ gameType: GameType; roomId: string }>;
}) {
  const { game, roomId } = useParams();
  if (!isGameType(game) || !roomId) return <NotFoundPage />;
  return <Page key={roomId} gameType={game} roomId={roomId} />;
}

export const routes: RouteObject[] = [
  {
    element: <Root />,
    // Opened straight from its link, a page that loads when opened leaves
    // the cream page bare for the moment it takes.
    HydrateFallback: Loading,
    children: [
      {
        // A page that throws shows the crash page in its place, in the frame.
        errorElement: <CrashedPage />,
        children: [
          { path: '/', element: <HomePage /> },
          // Every game is on the home page; old links to the games page land there.
          { path: '/games', element: <Navigate to="/" replace /> },
          // Each game's rules are on its page now; old links land on the games.
          { path: '/how-to-play', element: <Navigate to="/" replace /> },
          { path: '/games/:game', element: <GameRoute page={GamePage} /> },
          {
            path: '/games/:game/new',
            element: <GameRoute page={CreateRoomPage} />,
          },
          { path: '/games/:game/solo', lazy: soloRoute },
          { path: '/games/:game/rooms/:roomId', lazy: roomRoute },
          ...(DesignGallery
            ? [
                {
                  path: '/design',
                  element: (
                    <Suspense>
                      <DesignGallery />
                    </Suspense>
                  ),
                },
              ]
            : []),
          ...(SoundLab
            ? [
                {
                  path: '/dev/sound',
                  element: (
                    <Suspense>
                      <SoundLab />
                    </Suspense>
                  ),
                },
              ]
            : []),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

const router = createBrowserRouter(routes);

export function App() {
  return (
    <LocaleProvider>
      <SoundProvider>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </SoundProvider>
    </LocaleProvider>
  );
}
