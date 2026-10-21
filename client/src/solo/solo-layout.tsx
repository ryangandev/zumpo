import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useBlocker, useNavigate } from 'react-router';
import type { GameType } from '../../../shared/wire-types';
import { Button, Dialog, RoomBar, type TagTone } from '../ui';
import { gameInfo, gamePath } from '../games/catalog';
import { useMessages } from '../i18n';
import { RulesDialog } from '../room/dialogs';
import { Page, useViewer } from '../shell/page';
import { ONE_COLUMN, PHONE, useMediaQuery } from '../shell/use-media-query';
import { cx } from '../ui/cx';
import type { SoloTime } from './solo-time';
import styles from './solo-layout.module.css';

export interface SoloLayoutProps {
  gameType: GameType;
  /** The second tag, after "On your own": the board, the hand, "Board cleared". */
  phase: { tone: TagTone; label: string };
  /**
   * The game: its turn bar and board, from the first move to the last, so a
   * finished board stays where it was played.
   */
  stage: ReactNode;
  /**
   * A finished game's `SoloResult`: first in the column beside the board, or
   * under the board where there is one column.
   */
  result?: ReactNode;
  /**
   * Cards beside the game on a wide screen, under it on one column. A phone
   * shows them only under a result: while a game is played, only the game.
   */
  side?: ReactNode;
  /**
   * The game's own time, for a game in progress: How to play and the Leave
   * question pause it, and put the game away behind the dialog until it closes.
   */
  time?: SoloTime;
  /**
   * What leaving now would lose, set only while that took minutes to build
   * (a Liar's Dice game, a Trios run under way): then any way out asks first.
   */
  leaveWarning?: string | null;
}

/**
 * A game on your own: a room bar with no room, the game, and its cards beside
 * it (MS02-MS05, T02-T05, PR02-PR04), or under it from 1023 px down. A
 * finished game's result leads the cards, so the board never moves. There is
 * no seat, so Leave goes back to the game's page, where the game can be
 * started again with other settings; it asks first only with `leaveWarning`.
 * While How to play or that question is open the game's time stands still, and
 * the game is put away so the pause cannot be spent on it.
 */
export function SoloLayout({
  gameType,
  phase,
  stage,
  result,
  side,
  time,
  leaveWarning = null,
}: SoloLayoutProps) {
  const game = gameInfo(gameType);
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  const oneColumn = useMediaQuery(ONE_COLUMN);
  const navigate = useNavigate();
  const { viewer, viewerMenu } = useViewer();
  const [rules, setRules] = useState(false);
  // The Leave button, the wordmark and the browser's back button alike.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      leaveWarning !== null &&
      currentLocation.pathname !== nextLocation.pathname,
  );
  const stay = useRef<HTMLButtonElement>(null);
  const asking = blocker.state === 'blocked';
  // Staying costs no time, and bots wait for the answer.
  const away = rules || asking;
  useLayoutEffect(() => {
    time?.setPaused(away);
  }, [time, away]);
  const stageClass = cx(styles.stage, time?.paused && styles.away);

  return (
    <Page
      header={
        <RoomBar
          layout={oneColumn ? 'phone' : 'desktop'}
          game={m.games.of[gameType].name}
          room={m.solo.onYourOwn}
          phase={phase}
          onHowToPlay={() => setRules(true)}
          onLeave={() => navigate(gamePath(gameType))}
          leaveLabel={m.solo.leave}
          viewer={viewer}
          viewerMenu={viewerMenu}
        />
      }
    >
      {(phone && result == null) || (side == null && result == null) ? (
        <div className={stageClass}>{stage}</div>
      ) : (
        <div className={styles.solo}>
          <div className={stageClass}>{stage}</div>
          <div className={styles.side}>
            {result}
            {side}
          </div>
        </div>
      )}
      <RulesDialog open={rules} onOpenChange={setRules} game={game} solo />
      <Dialog
        open={asking}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
        title={m.solo.leaveTitle}
        description={leaveWarning}
        initialFocus={stay}
        actions={
          <>
            <Button
              variant="danger"
              icon="leave"
              onClick={() => blocker.proceed?.()}
            >
              {m.solo.leave}
            </Button>
            <Button
              ref={stay}
              variant="secondary"
              onClick={() => blocker.reset?.()}
            >
              {m.solo.stay}
            </Button>
          </>
        }
      />
    </Page>
  );
}
