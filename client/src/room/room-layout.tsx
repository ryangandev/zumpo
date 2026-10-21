import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MAX_SPECTATORS } from '../../../shared/room';
import type { PlayerInfo, SpectatorInfo } from '../../../shared/wire-types';
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
import {
  ONE_COLUMN,
  PHONE,
  TOUCH,
  useMediaQuery,
} from '../shell/use-media-query';
import { useStartFocus } from '../shell/use-start-focus';
import { useTurnTitle } from './use-turn-title';
import { cx } from '../ui/cx';
import { RulesDialog } from './dialogs';
import { RecentChat, RoomChat, useUnreadChat } from './room-chat';
import { useRoomContext } from './room-context';
import { roomNameOf, type RaceStanding, type Seat } from './players';
import styles from './room-layout.module.css';

export interface PlayerLine {
  seat: Seat;
  status: string;
  statusIcon?: PlayerRowProps['statusIcon'];
  state?: PlayerRowProps['state'];
  /**
   * What a phone's standings strip shows for them instead of their points:
   * a race's progress, where nobody scores until somebody solves it.
   */
  standing?: RaceStanding;
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
    /**
     * Each new value takes the keyboard to the chat box, as a guessing turn
     * starts; never under a finger, whose keyboard would cover the board.
     */
    focusKey?: string;
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
  /**
   * Whether a phone's Board tab shows the standings strip while a game is
   * on; by default where scores are shown. Off where the board itself shows
   * everyone, as Gomoku's seats do.
   */
  standings?: boolean;
  /**
   * This player's go, which a clock runs against: a drawer's word, a bid, a
   * flip, a stone. Out of sight it is said in the window's title, and on a
   * phone with another tab open, on the Board tab.
   */
  yourTurn?: boolean;
}

