import { useNavigate } from 'react-router';
import type { AnyLobbyRoomInfo, GameType } from '../../../shared/wire-types';
import { MAX_SPECTATORS } from '../../../shared/room';
import { Card, HowToPlay, RoomRow, type RoomRowStatus } from '../ui';
import { gameInfo, roomPath, type GameInfo } from '../games/catalog';
import { FullRules } from '../games/full-rules';
import { GameIntro } from '../games/game-intro';
import { roomSetting } from '../games/room-setting';
import { defaultRoomNames, useMessages, type Messages } from '../i18n';
import { useLobby } from '../net/use-lobby';
import { useSession } from '../net/session';
import { initialsOf, toneOf } from '../players/avatar';
import { ConnectionLost } from '../shell/connection-lost';
import { Page } from '../shell/page';
import styles from './game.module.css';

/**
 * DL01-DL03, ML01-ML03, MO04: a game's page. What the game is and its ways in,
 * its rooms, live, and how to play it, every rule included; the header's logo
 * leads back to the games, and its avatar changes your name.
 */
export default function GamePage({ gameType }: { gameType: GameType }) {
  const game = gameInfo(gameType);
  const m = useMessages();
  const { lost } = useSession();
  const rooms = useLobby(gameType);

  return (
    <Page>
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
              <Empty />
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

/**
 * The host and the room's setting. A room that kept the name it was offered,
 * "Maya's room", says only its setting, since the name already says who
 * hosts it.
 */
function detailsOf(room: AnyLobbyRoomInfo, m: Messages): string {
  const host = room.owner.username;
  const setting = roomSetting(room, m);
  return defaultRoomNames(host).includes(room.roomName)
    ? setting
    : m.lobby.hostedBy(host, setting);
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
            details={detailsOf(room, m)}
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

/** No rooms yet: the intro's Create a room, just above, makes the first. */
function Empty() {
  const m = useMessages();
  return (
    <Card
      kind="panel"
      title={m.lobby.emptyTitle}
      description={m.lobby.emptyDescription}
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

/**
 * How to play, in the order of the intro's buttons: on your own first, for a
 * game that has it, then in a room, each whole on its own. Full rules opens
 * every rule in place.
 */
function Rules({ game }: { game: GameInfo }) {
  const m = useMessages();
  const text = m.games.of[game.type];
  const solo = text.solo?.howToPlay;
  const room = text.howToPlay;
  return (
    <aside className={styles.rules} aria-labelledby="game-rules">
      <h2 id="game-rules" className={styles.rulesTitle}>
        {m.lobby.howToPlay}
      </h2>
      {solo && (
        <HowToPlay
          heading={m.solo.onYourOwn}
          goal={solo.goal}
          steps={[...solo.steps, solo.score]}
        />
      )}
      <HowToPlay
        heading={m.lobby.playTogether}
        goal={room.goal}
        steps={[...room.steps, room.score]}
      />
      <FullRules game={game.type} />
    </aside>
  );
}
