import { SEATS } from '../../../shared/seats.js';
import { seatCount } from '../../libs/rooms/seats.js';
import type { GameContext, Room } from '../../libs/rooms/types.js';
import { gameOverNotice, resetPoints, standingsOf } from '../../libs/utils.js';
import {
  triosDurationsInSeconds as defaultDurations,
  type TriosDurationsInSeconds,
} from '../../libs/game-clock.js';
import {
  dealTable,
  findTrios,
  isTrio,
  takeTrio,
} from '../../../shared/trios.js';
import { shuffle } from '../../../shared/pairs.js';
import { lockoutOf, type TriosState } from './state.js';
import { itemAt, pickFrom } from '../../../shared/list.js';

type TriosRoom = Room<TriosState>;

/** Ends a player's lockout; its timer, when it fires, finds it gone and leaves it be. */
const clearLockout = (room: TriosRoom, playerId: string) => {
  room.game.lockouts.delete(playerId);
};

/**
 * Owns the race for each table. There are no turns: every claim is judged
 * the moment it arrives, so the first trio to reach the server takes it. The
 * room's clock drives the table (a hint due, or a taken trio on show), and a
 * set of timers ends each locked-out player's lockout.
 */
const createTriosGameEngine = (
  ctx: GameContext,
  durations: TriosDurationsInSeconds = defaultDurations,
) => {
  /** Several per room: one per player locked out. */
  const lockoutTimers = ctx.rooms.timers();

  const roomOf = (roomId: string): TriosRoom | undefined =>
    ctx.rooms.ofType<TriosState>(roomId, 'trios');

  const clearLockouts = (room: TriosRoom) => {
    lockoutTimers.clear(room.roomId);
    room.game.lockouts.clear();
  };

  const startGame = (room: TriosRoom) => {
    const game = room.game;
    clearLockouts(room);
    game.deal = dealTable(Math.random);
    game.found = 0;
    game.lastTrio = null;
    game.lastGame = null;
    room.playerList = resetPoints(room.playerList);
    room.isGameStarted = true;

    console.log(`Trios started in room ${room.roomId}, ${game.trios} trios.`);

    ctx.rooms.announce(room.roomId, 'system', {
      type: 'trios:started',
      trios: game.trios,
    });
    ctx.rooms.emitLobby('trios');
    beginFinding(room);
  };

  /** A table everybody looks at, with the clock running to its first hint. */
  const beginFinding = (room: TriosRoom) => {
    const game = room.game;
    game.phase = 'finding';
    game.findingSince = Date.now();
    game.hint = [];
    game.hintPlan = null;
    ctx.rooms.startPhase(room, durations.hint, () => giveHint(room));
    ctx.rooms.emitState(room);
  };

  /**
   * Nobody has found a trio for a while: mark one card of a trio for
   * everybody, and the next time a second card of the same one.
   */
  const giveHint = (room: TriosRoom) => {
    const game = room.game;
    if (!room.isGameStarted || game.phase !== 'finding') return;

    if (!game.hintPlan) {
      const trios = findTrios(game.deal.table);
      game.hintPlan = shuffle(pickFrom(trios, Math.random), Math.random);
    }
    game.hint = game.hintPlan.slice(0, game.hint.length + 1);

    if (game.hint.length < 2) {
      ctx.rooms.startPhase(room, durations.hint, () => giveHint(room));
    } else {
      ctx.rooms.stopPhase(room);
    }
    ctx.rooms.emitState(room);
  };

  /**
   * `playerId` claims `cards` as a trio. Only during `finding`, and not while
   * locked out. A claim with a card no longer on the table lost a race and is
   * dropped; one on the table that is not a trio locks its player out.
   */
  const claim = (roomId: string, playerId: string, cards: number[]) => {
    const room = roomOf(roomId);
    if (!room?.isGameStarted) return;

    const game = room.game;
    const player = room.playerList[playerId];
    if (!player || game.phase !== 'finding') return;
    if (lockoutOf(game, playerId)) return;
    if (new Set(cards).size !== cards.length) return;

    const places = cards.map((card) => game.deal.table.indexOf(card));
    if (places.includes(-1)) return;

    const [a, b, c] = cards;
    if (
      a === undefined ||
      b === undefined ||
      c === undefined ||
      !isTrio(a, b, c)
    ) {
      lockOut(room, playerId, cards);
      return;
    }

    const inOrder = places.toSorted((x, y) => x - y);
    player.points += 1;
    game.found += 1;
    game.lastTrio = {
      playerId,
      username: player.username,
      cards: inOrder.map((place) => itemAt(game.deal.table, place)),
      places: inOrder,
    };
    game.hint = [];
    game.hintPlan = null;
    game.phase = 'taken';
    ctx.rooms.startPhase(room, durations.taken, () => refill(room, inOrder));

    ctx.rooms.announce(room.roomId, 'success', {
      type: 'trios:found',
      name: player.username,
    });
    ctx.rooms.emitState(room);
  };

  const lockOut = (room: TriosRoom, playerId: string, cards: number[]) => {
    const lockout = {
      endsAt: Date.now() + durations.lockout * 1000,
      cards: [...cards],
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

  /** After a taken trio's pause: new cards in its places, or the end. */
  const refill = (room: TriosRoom, places: number[]) => {
    if (!room.isGameStarted) return;
    const game = room.game;
    if (game.found >= game.trios) {
      endGame(room, { endedEarly: false });
      return;
    }

    const next = takeTrio(game.deal, places, Math.random);
    if (!next) {
      // The table and the deck have no trio left between them.
      endGame(room, { endedEarly: false });
      return;
    }
    game.deal = next;
    beginFinding(room);
  };

  /** The last summary and table stay, for the results screen and a refresh. */
  const endGame = (
    room: TriosRoom,
    { endedEarly }: { endedEarly: boolean },
  ) => {
    ctx.rooms.stopPhase(room);
    clearLockouts(room);
    const game = room.game;

    const standings = standingsOf(room.playerList);

    game.lastGame = {
      endedEarly,
      standings,
      trios: game.trios,
      found: game.found,
    };

    room.isGameStarted = false;
    game.phase = 'waiting';
    game.hint = [];
    game.hintPlan = null;

    ctx.rooms.emitState(room);
    ctx.rooms.announce(
      room.roomId,
      'system',
      gameOverNotice(standings, 'trio'),
    );
    ctx.rooms.emitLobby('trios');
  };

  /** Called after the seat is already gone from `playerList`. */
  const handlePlayerDeparture = (room: TriosRoom, playerId: string) => {
    clearLockout(room, playerId);
    if (!room.isGameStarted) return;

    if (seatCount(room) < SEATS['trios'].min) {
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

type TriosGameEngine = ReturnType<typeof createTriosGameEngine>;

export { createTriosGameEngine };
export type { TriosGameEngine, TriosRoom };
