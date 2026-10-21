import { useState } from 'react';
import { kindOf, MIN_PLAYERS, minutesFor } from '../../../shared/doodle-chain';
import type {
  DoodleChainEntry,
  DoodleChainGameSummary,
  DoodleChainRoomState,
} from '../../../shared/wire-types';
import { Button, FilterChip, Notice, TurnBar } from '../ui';
import { useMessages, type Messages } from '../i18n';
import { ResultsActions, WaitingPanel } from '../room/panels';
import { ordinal, placesOf, rankedPlayers, type Seat } from '../room/players';
import { useRoomContext, type Room as RoomOf } from '../room/room-context';
import { RoomLayout, type PlayerLine } from '../room/room-layout';
import { Chain } from './chain';
import { Step } from './task';
import styles from './room.module.css';

type Room = RoomOf<DoodleChainRoomState>;

/** DC03-DC20: a Doodle Chain room, before, during and after a game. */
export function DoodleChainRoom() {
  const m = useMessages();
  const room = useRoomContext<DoodleChainRoomState>();
  const { state } = room;
  const inGame = state.isGameStarted;
  const revealing = inGame && state.phase === 'reveal';
  const album = !inGame ? state.lastGame : null;
  return (
    <RoomLayout
      phase={
        revealing
          ? { tone: 'lime', label: m.doodleChain.reveal }
          : inGame
            ? {
                tone: 'blue',
                label: m.doodleChain.stepOf(state.step, state.steps),
              }
            : album && !album.endedEarly
              ? { tone: 'lime', label: m.doodleChain.gameOver }
              : album
                ? { tone: 'peach', label: m.doodleChain.gameEnded }
                : { tone: 'blue', label: m.doodleChain.waitingRoom }
      }
      stage={
        revealing ? (
          <Reveal room={room} />
        ) : inGame ? (
          <Step room={room} />
        ) : album ? (
          <Album room={room} summary={album} />
        ) : (
          <Waiting room={room} />
        )
      }
      players={rankedPlayers(state).map((seat) => playerLine(room, seat, m))}
      chat={{ placeholder: m.doodleChain.chatPlaceholder }}
      // Hearts are the score, and there are none until the reveal.
      showScores={revealing || Boolean(album)}
      scoreTitle={album ? m.doodleChain.hearts : undefined}
    />
  );
}

function playerLine(room: Room, seat: Seat, m: Messages): PlayerLine {
  const { state } = room;
  if (!seat.isConnected) {
    return {
      seat,
      status: m.doodleChain.away,
      statusIcon: 'away',
      state: 'away',
    };
  }
  if (!state.isGameStarted) {
    const summary = state.lastGame;
    const standings = summary?.standings ?? [];
    const index = standings.findIndex((s) => s.playerId === seat.playerId);
    if (!summary || index < 0) return { seat, status: m.doodleChain.waiting };
    const favourite = summary.favourites.some(
      ({ chain, step }) =>
        entryAt(summary, chain, step)?.author.playerId === seat.playerId,
    );
    if (favourite) {
      return {
        seat,
        status: m.doodleChain.favourite,
        statusIcon: 'check',
        state: 'scored',
      };
    }
    // A place among players nobody gave a heart says nothing.
    return standings[index]?.points
      ? { seat, status: ordinal(placesOf(standings)[index] ?? 1, m) }
      : { seat, status: m.doodleChain.heartless };
  }
  if (state.phase === 'reveal') {
    return seat.playerId === state.owner.playerId
      ? { seat, status: m.doodleChain.showing, statusIcon: 'forward' }
      : { seat, status: m.doodleChain.watching, statusIcon: 'user' };
  }
  if (state.phase === 'passing') {
    return { seat, status: m.doodleChain.passingStatus, statusIcon: 'forward' };
  }
  const place = state.table[seat.playerId];
  if (place?.sitsOut) {
    return { seat, status: m.doodleChain.sitsOut, statusIcon: 'pending' };
  }
  if (place?.done) {
    return {
      seat,
      status: m.doodleChain.statusDone,
      statusIcon: 'check',
      state: 'scored',
    };
  }
  return {
    seat,
    status: m.doodleChain.working[kindOf(state.step)],
    statusIcon: 'edit',
  };
}

const entryAt = (
  summary: DoodleChainGameSummary,
  chain: number,
  step: number,
): DoodleChainEntry | undefined =>
  summary.chains[chain]?.entries.find((entry) => entry.step === step);

/** DC03, DC04: before a game; it needs three. */
function Waiting({ room }: { room: Room }) {
  const m = useMessages();
  const { state, startGame, starting } = room;
  const count = Object.keys(state.playerList).length;
  const kinds = Array.from({ length: state.steps }, (_, index) =>
    kindOf(index + 1),
  );
  const missing = MIN_PLAYERS - count;
  return (
    <WaitingPanel
      aloneTitle={m.doodleChain.more(missing)}
      aloneDetail={`${m.doodleChain.needsPlayers} ${m.doodleChain.invite(missing)}`}
      setup={m.doodleChain.setup(
        count,
        kinds,
        state.drawingSeconds,
        minutesFor(count, state.drawingSeconds),
      )}
      guestSetup={m.doodleChain.guestSetup(
        count,
        state.steps,
        state.drawingSeconds,
      )}
      onStart={startGame}
      starting={starting}
    />
  );
}

