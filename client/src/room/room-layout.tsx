import { useEffect, useState, type ReactNode } from 'react';
import { MAX_SPECTATORS } from '../../../shared/room';
import {
  ChatInput,
  MobileTabs,
  Notice,
  PlayerRow,
  RoomBar,
  Scoreboard,
  StandingsStrip,
  type PlayerRowProps,
  type GlyphName,
  type TagTone,
} from '../ui';
import { gameInfo } from '../games/catalog';
import { useMessages } from '../i18n';
import { initialsOf, toneOf } from '../players/avatar';
import { Page, useViewer } from '../shell/page';
import { playColumn } from '../shell/play-board';
import { ONE_COLUMN, PHONE, useMediaQuery } from '../shell/use-media-query';
import { cx } from '../ui/cx';
import { RulesDialog } from './dialogs';
import { RoomChat } from './room-chat';
import { useRoomContext } from './room-context';
import type { Seat } from './players';
import styles from './room-layout.module.css';

export interface PlayerLine {
  seat: Seat;
  status: string;
  statusIcon?: PlayerRowProps['statusIcon'];
  state?: PlayerRowProps['state'];
}

export interface RoomLayoutProps {
  /** The phase tag beside the room's name: "Waiting room", "Round 2 of 2". */
  phase: { tone: TagTone; label: string };
  /** A pending notice over the room, such as a drawer who dropped. */
  notice?: ReactNode;
  /** The game: turn bar and canvas or board, or a panel between games. */
  stage: ReactNode;
  players: readonly PlayerLine[];
  chat: {
    placeholder: string;
    lockedReason?: string;
    /** The game's own Alert icon in the chat, as Chat message allows. */
    alertIcon?: GlyphName;
  };
  /**
   * On a phone, the chat input repeated under the board, so a guess needs no
   * switch to the Chat tab: its accessible name, or nothing for no input.
   */
  boardInput?: string;
  /**
   * The scoreboard's points; off where everybody's are the same, as in Hush,
   * whose team scores together and whose rows say what each player holds.
   */
  showScores?: boolean;
  /** The scoreboard's title, where its scores are not points: "Hearts". */
  scoreTitle?: string;
  /** On a phone, more under the scoreboard on the Players tab: the race. */
  playersAside?: ReactNode;
  /**
   * Whether a phone's Board tab shows the standings strip while a game is
   * on; by default where scores are shown. Off where the board itself shows
   * everyone, as Gomoku's seats do.
   */
  standings?: boolean;
}

/** How long a phone says "You're the host now" over the board. */
const HOST_NOTICE_MS = 5000;

type View = 'board' | 'players' | 'chat';

/**
 * A seated room's screen: the room bar, the game, the scoreboard and the
 * chat; under 1024 px the scoreboard and the chat go under the game, and on a
 * phone the three are tabs. Anybody watching is listed under the scoreboard,
 * and a spectator is told so while a game is under way. How to play opens
 * over the room. While reconnecting it says so and holds still.
 */
