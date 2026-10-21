import { SEATS } from '../../../shared/seats.js';
import type { HushDiscard } from '../../models/types.js';
import { seatCount } from '../../libs/rooms/seats.js';
import type { GameContext, Room } from '../../libs/rooms/types.js';
import { resetPoints } from '../../libs/utils.js';
import {
  hushDurationsInSeconds as defaultDurations,
  reconnectGraceInSeconds,
  type HushDurationsInSeconds,
} from '../../libs/game-clock.js';
import { deal, levelsFor, START_LIVES } from '../../../shared/hush.js';
import type { HushState } from './state.js';

type HushRoom = Room<HushState>;

/** The phases a level is being played in: its hands are out, and it is hushed. */
const IN_LEVEL = new Set(['countdown', 'playing', 'mistake', 'paused']);

const nameOf = (room: HushRoom, playerId: string) =>
  room.playerList[playerId]?.username ?? '';

const cardsLeft = (room: HushRoom) =>
  Object.values(room.game.hands).reduce((sum, hand) => sum + hand.length, 0);

/** Dropped players who still hold cards: the level cannot go on without them. */
const awayHolders = (room: HushRoom) =>
  Object.entries(room.playerList)
    .filter(
      ([playerId, seat]) =>
        !seat.isConnected && (room.game.hands[playerId]?.length ?? 0) > 0,
    )
    .map(([playerId]) => playerId);

/** Hushed while a level is played, for everybody. */
const mayChat = (room: HushRoom) => !IN_LEVEL.has(room.game.phase);

/**
 * Owns the level loop. Hush has no turns and, while a level is played, no
 * clock: anybody plays their lowest card at any moment, and the server decides
 * in arrival order whether it went over a card still held. Only the moments
 * around a level are timed, on the room's one clock.
 */
