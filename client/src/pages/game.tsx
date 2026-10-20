import { useNavigate } from 'react-router';
import type { AnyLobbyRoomInfo, GameType } from '../../../shared/wire-types';
import { MAX_SPECTATORS } from '../../../shared/room';
import { ButtonLink, Card, RoomRow, type RoomRowStatus } from '../ui';
import {
  createRoomPath,
  gameInfo,
  roomPath,
  type GameInfo,
} from '../games/catalog';
import { GameIntro } from '../games/game-intro';
import { roomSetting } from '../games/room-setting';
import { useMessages } from '../i18n';
import { useLobby } from '../net/use-lobby';
import { useSession } from '../net/session';
import { initialsOf, toneOf } from '../players/avatar';
import { ConnectionLost } from '../shell/connection-lost';
import { NameMenuButton } from '../shell/name-menu';
import { Page } from '../shell/page';
import styles from './game.module.css';

/**
 * DL01-DL03, ML01-ML03, MO04: a game's page. What the game is and its ways in,
 * its rooms, live, and how to play it; you pick the game on the home page and
 * how to play it here.
 */
export default function GamePage({ gameType }: { gameType: GameType }) {
  const game = gameInfo(gameType);
  const m = useMessages();
  const { lost, name } = useSession();
  const rooms = useLobby(gameType);

  return (
    <Page>
      <div className={styles.actions}>
        <ButtonLink to="/" variant="secondary" icon="back">
          {m.shell.backToGames}
        </ButtonLink>
        <NameMenuButton variant="quiet">
          {m.lobby.playingAs(name)}
        </NameMenuButton>
      </div>
      <div className={styles.layout}>
        <div className={styles.main}>
          <GameIntro game={game} titleId="game-name" />
          <section className={styles.rooms} aria-labelledby="game-rooms">
            <h2 id="game-rooms" className={styles.roomsTitle}>
              {m.lobby.title(m.games.of[gameType].name)}
            </h2>
            {lost ? (
              <ConnectionLost />
            ) : rooms === null ? (
              <Loading />
            ) : rooms.length === 0 ? (
              <Empty gameType={gameType} />
            ) : (
              <RoomList rooms={rooms} />
            )}
          </section>
        </div>
        <Rules game={game} />
      </div>
    </Page>
  );
}

function statusOf(room: AnyLobbyRoomInfo): RoomRowStatus {
  if (room.status === 'In Progress') return 'playing';
  if (room.status === 'Full') return 'full';
  return room.hasPassword ? 'private' : 'open';
}

function RoomList({ rooms }: { rooms: AnyLobbyRoomInfo[] }) {
  const navigate = useNavigate();
  const m = useMessages();
  return (
    <>
      <ul className={styles.list} aria-labelledby="game-rooms">
        {rooms.map((room) => (
          <RoomRow
            key={room.roomId}
            name={room.roomName}
            details={m.lobby.hostedBy(
              room.owner.username,
              roomSetting(room, m),
            )}
            host={{
              initials: initialsOf(room.owner.username),
              tone: toneOf(room.owner.username),
            }}
            players={room.currentPlayerCount}
            seats={room.maxPlayers}
            status={statusOf(room)}
            onJoin={() => navigate(roomPath(room.gameType, room.roomId))}
            // A room under way or full takes a latecomer as a spectator.
            onWatch={
              room.spectatorCount < MAX_SPECTATORS
                ? () => navigate(roomPath(room.gameType, room.roomId))
                : undefined
            }
          />
        ))}
      </ul>
      <p className={styles.count}>{m.lobby.liveCount(rooms.length)}</p>
    </>
  );
}

function Empty({ gameType }: { gameType: GameType }) {
  const m = useMessages();
  return (
    <Card
      kind="panel"
      title={m.lobby.emptyTitle}
      description={m.lobby.emptyDescription}
      actions={
        <ButtonLink to={createRoomPath(gameType)}>
          {m.lobby.createFirstRoom}
        </ButtonLink>
      }
    />
  );
}

function Loading() {
  const m = useMessages();
  return (
    <>
      <Card
        kind="panel"
        title={m.lobby.loadingTitle}
        description={m.lobby.loadingDescription}
        busy
      />
      <div className={styles.skeleton} aria-hidden="true" />
      <div className={styles.skeleton} aria-hidden="true" />
      <div className={styles.skeleton} aria-hidden="true" />
    </>
  );
}

/** The rules at a glance, in a room and on your own, and a link to them all. */
function Rules({ game }: { game: GameInfo }) {
  const m = useMessages();
  const text = m.games.of[game.type];
  return (
    <aside className={styles.rules} aria-labelledby="game-rules">
      <h2 id="game-rules" className={styles.rulesTitle}>
        {m.shell.nav.howToPlay}
      </h2>
      <p className={styles.rulesText}>{text.lobbySummary}</p>
      <section className={styles.mode} aria-labelledby="game-rules-room">
        <h3 id="game-rules-room" className={styles.modeTitle}>
          {m.lobby.playTogether}
        </h3>
        <p className={styles.rulesText}>{text.lobbyFacts.join('\n')}</p>
      </section>
      {text.solo && (
        <section className={styles.mode} aria-labelledby="game-rules-solo">
          <h3 id="game-rules-solo" className={styles.modeTitle}>
            {m.solo.onYourOwn}
          </h3>
          <p className={styles.rulesText}>{text.solo.facts.join('\n')}</p>
        </section>
      )}
      <ButtonLink to={`/how-to-play#rules-${game.type}`} variant="secondary">
        {m.lobby.fullRules}
      </ButtonLink>
    </aside>
  );
}
