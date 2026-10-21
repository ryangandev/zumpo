import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useBlocker, useNavigate } from 'react-router';
import type { GameType } from '../../../shared/wire-types';
import { Button, Dialog, RoomBar, type TagTone } from '../ui';
import { CompactTurnBar } from '../ui/components/turn-bar';
import { gameInfo, gamePath } from '../games/catalog';
import { useMessages } from '../i18n';
import { RulesDialog } from '../room/dialogs';
import { Page, useViewer } from '../shell/page';
import { playColumn } from '../shell/play-board';
import {
  ONE_COLUMN,
  PHONE,
  SHORT_WINDOW,
  useMediaQuery,
} from '../shell/use-media-query';
import { useStartFocus } from '../shell/use-start-focus';
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
   * over it where there is one column, so Play again is on screen without
   * scrolling. Nothing, or false, while the game is played. It takes the
   * focus when it appears.
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

const focusLost = () =>
  document.activeElement === null || document.activeElement === document.body;

/** Where Tab goes: a board's cells take one stop between them. */
const TABBABLE = ['button:not(:disabled)', 'input:not(:disabled)', 'a[href]']
  .map((element) => element + ':not([tabindex="-1"])')
  .concat('[tabindex="0"]')
  .join(', ');

/**
 * The stage's first stop for Tab: a board typed into, the board's own stop,
 * or the first control by it.
 */
function focusStage(stage: HTMLElement | null) {
  (
    stage?.querySelector<HTMLElement>('[data-start-focus]') ??
    stage?.querySelector<HTMLElement>(TABBABLE)
  )?.focus();
}

/**
 * A game on your own: a room bar with no room, the game, and its cards beside
 * it (MS02-MS05, T02-T05, PR02-PR04), or under it from 1023 px down. A
 * finished game's result leads the cards, so the board never moves; on one
 * column it comes before the board instead, so its actions are in sight.
 * When a game ends the result's title takes the focus, and when the next
 * game starts, from Play again or a change of settings, the board's first
 * control does: the button pressed has gone. There is
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
  const shortWindow = useMediaQuery(SHORT_WINDOW);
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
  // A phone keeps to the game until there is a result to show.
  const alone = !result && (phone || !side);
  const lead = oneColumn && Boolean(result);

  const stageBox = useRef<HTMLDivElement>(null);
  const resultBox = useRef<HTMLDivElement>(null);
  const finished = Boolean(result);
  const wasFinished = useRef(finished);
  useEffect(() => {
    const was = wasFinished.current;
    wasFinished.current = finished;
    if (finished && !was) {
      resultBox.current
        ?.querySelector<HTMLElement>('h1[tabindex="-1"], h2[tabindex="-1"]')
        ?.focus();
    } else if (!finished && was && focusLost()) {
      focusStage(stageBox.current);
    }
  }, [finished]);
  // A game on your own starts as it mounts, from Start, Play again or a
  // change of settings alike: the button pressed has gone with the page.
  useStartFocus(true, stageBox);

  // A game opens at the top of the page, as a new page does, not where the
  // form it was started from had been scrolled to. A block body: browsers
  // that return a promise from scrollTo would have React call it as cleanup.
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <Page
      header={
        <RoomBar
          layout={oneColumn ? 'phone' : 'desktop'}
          game={m.games.of[gameType].name}
          room={oneColumn ? undefined : m.solo.onYourOwn}
          phase={phase}
          onHowToPlay={() => setRules(true)}
          onLeave={() => navigate(gamePath(gameType))}
          leaveLabel={m.solo.leave}
          viewer={viewer}
          viewerMenu={viewerMenu}
        />
      }
    >
      {/* The stage keeps its place in the tree as the result and the side
          come and go, so the board is never mounted again when a game ends.
          Alone, the stage is a play column: on a phone the board takes the
          height left. */}
      <div
        className={cx(styles.solo, alone && styles.alone, alone && playColumn)}
      >
        {lead && (
          <div ref={resultBox} className={styles.result}>
            {result}
          </div>
        )}
        <div ref={stageBox} className={cx(stageClass, alone && playColumn)}>
          {/* A short window leaves the board more of the height. */}
          <CompactTurnBar.Provider value={shortWindow}>
            {stage}
          </CompactTurnBar.Provider>
        </div>
        {!alone && (
          <div className={styles.side}>
            {!lead && result && (
              <div ref={resultBox} className={styles.result}>
                {result}
              </div>
            )}
            {side}
          </div>
        )}
      </div>
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
