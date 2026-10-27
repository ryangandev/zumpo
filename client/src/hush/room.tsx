import { itemAt } from '../../../shared/list';
import type {
  HushGameSummary,
  HushLevelRecord,
  HushRoomState,
} from '../../../shared/wire-types';
import {
  Avatar,
  Button,
  HushCard,
  Tag,
  TurnBar,
  type TurnBarProps,
} from '../ui';
import { useMessages, type Messages } from '../i18n';
import { useSecondsLeft } from '../net/use-seconds-left';
import { Fit } from '../shell/fit';
import { initialsOf, toneOf } from '../players/avatar';
import {
  EndedEarlyPanel,
  NextGameUnderBoard,
  RESULT_TITLE,
  ResultsFrame,
  WaitingPanel,
} from '../room/panels';
import { listNames, rankedPlayers, type Seat } from '../room/players';
import { useRoomContext, type Room as RoomOf } from '../room/room-context';
import { RoomLayout, type PlayerLine } from '../room/room-layout';
import { PHONE, useMediaQuery } from '../shell/use-media-query';
import { HUSH_SOUNDS, useCountdownSounds } from './sounds';
import { Divider, HandRow, Pile, TableHead, TablePanel } from './table';
import styles from './room.module.css';

/**
 * The turn bar width under which its hints take a line of their own: the widest
 * of them, who is away and how many cards they hold, beside a play, with
 * 18-character names and its clock, in either language, needs this much beside
 * its main line, with 4 px to spare for a clock's digits and subpixel text
 * (TurnBar's hintRowBelow).
 */
const HINT_ROW_BELOW = 909;

type Room = RoomOf<HushRoomState>;
type Phase = HushRoomState['phase'];

/** The phases a level is played in: the hands are out, and it is hushed. */
const HUSHED: readonly Phase[] = ['countdown', 'playing', 'mistake', 'paused'];

/** HU01-HU08: a Hush room, before, during and after a game. */
export function HushRoom() {
  const m = useMessages();
  const room = useRoomContext<HushRoomState>();
  const { state } = room;
  const players = rankedPlayers(state);
  const inGame = state.isGameStarted;
  const ended = !inGame ? state.lastGame : null;
  return (
    <RoomLayout
      phase={
        inGame
          ? { tone: 'blue', label: m.hush.levelOf(state.level, state.levels) }
          : ended && !ended.endedEarly
            ? { tone: 'lime', label: m.hush.gameOver }
            : ended && players.length < 2
              ? { tone: 'peach', label: m.hush.gameEnded }
              : { tone: 'blue', label: m.hush.waitingRoom }
      }
      stage={inGame ? <Level room={room} /> : <BetweenGames room={room} />}
      players={players.map((seat) => playerLine(state, seat, m))}
      chat={{
        placeholder: m.hush.chatPlaceholder,
        lockedReason:
          inGame && HUSHED.includes(state.phase)
            ? m.hush.hushedChat
            : undefined,
      }}
      // Everybody's points are the levels the team cleared; the rows say
      // what each player holds instead.
      showScores={false}
      sounds={HUSH_SOUNDS}
      nextBeside
    />
  );
}

/** A player by name, or "You" ("you" inside a sentence). */
function nameIn(
  room: Room,
  playerId: string,
  m: Messages,
  first = true,
): string {
  if (playerId === room.playerId) return m.hush.you(first);
  return room.state.playerList[playerId]?.username ?? m.hush.player;
}

const cardsOf = (cards: readonly number[], m: Messages) =>
  listNames(cards.map(String), m);

function BetweenGames({ room }: { room: Room }) {
  const m = useMessages();
  const { state, startGame, starting } = room;
  const count = Object.keys(state.playerList).length;
  const summary = state.lastGame;
  const phone = useMediaQuery(PHONE);

  if (summary && !summary.endedEarly) {
    const { title, detail } = resultOf(summary, m);
    // Off a phone the result takes the turn bar's place, the pile keeps its
    // own under it, the team's result goes under the pile and what comes
    // next beside it, so the table stays where it was.
    return (
      <>
        {phone ? (
          <ResultsFrame
            title={title}
            detail={detail}
            onPlayAgain={startGame}
            starting={starting}
          >
            <TeamResult summary={summary} />
          </ResultsFrame>
        ) : (
          <TurnBar
            label={m.hush.gameOver}
            kind="status"
            main={title}
            meta={detail}
            headingId={RESULT_TITLE}
          />
        )}
        {/* HU07, HU08: the last pile stays on the table. */}
        {state.pile.length > 0 && (
          <TablePanel>
            <TableHead
              title={m.hush.level(
                summary.history.at(-1)?.level ?? state.levels,
              )}
              note={
                summary.won
                  ? m.hush.allCards(state.pile.length + state.discards.length)
                  : m.hush.asEnded
              }
              lives={summary.lives}
            />
            <Pile
              pile={state.pile}
              discards={state.discards}
              empty=""
              inPlay={false}
            />
          </TablePanel>
        )}
        <NextGameUnderBoard />
        {!phone && (
          <section className={styles.summary} aria-labelledby={RESULT_TITLE}>
            <TeamResult summary={summary} />
          </section>
        )}
      </>
    );
  }
  if (summary?.endedEarly && count < 2) return <EndedEarlyPanel />;
  return (
    <WaitingPanel
      aloneTitle={m.hush.alone}
      setup={m.hush.setup(count, state.levels)}
      guestSetup={m.hush.guestSetup(count, state.levels)}
      onStart={startGame}
      starting={starting}
    />
  );
}