/** How long a phone says "You're the host now", or who went, over the board. */
const NOTICE_MS = 5000;

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
  standings = showScores,
  yourTurn = false,
}: RoomLayoutProps) {
  const room = useRoomContext();
  const { state, reconnecting, reconnectGraceMs } = room;
  const game = gameInfo(state.gameType);
  const m = useMessages();
  const phone = useMediaQuery(PHONE);
  const touch = useMediaQuery(TOUCH);
  const oneColumn = useMediaQuery(ONE_COLUMN);
  const [view, setView] = useState<View>('board');
  const [rules, setRules] = useState(false);
  useTurnTitle(yourTurn);
  const { viewer, viewerMenu } = useViewer({
    seatName: room.me.username,
  });
  const newHost = useBecameHost(state.owner.playerId === room.playerId);
  const gone = usePlayerGone(state.playerList, state.spectators, room.playerId);
  // A game cut short as the others left ends on a panel that says so, and
  // who is host now: a notice over its heading would only hide it.
  const endedAlone =
    !state.isGameStarted &&
    state.lastGame?.endedEarly === true &&
    Object.keys(state.playerList).length < 2;

  const input = {
    onSend: room.sendChat,
    placeholder: chat.placeholder,
    lockedReason: reconnecting ? m.room.reconnecting : chat.lockedReason,
  };

  // Before a first game every score is 0 and everybody is waiting: the rows
  // say only who is here, and who is away.
  const firstLobby = !state.isGameStarted && state.lastGame === null;

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
          status={firstLobby && rowState !== 'away' ? undefined : status}
          statusIcon={statusIcon}
          score={showScores && !firstLobby ? seat.points : undefined}
          host={seat.playerId === state.owner.playerId}
          you={seat.playerId === room.playerId}
          state={rowState}
        />
      ))}
    </Scoreboard>
  );

  const spectators = Object.entries(state.spectators);
  // Folded to one line in the side column beside a desktop room, where the
  // chat under it needs the height. In one column nothing sits under it, and
  // a phone's Players tab is about who is here, so there it is open.
  const watching =
    spectators.length > 0 ? (
      <Scoreboard
        title={m.room.watching}
        players={spectators.length}
        seats={MAX_SPECTATORS}
        folded={
          oneColumn
            ? undefined
            : m.room.listNames(spectators.map(([, s]) => s.username))
        }
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

  const chatPanel = (
    <RoomChat
      input={{ ...input, focusKey: touch ? undefined : chat.focusKey }}
      alertIcon={chat.alertIcon}
    />
  );
  // The chat is read wherever it shows: always beside a desktop room, on a
  // phone in its tab or in the lines under the board.
  const unread = useUnreadChat(
    !phone || view === 'chat' || (view === 'board' && recentChat),
  );

  const seconds = Math.round(reconnectGraceMs / 1000);

  // Start game and Play again go as they are pressed: the game takes the
  // keyboard. Only the game itself, not a phone's standings strip over it.
  const stageRef = useRef<HTMLDivElement>(null);
  useStartFocus(state.isGameStarted, stageRef);
  const gameView = (
    <div ref={stageRef} className={styles.game}>
      {stage}
    </div>
  );

  return (
    <Page
      header={
        <RoomBar
          layout={oneColumn ? 'phone' : 'desktop'}
          game={m.games.of[state.gameType].name}
          room={roomNameOf(state, m)}
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
          {m.room.reconnectingNotice(roomNameOf(state, m), seconds)}
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
              turn: yourTurn && view !== 'board',
              panel: (
                <div className={cx(styles.stage, playColumn)}>
                  {standings && state.isGameStarted && (
                    <StandingsStrip
                      standings={players.map(({ seat, standing }) => ({
                        key: seat.playerId,
                        name: seat.username,
                        initials: initialsOf(seat.username),
                        tone: toneOf(seat.username),
                        value: standing?.value ?? String(seat.points),
                        mark: standing?.mark,
                        you: seat.playerId === room.playerId,
                        away: !seat.isConnected,
                      }))}
                      onOpen={() => setView('players')}
                    />
                  )}
                  {gameView}
                  {recentChat && <RecentChat alertIcon={chat.alertIcon} />}
                  {boardInput && <ChatInput {...input} label={boardInput} />}
                  {endedAlone ? null : newHost ? (
                    // Over the top of the board, so nothing under it moves.
                    // A host who left hands the crown on: one line says both.
                    <div className={styles.toast}>
                      <Notice tone="success">
                        {gone?.left
                          ? m.room.leftNowHost(gone.name)
                          : m.room.nowHost}
                      </Notice>
                    </div>
                  ) : (
                    gone && (
                      <div className={styles.toast}>
                        <Notice>
                          {gone.left
                            ? m.room.playerLeft(gone.name)
                            : m.room.playerAway(gone.name)}
                        </Notice>
                      </div>
                    )
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
            { value: 'chat', label: m.room.chat, panel: chatPanel, unread },
          ]}
        />
      ) : (
        <div className={styles.room}>
          <div className={styles.stage}>{gameView}</div>
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
    const timer = setTimeout(() => setShown(false), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [shown]);
  return shown;
}

interface Gone {
  name: string;
  /** Left the room, rather than lost the connection for now. */
  left: boolean;
}

/**
 * The player who last went, for a few seconds: their connection dropped, or
 * they left the room. A phone's Players tab and chat are out of sight, so it
 * says so over the board. A player who comes back clears it, and one who
 * only moved to the stands has not gone anywhere.
 */
function usePlayerGone(
  players: Record<string, PlayerInfo>,
  spectators: Record<string, SpectatorInfo>,
  me: string,
): Gone | null {
  const [was, setWas] = useState(players);
  const [gone, setGone] = useState<(Gone & { playerId: string }) | null>(null);
  // Worked out as the seats change, not after: the notice shows with them.
  if (players !== was) {
    setWas(players);
    let news = gone;
    for (const [playerId, seat] of Object.entries(was)) {
      if (playerId === me) continue;
      const now = players[playerId];
      if (!now && !(playerId in spectators)) {
        news = { playerId, name: seat.username, left: true };
      } else if (now && seat.isConnected && !now.isConnected) {
        news = { playerId, name: now.username, left: false };
      }
    }
    if (news && news === gone && players[news.playerId]?.isConnected) {
      news = null;
    }
    if (news !== gone) setGone(news);
  }
  useEffect(() => {
    if (!gone) return;
    const timer = setTimeout(() => setGone(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [gone]);
  return gone;
}
