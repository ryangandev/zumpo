import { lazy, Suspense } from 'react';
import type { GameType } from '../../../shared/wire-types';
import { Make24Solo } from '../make-24/solo/solo-page';
import { MinesweeperSolo } from '../minesweeper/solo/solo-page';
import { PairsSolo } from '../pairs/solo/solo-page';
import { TriosSolo } from '../trios/solo/solo-page';
import { SnapSolo } from '../snap/solo/solo-page';
import { LiarsDiceSolo } from '../liars-dice/solo/solo-page';
import NotFoundPage from '../pages/not-found';

// Daily Word brings its word lists, so it loads only when played.
const DailyWordSolo = lazy(() =>
  import('../daily-word/solo/solo-page').then((module) => ({
    default: module.DailyWordSolo,
  })),
);

/** /games/:game/solo: a game on your own, for the games that have one. */
export default function SoloPage({ gameType }: { gameType: GameType }) {
  switch (gameType) {
    case 'minesweeper':
      return <MinesweeperSolo />;
    case 'make-24':
      return <Make24Solo />;
    case 'pairs':
      return <PairsSolo />;
    case 'trios':
      return <TriosSolo />;
    case 'snap':
      return <SnapSolo />;
    case 'liars-dice':
      return <LiarsDiceSolo />;
    case 'daily-word':
      return (
        <Suspense>
          <DailyWordSolo />
        </Suspense>
      );
    default:
      return <NotFoundPage />;
  }
}