/** "Level 2: a life lost". */
function levelLine(
  record: HushLevelRecord,
  last: boolean,
  lost: boolean,
  m: Messages,
) {
  if (!record.cleared && last && lost) {
    return {
      tone: 'peach',
      icon: 'alert',
      text: m.hush.lastLife(record.level),
    } as const;
  }
  if (!record.cleared) {
    return {
      tone: 'peach',
      icon: 'alert',
      text: m.hush.unfinished(record.level),
    } as const;
  }
  if (record.livesLost === 0) {
    return {
      tone: 'lime',
      icon: 'check',
      text: m.hush.clean(record.level, record.lifeBack),
    } as const;
  }
  return {
    tone: 'peach',
    icon: 'alert',
    text: m.hush.livesLost(record.level, record.livesLost),
  } as const;
}

/** HU07, HU08: how the team's game ended: "All 4 levels cleared!". */
function resultOf(summary: HushGameSummary, m: Messages) {
  const lostOn = summary.history.at(-1)?.level ?? summary.levelsCleared + 1;
  return {
    title: summary.won ? m.hush.won(summary.levels) : m.hush.lost(lostOn),
    detail: summary.won
      ? m.hush.wonDetail(summary.lives)
      : m.hush.lostDetail(summary.levelsCleared, summary.levels),
  };
}