export function RoomLayout({
  phase,
  notice,
  stage,
  players,
  chat,
  boardInput,
  showScores = true,
  scoreTitle,
  playersAside,
  standings = showScores,
}: RoomLayoutProps) {
  const room = useRoomContext();
  const { state, reconnecting, reconnectGraceMs } = room;
  const game = gameInfo(state.gameType);
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  const oneColumn = useMediaQuery(ONE_COLUMN);
  const [view, setView] = useState<View>('board');
  const [rules, setRules] = useState(false);
  const { viewer, viewerMenu } = useViewer({
    seatName: room.me.username,
  });
  const newHost = useBecameHost(state.owner.playerId === room.playerId);

  const input = {
    onSend: room.sendChat,
    placeholder: chat.placeholder,
    lockedReason: reconnecting ? m.room.reconnecting : chat.lockedReason,
  };

  const scoreboard = (
    <Scoreboard
      title={scoreTitle}
      players={players.length}
      seats={state.maxPlayers}
    >
      {players.map(({ seat, status, statusIcon, state: rowState }) => (
        <PlayerRow
          key={seat.playerId}
          name={seat.username}
          initials={initialsOf(seat.username)}
          tone={toneOf(seat.username)}
          status={status}
          statusIcon={statusIcon}
          score={showScores ? seat.points : undefined}
          host={seat.playerId === state.owner.playerId}
          you={seat.playerId === room.playerId}
          state={rowState}
        />
      ))}
    </Scoreboard>
  );

  const spectators = Object.entries(state.spectators);
  const watching =
    spectators.length > 0 ? (
      <Scoreboard
        title={m.room.watching}
        players={spectators.length}
        seats={MAX_SPECTATORS}
      >
        {spectators.map(([playerId, spectator]) => (
          <PlayerRow
            key={playerId}
            name={spectator.username}
            initials={initialsOf(spectator.username)}
            tone={toneOf(spectator.username)}
            status={
              spectator.isConnected ? m.room.spectator : m.room.reconnecting
            }
            statusIcon={spectator.isConnected ? undefined : 'away'}
            host={playerId === state.owner.playerId}
            you={playerId === room.playerId}
            state={spectator.isConnected ? 'default' : 'away'}
          />
        ))}
      </Scoreboard>
    ) : null;

  const chatPanel = <RoomChat input={input} alertIcon={chat.alertIcon} />;

  const seconds = Math.round(reconnectGraceMs / 1000);

  return (
    <Page
      header={
        <RoomBar
          layout={oneColumn ? 'phone' : 'desktop'}
          game={m.games.of[state.gameType].name}
          room={state.roomName}
          phase={phase}
          onHowToPlay={() => setRules(true)}
          onLeave={reconnecting ? undefined : room.leave}
          viewer={viewer}
          viewerMenu={viewerMenu}
        />
      }
    >
      {reconnecting ? (
        <Notice tone="pending">
          {m.room.reconnectingNotice(state.roomName, seconds)}
        </Notice>
      ) : (
        <>
          {room.spectating && state.isGameStarted && (
            <Notice>{m.room.spectatingNotice}</Notice>
          )}
          {notice}
        </>
      )}
      {phone ? (
        <MobileTabs<View>
          value={view}
          onValueChange={setView}
          tabs={[
            {
              value: 'board',
              label: m.room.board,
              panel: (
                <div className={cx(styles.stage, playColumn)}>
                  {standings && state.isGameStarted && (
                    <StandingsStrip
                      standings={players.map(({ seat }) => ({
                        key: seat.playerId,
                        name: seat.username,
                        initials: initialsOf(seat.username),
                        tone: toneOf(seat.username),
                        value: String(seat.points),
                        you: seat.playerId === room.playerId,
                        away: !seat.isConnected,
                      }))}
                      onOpen={() => setView('players')}
                    />
                  )}
                  {stage}
                  {boardInput && <ChatInput {...input} label={boardInput} />}
                  {newHost && (
                    // Over the top of the board, so nothing under it moves.
                    <div className={styles.toast}>
                      <Notice tone="success">{m.room.nowHost}</Notice>
                    </div>
                  )}
                </div>
              ),
            },
            {
              value: 'players',
              label: m.room.players(players.length),
              panel:
                playersAside || watching ? (
                  <div className={styles.side}>
                    {scoreboard}
                    {watching}
                    {playersAside}
                  </div>
                ) : (
                  scoreboard
                ),
            },
            { value: 'chat', label: m.room.chat, panel: chatPanel },
          ]}
        />
      ) : (
        <div className={styles.room}>
          <div className={styles.stage}>{stage}</div>
          <div className={styles.side}>
            {scoreboard}
            {watching}
            {chatPanel}
          </div>
        </div>
      )}
      <RulesDialog open={rules} onOpenChange={setRules} game={game} />
    </Page>
  );
}

/**
 * True for a few seconds after the host's crown passes to this player, as
 * when the host leaves mid-game, so a phone, whose Players tab is out of
 * sight, says so over the board.
 */
function useBecameHost(host: boolean): boolean {
  const [was, setWas] = useState(host);
  const [shown, setShown] = useState(false);
  // Worked out as the crown moves, not after: the notice shows with it.
  if (host !== was) {
    setWas(host);
    setShown(host);
  }
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(false), HOST_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  return shown;
}
