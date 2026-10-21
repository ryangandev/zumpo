import { useState, type ReactNode } from 'react';
import { MAX_SPECTATORS } from '../../../shared/room';
import {
  ChatInput,
  MobileTabs,
  Notice,
  PlayerRow,
  RoomBar,
  Scoreboard,
  type PlayerRowProps,
  type GlyphName,
  type TagTone,
} from '../ui';
import { gameInfo } from '../games/catalog';
import { useMessages } from '../i18n';
import { initialsOf, toneOf } from '../players/avatar';
import { Page, useViewer } from '../shell/page';
import { ONE_COLUMN, PHONE, useMediaQuery } from '../shell/use-media-query';
import { RulesDialog } from './dialogs';
import { RecentChat, RoomChat, useUnreadChat } from './room-chat';
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
   * On a phone, the newest few chat lines under the board, read-only, so
   * guesses can be watched without leaving it: Draw & Guess's, for the drawer
   * as much as for the guessers.
   */
  recentChat?: boolean;
  /**
   * The scoreboard's points; off where everybody's are the same, as in Hush,
   * whose team scores together and whose rows say what each player holds.
   */
  showScores?: boolean;
  /** The scoreboard's title, where its scores are not points: "Hearts". */
  scoreTitle?: string;
  /** On a phone, more under the scoreboard on the Players tab: the race. */
  playersAside?: ReactNode;
}

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
  recentChat = false,
  showScores = true,
  scoreTitle,
  playersAside,
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
  // The chat is read wherever it shows: always beside a desktop room, on a
  // phone in its tab or in the lines under the board.
  const unread = useUnreadChat(
    !phone || view === 'chat' || (view === 'board' && recentChat),
  );

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
                <div className={styles.stage}>
                  {stage}
                  {recentChat && <RecentChat alertIcon={chat.alertIcon} />}
                  {boardInput && <ChatInput {...input} label={boardInput} />}
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
            { value: 'chat', label: m.room.chat, panel: chatPanel, unread },
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
