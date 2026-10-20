import { SEATS } from '../../../shared/seats.js';
import { randomInt } from 'node:crypto';
import type {
  LiarsDiceSettings,
  LiarsDiceStanding,
} from '../../models/types.js';
import { seatCount, seatOf } from '../../libs/rooms/seats.js';
import type { GameContext } from '../../libs/rooms/types.js';
import {
  liarsDiceDurationsInSeconds as defaultDurations,
  type LiarsDiceDurationsInSeconds,
} from '../../libs/game-clock.js';
import {
  bidStands,
  countFace,
  isRaise,
  OPENING_BID,
  rollDice,
  type Bid,
} from '../../../shared/liars-dice.js';
import { shuffle } from '../../../shared/pairs.js';
import {
  diceOnTable,
  isIn,
  playerAfter,
  playersIn,
  type LiarsDiceRoom,
} from './state.js';
import { itemAt } from '../../../shared/list.js';

/** Sorts a player who kept dice after everybody who went out. */
const STILL_IN = Number.MAX_SAFE_INTEGER;

/**
 * Dice are rolled from the operating system's generator rather than
 * `Math.random`, whose state can in principle be worked out from enough of
 * its outputs, and every player sees some of them: their own dice.
 */
const secureRandom = (): number => randomInt(0, 2 ** 32) / 2 ** 32;

const nameOf = (room: LiarsDiceRoom, playerId: string) =>
  room.playerList[playerId]?.username ?? '';

const isTurnOf = (room: LiarsDiceRoom, playerId: string) =>
  room.isGameStarted &&
  room.game.phase === 'bidding' &&
  room.game.turnPlayerId === playerId;

/**
 * Winner first, then everybody else by how long they lasted. Ended early,
 * those left are placed by the dice they hold.
 */
const liarsDiceStandings = (room: LiarsDiceRoom): LiarsDiceStanding[] => {
  const outRound = new Map(
    room.game.outs.map(({ playerId, round }) => [playerId, round]),
  );
  return Object.entries(room.playerList)
    .map(([playerId, player]) => ({
      playerId,
      username: player.username,
      points: player.points,
      outInRound: outRound.get(playerId) ?? null,
    }))
    .toSorted(
      (a, b) =>
        b.points - a.points ||
        (b.outInRound ?? STILL_IN) - (a.outInRound ?? STILL_IN),
    );
};

/**
 * Owns the round loop. One player at a time raises the bid or calls Liar; a
 * call opens every cup for the reveal, somebody loses a die, and the loser
 * opens the next round, until one player has dice left.
 */
