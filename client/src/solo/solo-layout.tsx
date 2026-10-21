import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { GameType } from '../../../shared/wire-types';
import { RoomBar, type TagTone } from '../ui';
import { gameInfo } from '../games/catalog';
import { useMessages } from '../i18n';
import { RulesDialog } from '../room/dialogs';
import { Page, useViewer } from '../shell/page';
import { playColumn } from '../shell/play-board';
import { ONE_COLUMN, PHONE, useMediaQuery } from '../shell/use-media-query';
import { cx } from '../ui/cx';
import styles from './solo-layout.module.css';

export interface SoloLayoutProps {
  gameType: GameType;
  /** The second tag, after "On your own": the board, the hand, "Board cleared". */
  phase: { tone: TagTone; label: string };
  /** The game: turn bar and board, or the result over the board. */
  stage: ReactNode;
  /** Cards beside the game on a wide screen; a phone shows only the game. */
  side?: ReactNode;
}

/**
 * A game on your own: a room bar with no room, the game, and its cards beside
 * it (MS02-MS05, T01-T05, PR01-PR04), or under it from 1023 px down. There is
 * no seat, so Leave just goes.
 */
export function SoloLayout({ gameType, phase, stage, side }: SoloLayoutProps) {
  const game = gameInfo(gameType);
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  const oneColumn = useMediaQuery(ONE_COLUMN);
  const navigate = useNavigate();
  const { viewer, viewerMenu } = useViewer();
  const [rules, setRules] = useState(false);

  return (
    <Page
      header={
        <RoomBar
          layout={oneColumn ? 'phone' : 'desktop'}
          game={m.games.of[gameType].name}
          room={oneColumn ? undefined : m.solo.onYourOwn}
          phase={phase}
          onHowToPlay={() => setRules(true)}
          onLeave={() => navigate('/')}
          leaveLabel={m.solo.leave}
          viewer={viewer}
          viewerMenu={viewerMenu}
        />
      }
    >
      {phone || side == null ? (
        <div className={cx(styles.stage, playColumn)}>{stage}</div>
      ) : (
        <div className={styles.solo}>
          <div className={styles.stage}>{stage}</div>
          <div className={styles.side}>{side}</div>
        </div>
      )}
      <RulesDialog open={rules} onOpenChange={setRules} game={game} solo />
    </Page>
  );
}