const createHushGameEngine = (
  ctx: GameContext,
  durations: HushDurationsInSeconds = defaultDurations,
  graceInSeconds: number = reconnectGraceInSeconds,
) => {
  const roomOf = (roomId: string): HushRoom | undefined =>
    ctx.rooms.ofType<HushState>(roomId, 'hush');

  /** Starts a timed phase on the room's clock, `onEnd` when it ends. */
  const timed = (room: HushRoom, seconds: number, onEnd: () => void) => {
    room.game.pausedUntil = 0;
    ctx.rooms.startPhase(room, seconds, onEnd);
  };

  /** Nothing is timed: a level is played, or waits for somebody. */
  const untimed = (room: HushRoom) => {
    room.game.pausedUntil = 0;
    ctx.rooms.stopPhase(room);
  };

  const startGame = (room: HushRoom) => {
    const game = room.game;
    game.levels = levelsFor(seatCount(room));
    game.lives = START_LIVES;
    game.history = [];
    game.lastGame = null;
    room.playerList = resetPoints(room.playerList);
    room.isGameStarted = true;

    console.log(`Hush started in room ${room.roomId}, ${game.levels} levels.`);

    ctx.rooms.announce(room.roomId, 'system', {
      type: 'hush:started',
      levels: game.levels,
      lives: START_LIVES,
    });
    ctx.rooms.emitLobby('hush');

    beginReady(room, 1);
  };

  /** Level `level` waits for everybody to be ready. Nobody holds cards yet. */
  const beginReady = (room: HushRoom, level: number) => {
    untimed(room);
    const game = room.game;
    game.phase = 'ready';
    game.level = level;
    game.ready = new Set();
    game.hands = {};
    game.pile = [];
    game.discards = [];
    game.livesLost = 0;
    game.lastMistake = null;
    game.lastLevel = null;
    ctx.rooms.emitState(room);
  };

  const ready = (roomId: string, playerId: string) => {
    const room = roomOf(roomId);
    if (!room?.isGameStarted || !room.playerList[playerId]) return;
    const game = room.game;
    if (game.phase !== 'ready' || game.ready.has(playerId)) return;

    game.ready.add(playerId);
    ctx.rooms.emitState(room);
    dealIfAllReady(room);
  };

  /** Every seated player is ready: deal, and count down to play. */
  const dealIfAllReady = (room: HushRoom) => {
    const game = room.game;
    const seated = Object.keys(room.playerList);
    if (!seated.every((playerId) => game.ready.has(playerId))) return;

    game.hands = deal(seated, game.level, Math.random);
    beginCountdown(room);
  };

  /**
   * Everybody's moment to start from, before play opens or opens again. A
   * level waits instead while somebody who holds cards is away.
   */
  const beginCountdown = (room: HushRoom) => {
    if (awayHolders(room).length > 0) {
      pause(room);
      return;
    }
    room.game.phase = 'countdown';
    timed(room, durations.countdown, () => {
      if (awayHolders(room).length > 0) {
        pause(room);
        return;
      }
      room.game.phase = 'playing';
      untimed(room);
      ctx.rooms.emitState(room);
    });
    ctx.rooms.emitState(room);
  };

  /**
   * Waits for every dropped player who holds cards, until their seat goes.
   * Nothing here ends the pause: the room layer's seat expiry does, by way of
   * a departure. Its clock is the last of those seats to go.
   */
  const pause = (room: HushRoom) => {
    untimed(room);
    const game = room.game;
    game.phase = 'paused';
    game.pausedUntil = Math.max(
      0,
      ...awayHolders(room).map(
        (playerId) => game.seatEndsAt.get(playerId) ?? 0,
      ),
    );
    ctx.rooms.emitState(room);
  };

  /**
   * `playerId` plays `card`, which must still be their lowest: a play names
   * its card so that a double tap, or a card already discarded by a play that
   * arrived first, is not taken for the next one.
   */
  const play = (roomId: string, playerId: string, card: number) => {
    const room = roomOf(roomId);
    if (!room?.isGameStarted || !room.playerList[playerId]) return;
    const game = room.game;
    if (game.phase !== 'playing') return;
    const hand = game.hands[playerId];
    if (!hand || hand[0] !== card) return;

    hand.shift();
    game.pile.push({ card, playerId });

    // Every card under it, wherever it is, is a mistake's to discard.
    const under: HushDiscard[] = Object.entries(game.hands)
      .flatMap(([holder, cards]) =>
        cards
          .filter((held) => held < card)
          .map((held) => ({
            card: held,
            playerId: holder,
            reason: 'mistake' as const,
          })),
      )
      .toSorted((a, b) => a.card - b.card);

    if (under.length === 0) {
      if (cardsLeft(room) === 0) clearLevel(room);
      else ctx.rooms.emitState(room);
      return;
    }

    for (const [holder, cards] of Object.entries(game.hands)) {
      game.hands[holder] = cards.filter((held) => held > card);
    }
    game.discards = [...game.discards, ...under].toSorted(
      (a, b) => a.card - b.card,
    );
    game.lives -= 1;
    game.livesLost += 1;
    game.lastMistake = { playerId, card, discarded: under };

    const holders = [...new Set(under.map((discard) => discard.playerId))];
    const held = holders.map((holder) => ({
      name: nameOf(room, holder),
      cards: under
        .filter((discard) => discard.playerId === holder)
        .map((discard) => discard.card),
    }));
    ctx.rooms.announce(room.roomId, 'alert', {
      type: 'hush:mistake',
      name: nameOf(room, playerId),
      card,
      held,
    });

    if (game.lives === 0) {
      endGame(room, { won: false, endedEarly: false });
      return;
    }
    game.phase = 'mistake';
    timed(room, durations.mistake, () => {
      game.lastMistake = null;
      if (cardsLeft(room) === 0) clearLevel(room);
      else goOn(room);
    });
    ctx.rooms.emitState(room);
  };

  /** Play goes on after a mistake: at once, or after a pause for the away. */
  const goOn = (room: HushRoom) => {
    if (awayHolders(room).length > 0) {
      pause(room);
      return;
    }
    room.game.phase = 'playing';
    untimed(room);
    ctx.rooms.emitState(room);
  };

  /** Every card is played or discarded. A level that cost no life wins one back. */
  const clearLevel = (room: HushRoom) => {
    untimed(room);
    const game = room.game;
    const clean = game.livesLost === 0;
    const lifeBack = clean && game.lives < START_LIVES;
    if (lifeBack) game.lives += 1;
    const record = {
      level: game.level,
      livesLost: game.livesLost,
      lifeBack,
      cleared: true,
    };
    game.history.push(record);
    for (const player of Object.values(room.playerList)) {
      player.points = game.history.length;
    }

    if (game.level === game.levels) {
      endGame(room, { won: true, endedEarly: false });
      return;
    }

    ctx.rooms.announce(room.roomId, 'score', {
      type: 'hush:cleared',
      level: game.level,
      clean,
      lifeBack,
    });
    game.phase = 'cleared';
    game.lastLevel = record;
    timed(room, durations.cleared, () => beginReady(room, room.game.level + 1));
    ctx.rooms.emitState(room);
  };

  /**
   * The team won, lost its last life, or is too few to go on. The last pile
   * stays on the table, and every card still held is shown.
   */
  const endGame = (
    room: HushRoom,
    { won, endedEarly }: { won: boolean; endedEarly: boolean },
  ) => {
    untimed(room);
    const game = room.game;
    // A level cut short goes into the record as not cleared; the last level,
    // just won, is in it already.
    if (IN_LEVEL.has(game.phase) && game.history.at(-1)?.level !== game.level) {
      game.history.push({
        level: game.level,
        livesLost: game.livesLost,
        lifeBack: false,
        cleared: false,
      });
    }
    const levelsCleared = game.history.filter(
      (record) => record.cleared,
    ).length;
    const standings = Object.entries(room.playerList).map(
      ([playerId, player]) => {
        player.points = levelsCleared;
        return { playerId, username: player.username, points: levelsCleared };
      },
    );
    const held = Object.entries(game.hands)
      .filter(
        ([playerId, cards]) => cards.length > 0 && room.playerList[playerId],
      )
      .map(([playerId, cards]) => ({ playerId, cards: [...cards] }));

    game.lastGame = {
      endedEarly,
      standings,
      levels: game.levels,
      levelsCleared,
      won,
      lives: game.lives,
      history: game.history,
      held,
    };

    const lostOn = game.level;
    room.isGameStarted = false;
    game.phase = 'waiting';
    game.level = 0;
    game.lives = START_LIVES;
    game.hands = {};
    game.ready = new Set();
    game.livesLost = 0;
    game.lastMistake = null;
    game.lastLevel = null;
    game.history = [];

    ctx.rooms.emitState(room);
    if (won) {
      ctx.rooms.announce(room.roomId, 'success', {
        type: 'hush:won',
        levels: game.lastGame.levels,
      });
    } else if (!endedEarly) {
      ctx.rooms.announce(room.roomId, 'alert', {
        type: 'hush:lost',
        level: lostOn,
        cleared: levelsCleared,
        levels: game.lastGame.levels,
      });
    }
    ctx.rooms.emitLobby('hush');
  };

  /** The seat is held: a level waits for a player who still holds cards. */
  const handleDisconnect = (room: HushRoom, playerId: string) => {
    room.game.seatEndsAt.set(playerId, Date.now() + graceInSeconds * 1000);
    if (!room.isGameStarted) return;
    const { phase } = room.game;
    if (phase === 'paused') pause(room);
    else if (
      (phase === 'countdown' || phase === 'playing') &&
      awayHolders(room).includes(playerId)
    ) {
      pause(room);
    }
    // In a mistake, the pause starts when it ends; before a level or after
    // one, nobody holds cards.
  };

  /** Back in time: once nobody who holds cards is away, a countdown resumes. */
  const handleReturn = (room: HushRoom, playerId: string) => {
    room.game.seatEndsAt.delete(playerId);
    if (!room.isGameStarted || room.game.phase !== 'paused') return;
    if (awayHolders(room).length > 0) pause(room);
    else beginCountdown(room);
  };

  /**
   * Called after the seat is already gone from `playerList`. Their cards are
   * shown and discarded with no life lost: it was nobody's mistake.
   */
  const handlePlayerDeparture = (room: HushRoom, playerId: string) => {
    const game = room.game;
    game.seatEndsAt.delete(playerId);
    if (!room.isGameStarted) return;
    game.ready.delete(playerId);

    const cards = game.hands[playerId] ?? [];
    delete game.hands[playerId];
    if (cards.length > 0) {
      game.discards = [
        ...game.discards,
        ...cards.map((card) => ({ card, playerId, reason: 'left' as const })),
      ].toSorted((a, b) => a.card - b.card);
    }

    if (seatCount(room) < SEATS.hush.min) {
      ctx.rooms.announce(room.roomId, 'alert', { type: 'game:interrupted' });
      endGame(room, { won: false, endedEarly: true });
      return;
    }

    if (cards.length > 0) {
      ctx.rooms.announce(
        room.roomId,
        'system',
        // The room has just said who left; their name is gone with the seat.
        { type: 'hush:discarded', cards },
      );
    }

    switch (game.phase) {
      case 'ready':
        dealIfAllReady(room);
        return;
      case 'countdown':
      case 'playing':
      case 'paused':
        if (cardsLeft(room) === 0) clearLevel(room);
        else if (cards.length > 0 || game.phase === 'paused') {
          beginCountdown(room);
        }
        return;
      default:
        // A mistake on show, or a cleared level, goes on by itself.
        return;
    }
  };

  return {
    startGame,
    ready,
    play,
    mayChat,
    handleDisconnect,
    handleReturn,
    handlePlayerDeparture,
  };
};

type HushGameEngine = ReturnType<typeof createHushGameEngine>;

export { createHushGameEngine };
export type { HushGameEngine, HushRoom };
