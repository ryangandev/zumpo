import { SEATS } from '../../../shared/seats.js';
import type { PairsSettings } from '../../models/types.js';
import { seatCount, seatOf } from '../../libs/rooms/seats.js';
import type { GameContext, Room } from '../../libs/rooms/types.js';
import { gameOverNotice, resetPoints, standingsOf } from '../../libs/utils.js';
import {
  pairsDurationsInSeconds as defaultDurations,
  type PairsDurationsInSeconds,
} from '../../libs/game-clock.js';
import { dealDeck, PAIRS_BOARDS } from '../../../shared/pairs.js';
import { pairsFound, playerAfter, type PairsState } from './state.js';
import { itemAt, shuffle } from '../../../shared/list.js';

type PairsRoom = Room<PairsState>;

/**
 * Owns the turn loop. Unlike Minesweeper or Make 24, a Pairs board belongs to
 * one player at a time: they turn over two cards, keep the turn while they
 * find pairs, and pass it on with a miss or when their clock runs out.
 */
const createPairsGameEngine = (
  ctx: GameContext,
  durations: PairsDurationsInSeconds = defaultDurations,
) => {
  const roomOf = (roomId: string): PairsRoom | undefined =>
    ctx.rooms.ofType<PairsState>(roomId, 'pairs');

  const startGame = (room: PairsRoom) => {
    const game = room.game;
    game.deck = dealDeck(game.board, Math.random);
    game.matched = game.deck.map(() => false);
    game.up = [];
    game.order = shuffle(Object.keys(room.playerList), Math.random);
    game.turnPlayerId = null;
    game.lastGame = null;
    room.playerList = resetPoints(room.playerList);
    room.isGameStarted = true;

    console.log(`Pairs started in room ${room.roomId}, ${game.board} board.`);

    ctx.rooms.announce(room.roomId, 'system', {
      type: 'pairs:started',
      pairs: PAIRS_BOARDS[game.board].pairs,
      seconds: durations.turn,
    });
    ctx.rooms.emitLobby('pairs');

    // The first player in the order, or the first after them who is here.
    const first = itemAt(game.order, 0);
    beginTurn(
      room,
      seatOf(room, first).isConnected ? first : playerAfter(room, first)!,
    );
  };

  /** `playerId` turns over two cards, with a fresh clock. */
  const beginTurn = (room: PairsRoom, playerId: string) => {
    const game = room.game;
    game.phase = 'flipping';
    game.turnPlayerId = playerId;
    game.up = [];
    ctx.rooms.startPhase(room, durations.turn, () => passTurn(room));
    ctx.rooms.emitState(room);
  };

  /** The turn goes to the next player, and any card still up turns back. */
  const passTurn = (room: PairsRoom) => {
    if (!room.isGameStarted) return;
    const next = playerAfter(room, room.game.turnPlayerId);
    if (next === null) return;
    beginTurn(room, next);
  };

  /**
   * The player whose turn it is turns over the card at `index`. Only during
   * `flipping`, two cards a turn, and never one already up or matched.
   */
  const flip = (roomId: string, playerId: string, index: number) => {
    const room = roomOf(roomId);
    if (!room?.isGameStarted) return;

    const game = room.game;
    if (game.phase !== 'flipping' || game.turnPlayerId !== playerId) return;
    const player = room.playerList[playerId];
    if (!player) return;
    if (index >= game.deck.length) return;
    if (game.matched[index] || game.up.includes(index)) return;

    game.up.push(index);
    if (game.up.length === 1) {
      ctx.rooms.emitState(room);
      return;
    }

    const first = itemAt(game.up, 0);
    const second = itemAt(game.up, 1);
    if (game.deck[first] !== game.deck[second]) {
      // A miss stays up for everybody to remember, then the turn passes.
      game.phase = 'showing';
      ctx.rooms.startPhase(room, durations.show, () => passTurn(room));
      ctx.rooms.emitState(room);
      return;
    }

    game.matched[first] = true;
    game.matched[second] = true;
    game.up = [];
    player.points += 1;
    ctx.rooms.announce(room.roomId, 'score', {
      type: 'pairs:found',
      name: player.username,
    });

    if (game.matched.every(Boolean)) {
      endGame(room, { endedEarly: false });
      return;
    }
    // A pair is the finder's, and so is the next turn.
    beginTurn(room, playerId);
  };

  /** The last summary stays, for the results screen and a refresh. */
  const endGame = (
    room: PairsRoom,
    { endedEarly }: { endedEarly: boolean },
  ) => {
    ctx.rooms.stopPhase(room);
    const game = room.game;

    const standings = standingsOf(room.playerList);

    game.lastGame = {
      endedEarly,
      standings,
      board: game.board,
      pairs: pairsFound(game),
    };

    // The board stays on the table as it ended, until the next deal.
    room.isGameStarted = false;
    game.phase = 'waiting';
    game.up = [];
    game.order = [];
    game.turnPlayerId = null;

    ctx.rooms.emitState(room);
    ctx.rooms.announce(
      room.roomId,
      'success',
      gameOverNotice(standings, 'pair'),
    );
    ctx.rooms.emitLobby('pairs');
  };

  /** Called after the seat is already gone from `playerList`. */
  const handlePlayerDeparture = (room: PairsRoom, playerId: string) => {
    if (!room.isGameStarted) return;

    if (seatCount(room) < SEATS['pairs'].min) {
      ctx.rooms.announce(room.roomId, 'alert', { type: 'game:interrupted' });
      endGame(room, { endedEarly: true });
      return;
    }

    // Nobody is left to finish their turn. A miss of theirs on show passes
    // the turn on by itself when it turns back.
    if (room.game.turnPlayerId === playerId && room.game.phase === 'flipping') {
      passTurn(room);
    }
  };

  return {
    startGame,
    flip,
    handlePlayerDeparture,
  };
};

type PairsGameEngine = ReturnType<typeof createPairsGameEngine>;

export { createPairsGameEngine };
export type { PairsGameEngine, PairsRoom, PairsSettings };