const createLiarsDiceGameEngine = (
  ctx: GameContext,
  durations: LiarsDiceDurationsInSeconds = defaultDurations,
  random: () => number = secureRandom,
) => {
  const roomOf = (roomId: string): LiarsDiceRoom | undefined =>
    ctx.rooms.ofType(roomId, 'liars-dice');

  const startGame = (room: LiarsDiceRoom) => {
    const game = room.game;
    game.order = shuffle(Object.keys(room.playerList), random);
    game.round = 0;
    game.dice = {};
    game.outs = [];
    game.lastGame = null;
    for (const player of Object.values(room.playerList)) {
      player.points = game.dicePerPlayer;
    }
    room.isGameStarted = true;

    console.log(
      `Liar's Dice started in room ${room.roomId}, ${game.dicePerPlayer} dice each.`,
    );

    ctx.rooms.announce(room.roomId, 'system', {
      type: 'ld:started',
      dice: game.dicePerPlayer,
      seconds: durations.turn,
    });
    ctx.rooms.emitLobby('liars-dice');

    beginRound(room, itemAt(game.order, 0), { next: true });
  };

  /**
   * Everybody still in rolls, and `starter` opens. A round called off because
   * somebody left is rolled again under the same number.
   */
  const beginRound = (
    room: LiarsDiceRoom,
    starter: string,
    { next }: { next: boolean },
  ) => {
    const game = room.game;
    if (next) game.round += 1;
    game.dice = Object.fromEntries(
      playersIn(room).map((playerId) => [
        playerId,
        rollDice(seatOf(room, playerId).points, random),
      ]),
    );
    game.bids = [];
    game.reveal = null;
    game.phase = 'bidding';
    beginTurn(room, starter);
  };

  /** `playerId` raises or calls, with a fresh clock. */
  const beginTurn = (room: LiarsDiceRoom, playerId: string) => {
    room.game.turnPlayerId = playerId;
    ctx.rooms.startPhase(room, durations.turn, () => runOutOfTime(room));
    ctx.rooms.emitState(room);
  };

  /**
   * Out of time, connected or not: Liar on the bid in front of them, or with
   * no bid yet the lowest bid. A call rather than the smallest raise, so the
   * risk stays with whoever ran out and a room is never held up by somebody
   * who has gone.
   */
  const runOutOfTime = (room: LiarsDiceRoom) => {
    const game = room.game;
    const playerId = game.turnPlayerId;
    if (!room.isGameStarted || game.phase !== 'bidding' || !playerId) return;

    const name = nameOf(room, playerId);
    if (game.bids.length === 0) {
      ctx.rooms.announce(room.roomId, 'system', {
        type: 'ld:auto-bid',
        name,
        bid: OPENING_BID,
      });
      placeBid(room, playerId, OPENING_BID);
      return;
    }
    ctx.rooms.announce(room.roomId, 'system', { type: 'ld:auto-call', name });
    settleCall(room, playerId);
  };

  /** A raise, on your turn; anything that is not a raise is ignored. */
  const bid = (
    roomId: string,
    playerId: string,
    count: number,
    face: number,
  ) => {
    const room = roomOf(roomId);
    if (!room || !isTurnOf(room, playerId)) return;
    const previous = room.game.bids.at(-1) ?? null;
    if (!isRaise({ count, face }, previous, diceOnTable(room))) return;
    placeBid(room, playerId, { count, face });
  };

  const placeBid = (
    room: LiarsDiceRoom,
    playerId: string,
    { count, face }: Bid,
  ) => {
    room.game.bids.push({ playerId, count, face });
    const next = playerAfter(room, playerId);
    if (next === null) return;
    beginTurn(room, next);
  };

  /** Liar, on your turn, on the bid in front of you. */
  const call = (roomId: string, playerId: string) => {
    const room = roomOf(roomId);
    if (!room || !isTurnOf(room, playerId)) return;
    if (room.game.bids.length === 0) return;
    settleCall(room, playerId);
  };

  /** Every cup opens, the bid is counted, and somebody loses a die. */
  const settleCall = (room: LiarsDiceRoom, callerId: string) => {
    const game = room.game;
    const called = game.bids.at(-1)!;
    const count = countFace(
      playersIn(room).map((playerId) => game.dice[playerId] ?? []),
      called.face,
    );
    const stands = bidStands(called, count);
    const loserId = stands ? callerId : called.playerId;
    const loser = seatOf(room, loserId);
    loser.points -= 1;
    const out = loser.points === 0;
    if (out) game.outs.push({ playerId: loserId, round: game.round });

    game.reveal = {
      bid: { ...called },
      callerId,
      matched: count.matched,
      wild: count.wild,
      loserId,
      out,
    };
    game.phase = 'reveal';
    game.turnPlayerId = null;

    ctx.rooms.announce(room.roomId, 'system', {
      type: 'ld:called',
      name: nameOf(room, callerId),
      bid: { count: called.count, face: called.face },
      matched: count.matched,
      loser: loser.username,
    });
    if (out) {
      ctx.rooms.announce(room.roomId, 'alert', {
        type: 'ld:out',
        name: loser.username,
      });
    }

    // The game is over the moment one player has dice left; the reveal stays
    // on the table under the results.
    if (playersIn(room).length <= 1) {
      endGame(room, { endedEarly: false });
      return;
    }

    ctx.rooms.startPhase(room, durations.reveal, () => afterReveal(room));
    ctx.rooms.emitState(room);
  };

  /** The loser opens the next round, or the next player still in if they are out. */
  const afterReveal = (room: LiarsDiceRoom) => {
    const game = room.game;
    if (!room.isGameStarted || game.phase !== 'reveal' || !game.reveal) return;
    const { loserId } = game.reveal;
    const starter = isIn(room, loserId) ? loserId : playerAfter(room, loserId);
    if (starter === null) return;
    beginRound(room, starter, { next: true });
  };

  /** The last summary stays, for the results screen and a refresh. */
  const endGame = (
    room: LiarsDiceRoom,
    { endedEarly }: { endedEarly: boolean },
  ) => {
    ctx.rooms.stopPhase(room);
    const game = room.game;
    const standings = liarsDiceStandings(room);

    game.lastGame = {
      endedEarly,
      standings,
      dicePerPlayer: game.dicePerPlayer,
      rounds: game.round,
    };

    room.isGameStarted = false;
    game.phase = 'waiting';
    game.bids = [];
    game.turnPlayerId = null;

    ctx.rooms.emitState(room);
    const [winner] = standings;
    if (winner && winner.points > 0) {
      ctx.rooms.announce(room.roomId, 'system', {
        type: 'game:over',
        names: [winner.username],
        points: winner.points,
        unit: 'die',
      });
    }
    ctx.rooms.emitLobby('liars-dice');
  };

  /** Called after the seat is already gone from `playerList`. */
  const handlePlayerDeparture = (room: LiarsDiceRoom, playerId: string) => {
    if (!room.isGameStarted) return;
    const game = room.game;

    if (seatCount(room) < SEATS['liars-dice'].min) {
      ctx.rooms.announce(room.roomId, 'alert', { type: 'game:interrupted' });
      endGame(room, { endedEarly: true });
      return;
    }

    // Their dice leave the table with them. A player already out had none
    // in this round, so the bids still stand.
    const hadDice = Object.hasOwn(game.dice, playerId);
    delete game.dice[playerId];
    if (playersIn(room).length <= 1) {
      endGame(room, { endedEarly: false });
      return;
    }
    if (!hadDice) return;

    // The bids were about dice that are no longer there: the round is called
    // off, everybody still in rolls again, and whoever's turn it was opens.
    // A reveal stands, and the next round starts as usual without them.
    if (game.phase === 'bidding') {
      const turn = game.turnPlayerId;
      const starter =
        turn !== null && turn !== playerId && isIn(room, turn)
          ? turn
          : playerAfter(room, turn ?? playerId);
      if (starter === null) return;
      ctx.rooms.announce(room.roomId, 'system', { type: 'ld:reroll' });
      beginRound(room, starter, { next: false });
    }
  };

  return {
    startGame,
    bid,
    call,
    handlePlayerDeparture,
  };
};

type LiarsDiceGameEngine = ReturnType<typeof createLiarsDiceGameEngine>;

export { createLiarsDiceGameEngine };
export type { LiarsDiceGameEngine, LiarsDiceRoom, LiarsDiceSettings };
