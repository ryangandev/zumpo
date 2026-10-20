import { lazy, Suspense } from 'react';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
  ScrollRestoration,
  useParams,
  type RouteObject,
} from 'react-router';
import { isGameType } from './games/catalog';
import { LocaleProvider } from './i18n';
import { SessionProvider } from './net/session';
import CreateRoomPage from './pages/create-room';
import GamePage from './pages/game';
import HomePage from './pages/home';
import HowToPlayPage from './pages/how-to-play';
import NotFoundPage from './pages/not-found';
import CrashedPage from './pages/crashed';
import RoomPage from './room/room-page';
import SoloPage from './solo/solo-page';

// The design system gallery, for development only: the build drops it.
const DesignGallery = import.meta.env.DEV
  ? lazy(() => import('./ui/gallery/gallery'))
  : null;

function Root() {
  return (
    <div className="zumpo">
      <Outlet />
      <ScrollRestoration />
    </div>
  );
}

/** A page under /games/:game, for a game that exists. */
function GameRoute({
  page: Page,
}: {
  page: typeof GamePage | typeof CreateRoomPage | typeof SoloPage;
}) {
  const { game } = useParams();
  if (!isGameType(game)) return <NotFoundPage />;
  return <Page key={game} gameType={game} />;
}

function GameRoomPage() {
  const { game, roomId } = useParams();
  if (!isGameType(game) || !roomId) return <NotFoundPage />;
  return <RoomPage key={roomId} gameType={game} roomId={roomId} />;
}

export const routes: RouteObject[] = [
  {
    element: <Root />,
    children: [
      {
        // A page that throws shows the crash page in its place, in the frame.
        errorElement: <CrashedPage />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/how-to-play', element: <HowToPlayPage /> },
          // Every game is on the home page; old links to the games page land there.
          { path: '/games', element: <Navigate to="/" replace /> },
          { path: '/games/:game', element: <GameRoute page={GamePage} /> },
          {
            path: '/games/:game/new',
            element: <GameRoute page={CreateRoomPage} />,
          },
          { path: '/games/:game/solo', element: <GameRoute page={SoloPage} /> },
          { path: '/games/:game/rooms/:roomId', element: <GameRoomPage /> },
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
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </LocaleProvider>
  );
}