/** DC12, DC13, DC19: the host shows the chains, one entry at a time. */
function Reveal({ room }: { room: Room }) {
  const m = useMessages();
  const { state, playerId, socket, spectating, isHost } = room;
  const reveal = state.reveal;
  if (!reveal) return null;
  const { chain, shown, chains } = reveal;
  const owner = chains[chain]?.owner.username ?? '';
  const length = chains[chain]?.length ?? 0;
  const nextOwner = chains[chain + 1]?.owner.username;
  const host = state.playerList[state.owner.playerId];
  const hostName = state.owner.username;

  const heartOf = (entry: DoodleChainEntry) => {
    if (spectating || entry.author.playerId === playerId) {
      return { count: entry.hearts, state: 'count' } as const;
    }
    const given = reveal.hearts[entry.chain] === entry.step;
    return {
      count: entry.hearts,
      state: given ? 'on' : 'off',
      onPress: () =>
        socket.emit(
          'dc:heart',
          state.roomId,
          entry.chain,
          given ? null : entry.step,
        ),
    } as const;
  };

  return (
    <>
      <TurnBar
        label={m.doodleChain.revealOf(chain + 1, chains.length)}
        kind="status"
        main={m.doodleChain.chainOf(owner)}
        meta={m.doodleChain.shownOf(shown, length)}
      />
      <section className={styles.panel}>
        <Chain entries={reveal.entries[chain] ?? []} heartOf={heartOf} />
        <hr className={styles.divider} />
        {isHost ? (
          <div className={styles.reveal}>
            <p className={styles.hint}>
              {shown < length
                ? length - shown === 1
                  ? m.doodleChain.lastIn(owner)
                  : m.doodleChain.moreIn(length - shown, owner)
                : nextOwner
                  ? m.doodleChain.chainDone(owner, nextOwner)
                  : m.doodleChain.allShown}
            </p>
            <Button
              icon="forward"
              onClick={() =>
                socket.emit('dc:reveal:next', state.roomId, reveal.total)
              }
            >
              {shown < length
                ? m.doodleChain.next
                : nextOwner
                  ? m.doodleChain.nextChain
                  : m.doodleChain.seeAlbum}
            </Button>
          </div>
        ) : (
          <Notice tone="pending">
            {host && !host.isConnected
              ? m.doodleChain.hostAway(hostName)
              : shown >= length && nextOwner
                ? m.doodleChain.hostNext(hostName, nextOwner)
                : m.doodleChain.hostShowing(hostName)}
          </Notice>
        )}
      </section>
    </>
  );
}

/** DC14, DC20: every chain to read again, and the hearts they were given. */
function Album({
  room,
  summary,
}: {
  room: Room;
  summary: DoodleChainGameSummary;
}) {
  const m = useMessages();
  const { startGame, starting } = room;
  const [picked, setPicked] = useState(0);
  const chain = summary.chains[picked] ?? summary.chains[0];
  const entries = summary.chains.reduce(
    (sum, { entries: list }) => sum + list.length,
    0,
  );
  const isFavourite = (entry: DoodleChainEntry) =>
    summary.favourites.some(
      ({ chain: index, step }) => index === entry.chain && step === entry.step,
    );
  const [first] = summary.favourites;
  const favourite = first ? entryAt(summary, first.chain, first.step) : null;
  const favourites = !favourite
    ? m.doodleChain.noHearts
    : summary.favourites.length > 1
      ? m.doodleChain.sharedFavourite(
          summary.favourites.length,
          favourite.hearts,
        )
      : m.doodleChain.favouriteDetail(
          favourite.author.username,
          favourite.kind,
          favourite.hearts,
        );
  const detail = [
    m.doodleChain.albumDetail(summary.chains.length, entries),
    summary.endedEarly ? m.doodleChain.endedEarly : '',
    favourites,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={styles.panel} aria-labelledby="album-title">
      <div className={styles.result}>
        <h2 id="album-title" className={styles.title}>
          {summary.endedEarly ? m.doodleChain.soFar : m.doodleChain.everyChain}
        </h2>
        <p className={styles.detail}>{detail}</p>
      </div>
      <div
        className={styles.chips}
        role="group"
        aria-label={m.doodleChain.chains}
      >
        {summary.chains.map(({ owner }, index) => (
          <FilterChip
            key={owner.playerId}
            selected={chain === summary.chains[index]}
            onSelect={() => setPicked(index)}
          >
            {m.doodleChain.chainOf(owner.username)}
          </FilterChip>
        ))}
      </div>
      {chain && (
        <Chain
          entries={chain.entries}
          heartOf={(entry) => ({ count: entry.hearts, state: 'count' })}
          isFavourite={isFavourite}
        />
      )}
      <hr className={styles.divider} />
      <div className={styles.actions}>
        <ResultsActions onPlayAgain={startGame} starting={starting} />
        <p className={styles.hint}>{m.doodleChain.albumStays}</p>
      </div>
    </section>
  );
}
