import { SEATS } from '../../../shared/seats.js';
import { seatCount } from '../../libs/rooms/seats.js';
import type { GameContext, Room } from '../../libs/rooms/types.js';
import { gameOverNotice, resetPoints, standingsOf } from '../../libs/utils.js';
import {
  snapDurationsInSeconds as defaultDurations,
  type SnapDurationsInSeconds,
} from '../../libs/game-clock.js';
import { cardsToTake, dealDeck, judgeTap } from '../../../shared/snap.js';
import { lockoutOf, type SnapState } from './state.js';

type SnapRoom = Room<SnapState>;

/** Ends a player's lockout; its timer, when it fires, finds it gone and leaves it be. */
const clearLockout = (room: SnapRoom, playerId: string) => {
  room.game.lockouts.delete(playerId);
};

/**
 * Owns the race for each middle card. There are no turns: every claim is
 * judged the moment it arrives, so the first match to reach the server takes
 * the card. The room's clock runs only while a taken card is on show, and a
 * set of timers ends each locked-out player's lockout.
 */
const createSnapGameEngine = (
  ctx: GameContext,
  durations: SnapDurationsInSeconds = defaultDurations,
) => {
  /** Several per room: one per player locked out. */
  const lockoutTimers = ctx.rooms.timers();

  const roomOf = (roomId: string): SnapRoom | undefined =>
    ctx.rooms.ofType<SnapState>(roomId, 'snap');

  const clearLockouts = (room: SnapRoom) => {
    lockoutTimers.clear(room.roomId);
    room.game.lockouts.clear();
  };

  /** A new deck: a card to each player, the next in the middle, the rest the pile. */
  const startGame = (room: SnapRoom) => {
    const game = room.game;
    clearLockouts(room);
    const players = Object.keys(room.playerList);
    const deck = dealDeck(Math.random);
    game.hands = new Map(
      players.flatMap((playerId, index) => {
        const card = deck[index];
        return card ? [[playerId, card] as const] : [];
      }),
    );
    const [first, ...pile] = deck.slice(players.length);
    game.cards = cardsToTake(players.length);
    game.taken = 0;
    game.pile = pile;
    game.middle = first ? { number: 0, symbols: [...first] } : null;
    game.lastTake = null;
    game.lastGame = null;
    room.playerList = resetPoints(room.playerList);
    room.isGameStarted = true;

    console.log(`Snap started in room ${room.roomId}, ${game.cards} cards.`);

    ctx.rooms.announce(room.roomId, 'system', {
      type: 'snap:started',
      cards: game.cards,
    });
    ctx.rooms.emitLobby('snap');
    beginFinding(room);
  };

  /** A middle card everybody looks at, with no deadline. */
  const beginFinding = (room: SnapRoom) => {
    const game = room.game;
    game.phase = 'finding';
    game.cardSince = Date.now();
    ctx.rooms.stopPhase(room);
    ctx.rooms.emitState(room);
  };

  /**
   * `playerId` taps `symbol`, meaning it for the middle card numbered
   * `number`. Only during `finding`, and not while locked out. A claim for a
   * card no longer in play lost a race and is dropped; a symbol on only one
   * of the two cards locks its player out; one on neither was never on their
   * screen, and is dropped.
   */
  const claim = (
    roomId: string,
    playerId: string,
    number: number,
    symbol: number,
  ) => {
    const room = roomOf(roomId);
    if (!room?.isGameStarted) return;

    const game = room.game;
    const player = room.playerList[playerId];
    const mine = game.hands.get(playerId);
    const middle = game.middle;
    if (!player || !mine || !middle || game.phase !== 'finding') return;
    if (lockoutOf(game, playerId)) return;
    if (number !== middle.number) return;

    const tap = judgeTap(mine, middle.symbols, symbol);
    if (tap === 'neither') return;
    if (tap !== 'match') {
      lockOut(room, playerId, { symbol, on: tap }, middle.number);
      return;
    }

    player.points += 1;
    game.taken += 1;
    game.lastTake = {
      playerId,
      username: player.username,
      number: middle.number,
      symbol,
    };
    game.phase = 'taken';
    ctx.rooms.startPhase(room, durations.taken, () => turnNext(room, playerId));

    ctx.rooms.announce(room.roomId, 'success', {
      type: 'snap:took',
      name: player.username,
    });
    ctx.rooms.emitState(room);
  };

  const lockOut = (
    room: SnapRoom,
    playerId: string,
    miss: { symbol: number; on: 'mine' | 'middle' },
    card: number,
  ) => {
    const lockout = {
      endsAt: Date.now() + durations.lockout * 1000,
      miss,
      card,
    };
    room.game.lockouts.set(playerId, lockout);
    lockoutTimers.add(room.roomId, durations.lockout * 1000, () => {
      // Only this lockout: not one since cleared by a new game or a departure.
      if (room.game.lockouts.get(playerId) !== lockout) return;
      clearLockout(room, playerId);
      ctx.rooms.emitState(room);
    });
    ctx.rooms.emitState(room);
  };

  /**
   * After a taken card's pause: it becomes its taker's card, if they are
   * still here, and the next card is turned up, or the game ends.
   */
  const turnNext = (room: SnapRoom, takerId: string) => {
    if (!room.isGameStarted) return;
    const game = room.game;
    if (game.middle && room.playerList[takerId]) {
      game.hands.set(takerId, [...game.middle.symbols]);
    }
    const [next, ...rest] = game.pile;
    if (!next) {
      endGame(room, { endedEarly: false });
      return;
    }
    game.pile = rest;
    game.middle = { number: game.taken, symbols: [...next] };
    beginFinding(room);
  };

  /** The last summary and middle card stay, for the results screen and a refresh. */
  const endGame = (room: SnapRoom, { endedEarly }: { endedEarly: boolean }) => {
    ctx.rooms.stopPhase(room);
    clearLockouts(room);
    const game = room.game;

    const standings = standingsOf(room.playerList);

    game.lastGame = {
      endedEarly,
      standings,
      cards: game.cards,
      taken: game.taken,
    };

    room.isGameStarted = false;
    game.phase = 'waiting';
    game.pile = [];

    ctx.rooms.emitState(room);
    ctx.rooms.announce(
      room.roomId,
      'system',
      gameOverNotice(standings, 'card'),
    );
    ctx.rooms.emitLobby('snap');
  };

  /** Called after the seat is already gone from `playerList`. */
  const handlePlayerDeparture = (room: SnapRoom, playerId: string) => {
    clearLockout(room, playerId);
    room.game.hands.delete(playerId);
    if (!room.isGameStarted) return;

    if (seatCount(room) < SEATS['snap'].min) {
      ctx.rooms.announce(room.roomId, 'alert', { type: 'game:interrupted' });
      endGame(room, { endedEarly: true });
    }
  };

  return {
    startGame,
    claim,
    handlePlayerDeparture,
  };
};

type SnapGameEngine = ReturnType<typeof createSnapGameEngine>;

export { createSnapGameEngine };
export type { SnapGameEngine, SnapRoom };
