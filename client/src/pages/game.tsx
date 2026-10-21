import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import type { AnyLobbyRoomInfo, GameType } from '../../../shared/wire-types';
import { MAX_SPECTATORS } from '../../../shared/room';
import { Button, Card, RoomRow, type RoomRowStatus } from '../ui';
import { gameInfo, roomPath, type GameInfo } from '../games/catalog';
import { GameIntro } from '../games/game-intro';
import { roomSetting } from '../games/room-setting';
import { useMessages, type Messages } from '../i18n';
import { useLobby } from '../net/use-lobby';
import { useSession } from '../net/session';
import { initialsOf, toneOf } from '../players/avatar';
import { roomNameOf } from '../room/players';
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
 * Who hosts a room and how it is set up; a room named after its host says
 * the host once, in its name.
 */
function details(room: AnyLobbyRoomInfo, m: Messages): string {
  const setting = roomSetting(room, m);
  if (room.roomName === '' && setting) return setting;
  return m.lobby.hostedBy(room.owner.username, setting);
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
            name={roomNameOf(room, m)}
            details={details(room, m)}
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
 * The rules at a glance, in the order of the intro's buttons: on your own
 * first, for a game that has it, then in a room. Full rules opens every rule
 * in place.
 */
function Rules({ game }: { game: GameInfo }) {
  const m = useMessages();
  const text = m.games.of[game.type];
  const [open, setOpen] = useState(false);
  const fullId = useId();
  return (
    <aside className={styles.rules} aria-labelledby="game-rules">
      <h2 id="game-rules" className={styles.rulesTitle}>
        {m.lobby.howToPlay}
      </h2>
      <p className={styles.rulesText}>{text.lobbySummary}</p>
      {text.solo && (
        <Facts
          id="game-rules-solo"
          title={m.solo.onYourOwn}
          facts={text.solo.facts}
        />
      )}
      <Facts
        id="game-rules-room"
        title={m.lobby.playTogether}
        facts={text.lobbyFacts}
      />
      <Button
        variant="secondary"
        icon="chevron-down"
        className={styles.fullRules}
        aria-expanded={open}
        aria-controls={fullId}
        onClick={() => setOpen(!open)}
      >
        {m.lobby.fullRules}
      </Button>
      <div id={fullId} className={styles.full} hidden={!open}>
        {text.rules.split(/\n\s*\n/).map((paragraph) => (
          <p key={paragraph} className={styles.rulesText}>
            {paragraph}
          </p>
        ))}
      </div>
    </aside>
  );
}

function Facts({
  id,
  title,
  facts,
}: {
  id: string;
  title: string;
  facts: readonly string[];
}) {
  return (
    <section className={styles.mode} aria-labelledby={id}>
      <h3 id={id} className={styles.modeTitle}>
        {title}
      </h3>
      <ul className={styles.facts}>
        {facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
    </section>
  );
}