/** HU07, HU08: the team's result. Nobody is ranked; every level is listed. */
function TeamResult({ summary }: { summary: HushGameSummary }) {
  const m = useMessages();
  const mostHeld = Math.max(0, ...summary.held.map((h) => h.cards.length));

  return (
    <>
      <section className={styles.block} aria-labelledby="hush-levels">
        <h3 id="hush-levels" className={styles.blockTitle}>
          {m.hush.levelByLevel}
        </h3>
        <ul className={styles.levels}>
          {summary.history.map((record, index) => {
            const line = levelLine(
              record,
              index === summary.history.length - 1,
              !summary.won,
              m,
            );
            return (
              <li key={record.level}>
                <Tag tone={line.tone} icon={line.icon}>
                  {line.text}
                </Tag>
              </li>
            );
          })}
        </ul>
      </section>
      {summary.won ? (
        <section className={styles.block} aria-labelledby="hush-team">
          <h3 id="hush-team" className={styles.blockTitle}>
            {m.hush.playedBy}
          </h3>
          <ul className={styles.team}>
            {summary.standings.map(({ playerId, username }) => (
              <li key={playerId} className={styles.member}>
                <Avatar
                  initials={initialsOf(username)}
                  tone={toneOf(username)}
                />
                <span className={styles.name}>{username}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className={styles.block} aria-labelledby="hush-held">
          <h3 id="hush-held" className={styles.blockTitle}>
            {m.hush.stillHeld}
          </h3>
          <ul className={styles.held}>
            {summary.standings.map(({ playerId, username }) => {
              const cards =
                summary.held.find((h) => h.playerId === playerId)?.cards ?? [];
              return (
                <li key={playerId} className={styles.holder}>
                  <Avatar
                    initials={initialsOf(username)}
                    tone={toneOf(username)}
                  />
                  <span className={styles.name}>{username}</span>
                  {cards.length > 0 ? (
                    // One row, as a hand is, scaled down when it is wider;
                    // every row as wide as the longest, so all share a scale.
                    <Fit align="start" className={styles.heldRow}>
                      <ol
                        className={styles.heldCards}
                        aria-label={m.hush.playerHeld(username)}
                      >
                        {cards.map((card) => (
                          <li key={card}>
                            <HushCard value={card} size="small" />
                          </li>
                        ))}
                        {Array.from(
                          { length: mostHeld - cards.length },
                          (_, index) => (
                            <li
                              key={`room-${index}`}
                              className={styles.room}
                              aria-hidden
                            >
                              <HushCard value={0} size="small" />
                            </li>
                          ),
                        )}
                      </ol>
                    </Fit>
                  ) : (
                    <span className={styles.nothing}>{m.hush.nothingLeft}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

/** HU01-HU06: a level: the turn bar, then the table. */
function Level({ room }: { room: Room }) {
  const m = useMessages();
  const { state, receivedAt, reconnecting } = room;
  const seconds = useSecondsLeft(state.phaseEndsInMs, receivedAt, reconnecting);
  // The count before play opens or resumes, with the digits the clock shows;
  // none while it is played, which has no clock and no beat.
  useCountdownSounds({
    endsInMs: state.phaseEndsInMs,
    receivedAt,
    counting: state.phase === 'countdown',
    paused: reconnecting,
  });
  return (
    <>
      <TurnBar {...turnBar(room, seconds, m)} hintRowBelow={HINT_ROW_BELOW} />
      <TablePanel fitHeight>
        <TableHead {...tableHead(state, m)} />
        <Pile
          pile={state.pile}
          discards={state.discards}
          empty={
            state.phase === 'ready' ? m.hush.dealtWhenReady : m.hush.lowestHere
          }
        />
        <Divider />
        <Hand room={room} />
      </TablePanel>
    </>
  );
}

const cardsLeft = (state: HushRoomState) =>
  Object.values(state.table).reduce((sum, seat) => sum + seat.held, 0);

function tableHead(state: HushRoomState, m: Messages) {
  const { phase, level, lives, pile, discards } = state;
  if (phase === 'ready') {
    return {
      title: m.hush.level(level),
      note: m.hush.cardsEach(level),
      lives,
    };
  }
  if (phase === 'cleared') {
    return {
      title: m.hush.pile,
      note:
        discards.length === 0
          ? m.hush.allPlayed(pile.length)
          : m.hush.playedDiscarded(pile.length, discards.length),
      lives,
    };
  }
  const left = cardsLeft(state);
  return {
    title: m.hush.pile,
    note:
      pile.length === 0
        ? m.hush.lowestFirst
        : left === 0
          ? m.hush.noCards
          : m.hush.cardsToGo(left),
    lives,
  };
}

/** Who is away holding cards: the level waits for them. */
const awayHolders = (state: HushRoomState) =>
  Object.entries(state.playerList).flatMap(([playerId, player]) => {
    const held = state.table[playerId]?.held ?? 0;
    return !player.isConnected && held > 0 ? [{ playerId, held }] : [];
  });

/** The viewer's side of the table, phase by phase. */
function Hand({ room }: { room: Room }) {
  const m = useMessages();
  const { state, playerId, socket, reconnecting } = room;
  const { phase, hand } = state;
  const ready = state.table[playerId]?.ready ?? false;

  // A spectator holds no cards and readies for nothing, but learns the rule
  // before the first deal as the players do.
  if (room.spectating) {
    return (
      <HandRow
        label={m.room.watching}
        message={
          phase === 'ready' && state.level === 1
            ? m.hush.firstRule
            : m.hush.watchingHand
        }
      />
    );
  }

  switch (phase) {
    case 'ready':
      return (
        <HandRow
          label={ready ? m.hush.yourReady : m.hush.readyWhen}
          // Before the first deal, the rule itself: once the chat locks,
          // nobody can ask.
          message={state.level === 1 ? m.hush.firstRule : m.hush.chatTiming}
          action={
            <Button
              disabled={ready || reconnecting}
              onClick={() => socket.emit('hush:ready', state.roomId)}
            >
              {m.hush.readyButton}
            </Button>
          }
          held={ready || reconnecting}
          status={ready ? m.hush.waitingOthers : undefined}
        />
      );
    case 'cleared':
      // Ready comes back with the next level, where it was.
      return (
        <HandRow
          label={m.hush.nextUp}
          message={m.hush.nextLevel(state.level + 1)}
          action={<Button disabled>{m.hush.readyButton}</Button>}
          held
        />
      );
    default:
      break;
  }

  if (hand.length === 0) {
    // Play keeps its room out of sight, so the table does not move.
    return (
      <HandRow
        label={m.hush.hand}
        message={m.hush.handEmpty}
        action={<Button disabled>{m.hush.readyButton}</Button>}
        held
      />
    );
  }
  // Play is held, not taken away, while it cannot be pressed: the cards
  // above it and the button stay where the thumb found them.
  const next = itemAt(hand, 0);
  const play = (
    <Button
      disabled={phase !== 'playing' || reconnecting}
      onClick={() => socket.emit('hush:play', state.roomId, next)}
    >
      {m.hush.play(next)}
    </Button>
  );
  if (phase === 'playing' && !reconnecting) {
    return (
      <HandRow
        label={m.hush.hand}
        cards={hand}
        dealt={state.level}
        action={play}
        status={m.hush.onlyLowest}
      />
    );
  }
  const away = awayHolders(state).map((holder) =>
    nameIn(room, holder.playerId, m),
  );
  return (
    <HandRow
      label={m.hush.hand}
      cards={hand}
      dealt={state.level}
      action={play}
      held
      status={
        phase === 'countdown'
          ? m.hush.opensSoon
          : phase === 'paused'
            ? m.hush.returns(listNames(away, m), away.length)
            : m.hush.goesSoon
      }
    />
  );
}

function turnBar(room: Room, seconds: number, m: Messages): TurnBarProps {
  const { state, reconnecting, playerId } = room;
  const label = m.hush.levelOf(state.level, state.levels);
  // Nobody acts while any of these clocks runs, so each one waits.
  const clock = (forWhat: string) => ({
    seconds,
    label: reconnecting ? m.hush.pausedClock : forWhat,
    waiting: true,
  });

  switch (state.phase) {
    case 'ready': {
      const seats = Object.entries(state.table);
      const readyNames = seats
        .filter(([, seat]) => seat.ready)
        .map(([id]) => nameIn(room, id, m));
      const waitingFor = seats
        .filter(([, seat]) => !seat.ready)
        .map(([id]) => nameIn(room, id, m));
      const meReady =
        room.spectating || (state.table[playerId]?.ready ?? false);
      return {
        label,
        kind: 'status',
        main: m.hush.getReady,
        meta: meReady
          ? m.hush.waitingCount(waitingFor.length)
          : readyNames.length > 0
            ? m.hush.readyCount(readyNames.length)
            : m.hush.pressReady,
      };
    }
    case 'countdown':
      return {
        label,
        kind: 'status',
        main: m.hush.hush,
        meta: m.hush.everyoneHolds(state.level),
        countdown: clock(m.hush.toStart),
      };
    case 'mistake': {
      const mistake = state.lastMistake;
      if (!mistake) break;
      return {
        label,
        kind: 'status',
        main: m.hush.playedCard(
          nameIn(room, mistake.playerId, m),
          mistake.card,
        ),
        // Who held which card is in the chat's alert and on the scoreboard;
        // the bar keeps to a count, which fits it however many held one.
        meta: m.hush.mistakeCount(mistake.discarded.length),
        countdown: clock(m.hush.toGoOn),
      };
    }
    case 'paused': {
      const away = awayHolders(state);
      const names = listNames(
        away.map((holder) => nameIn(room, holder.playerId, m)),
        m,
      );
      return {
        label,
        kind: 'status',
        main: m.hush.paused,
        meta:
          away.length === 1
            ? m.hush.waitingHolder(names, itemAt(away, 0).held)
            : m.hush.waitingHoldersCount(away.length),
        countdown: clock(m.hush.seatHeld),
      };
    }
    case 'cleared': {
      const last = state.lastLevel;
      return {
        label,
        kind: 'status',
        main: m.hush.cleared,
        meta: last?.lifeBack
          ? m.hush.cleanLifeBack
          : last?.livesLost === 0
            ? m.hush.cleanLevel
            : m.hush.costLives(last?.livesLost ?? 0),
        countdown: clock(m.hush.toLevel(state.level + 1)),
      };
    }
    default:
      break;
  }
  return {
    label,
    kind: 'status',
    main: m.hush.hush,
    meta: m.hush.playWhen,
  };
}

/** One player's line on the scoreboard: what they hold, never a score. */
function playerLine(state: HushRoomState, seat: Seat, m: Messages): PlayerLine {
  const held = state.table[seat.playerId]?.held ?? 0;
  if (!seat.isConnected) {
    return {
      seat,
      status: held > 0 ? m.hush.awayCards(held) : m.hush.away,
      statusIcon: 'away',
      state: 'away',
    };
  }
  if (!state.isGameStarted) return { seat, status: m.hush.waiting };
  switch (state.phase) {
    case 'ready':
      return state.table[seat.playerId]?.ready
        ? { seat, status: m.hush.ready, statusIcon: 'check', state: 'scored' }
        : { seat, status: m.hush.gettingReady };
    case 'cleared':
      return {
        seat,
        status: m.hush.levelCleared,
        statusIcon: 'check',
        state: 'scored',
      };
    case 'mistake': {
      const lost = (state.lastMistake?.discarded ?? [])
        .filter((d) => d.playerId === seat.playerId)
        .map((d) => d.card);
      if (lost.length > 0) {
        return {
          seat,
          status: m.hush.lostCards(cardsOf(lost, m), held),
          statusIcon: 'alert',
        };
      }
      break;
    }
    default:
      break;
  }
  return { seat, status: held > 0 ? m.hush.cards(held) : m.hush.noCards };
}
