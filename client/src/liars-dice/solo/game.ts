import { pickFrom, shuffle } from '../../../../shared/list';
import {
  bidStands,
  countFace,
  isRaise,
  rollDice,
  type Bid,
  type DicePerPlayer,
} from '../../../../shared/liars-dice';
import type {
  LiarsDiceBid,
  LiarsDiceReveal,
} from '../../../../shared/wire-types';
import { botMove, newStyle, type BotStyle } from './bot';

/**
 * Liar's Dice on your own: you against a table of bots, in the browser. Every
 * function returns a new game and leaves the one it was given alone, so React
 * state can hold it as is. The rules are in docs/games/liars-dice.md.
 */

/** Your player id; a bot's id is its name. */
export const YOU = 'you';

export const BOT_NAMES = ['Pip', 'Juno', 'Otto', 'Remy', 'Wren'] as const;
export const MIN_BOTS = 1;
export const MAX_BOTS = BOT_NAMES.length;

/** How long a bot takes over its turn, so every bid can be read as it is made. */
export const BOT_TURN_MS = 1000;

export interface SoloSeat {
  /** `YOU`, or a bot's name. */
  id: string;
  diceLeft: number;
  /** This round's dice, or the round being revealed; none once out. */
  dice: readonly number[];
  /** How a bot plays; null for you. */
  style: BotStyle | null;
  /** The round this seat lost its last die in, or null while still in. */
  outInRound: number | null;
}

/**
 * bidding: somebody's turn; reveal: a call is shown until you go on to the
 * next round; over: you won or are out, with the last reveal still up.
 */
export type SoloPhase = 'bidding' | 'reveal' | 'over';

export interface SoloGame {
  dicePerPlayer: DicePerPlayer;
  /** Everybody, you included, in the order turns go round. */
  seats: readonly SoloSeat[];
  round: number;
  phase: SoloPhase;
  /** This round's bids, first first. */
  bids: readonly LiarsDiceBid[];
  /** Whose turn it is; null outside bidding. */
  turnId: string | null;
  reveal: LiarsDiceReveal | null;
}

export interface SoloPicks {
  bots: number;
  dicePerPlayer: DicePerPlayer;
}

const seatOf = (game: SoloGame, id: string) =>
  game.seats.find((seat) => seat.id === id);

const isIn = (seat: SoloSeat | undefined) => (seat?.diceLeft ?? 0) > 0;

/** Seats with dice left, in turn order. */
export const seatsIn = (game: SoloGame) => game.seats.filter(isIn);

export const diceOnTable = (game: SoloGame) =>
  seatsIn(game).reduce((total, seat) => total + seat.diceLeft, 0);

/** The bid in front of whoever's turn it is; null when the round opens. */
export const currentBid = (game: SoloGame): LiarsDiceBid | null =>
  game.bids.at(-1) ?? null;

export const isYourTurn = (game: SoloGame) =>
  game.phase === 'bidding' && game.turnId === YOU;

/** Who goes after `id`: the next seat in order still in. */
export function seatAfter(game: SoloGame, id: string): string | null {
  const from = game.seats.findIndex((seat) => seat.id === id);
  const order = [...game.seats.slice(from + 1), ...game.seats.slice(0, from)];
  return order.find(isIn)?.id ?? null;
}

/** Everybody still in rolls their dice again; the bids start over. */
function roll(
  game: SoloGame,
  openerId: string,
  round: number,
  random: () => number,
): SoloGame {
  return {
    ...game,
    seats: game.seats.map((seat) => ({
      ...seat,
      dice: isIn(seat) ? rollDice(seat.diceLeft, random) : [],
    })),
    round,
    phase: 'bidding',
    bids: [],
    turnId: openerId,
    reveal: null,
  };
}

/**
 * A new table: `picks.bots` of the bots taken at random, everybody in a
 * random order, and a random player opening the first round.
 */
export function newGame(picks: SoloPicks, random: () => number): SoloGame {
  const bots = shuffle(BOT_NAMES, random).slice(0, picks.bots);
  const seats = shuffle([YOU, ...bots], random).map((id): SoloSeat => ({
    id,
    diceLeft: picks.dicePerPlayer,
    dice: [],
    style: id === YOU ? null : newStyle(random),
    outInRound: null,
  }));
  const game: SoloGame = {
    dicePerPlayer: picks.dicePerPlayer,
    seats,
    round: 0,
    phase: 'bidding',
    bids: [],
    turnId: null,
    reveal: null,
  };
  const opener = pickFrom(seats, random).id;
  return roll(game, opener, 1, random);
}

/** `id` raises to `bid`; anything but a raise on their turn is ignored. */
export function bid(game: SoloGame, id: string, raise: Bid): SoloGame {
  if (game.phase !== 'bidding' || game.turnId !== id) return game;
  if (!isRaise(raise, currentBid(game), diceOnTable(game))) return game;
  return {
    ...game,
    bids: [
      ...game.bids,
      { playerId: id, count: raise.count, face: raise.face },
    ],
    turnId: seatAfter(game, id),
  };
}

/**
 * `id` calls Liar on the bid in front of them. Every cup opens; the caller
 * loses a die when the bid stands, the bidder when it was a lie. The game is
 * over when that puts you out, or leaves you the last player in.
 */
export function call(game: SoloGame, id: string): SoloGame {
  const called = currentBid(game);
  if (game.phase !== 'bidding' || game.turnId !== id || !called) return game;

  const count = countFace(
    seatsIn(game).map((seat) => seat.dice),
    called.face,
  );
  const loserId = bidStands(called, count) ? id : called.playerId;
  const seats = game.seats.map((seat) =>
    seat.id === loserId
      ? {
          ...seat,
          diceLeft: seat.diceLeft - 1,
          outInRound: seat.diceLeft === 1 ? game.round : null,
        }
      : seat,
  );
  const out = seats.find((seat) => seat.id === loserId)!.diceLeft === 0;
  const after = { ...game, seats };
  const youLeft = !isIn(seatOf(after, YOU));
  const youWon = seatsIn(after).length === 1;

  return {
    ...after,
    phase: youLeft || youWon ? 'over' : 'reveal',
    turnId: null,
    reveal: {
      bid: called,
      callerId: id,
      matched: count.matched,
      wild: count.wild,
      loserId,
      out,
    },
  };
}

/**
 * After a reveal, everybody still in rolls again and the loser of the die
 * opens; when that was their last die, the next player still in does.
 */
export function nextRound(game: SoloGame, random: () => number): SoloGame {
  if (game.phase !== 'reveal' || !game.reveal) return game;
  const { loserId } = game.reveal;
  const opener = isIn(seatOf(game, loserId))
    ? loserId
    : seatAfter(game, loserId);
  if (opener === null) return game;
  return roll(game, opener, game.round + 1, random);
}

/** Whether it is a bot's turn to move. */
export const isBotTurn = (game: SoloGame) =>
  game.phase === 'bidding' && game.turnId !== null && game.turnId !== YOU;

/** The bot whose turn it is bids or calls. */
export function playBot(game: SoloGame, random: () => number): SoloGame {
  if (!isBotTurn(game)) return game;
  const seat = seatOf(game, game.turnId!)!;
  const move = botMove(
    {
      dice: seat.dice,
      diceOnTable: diceOnTable(game),
      bid: currentBid(game),
    },
    seat.style ?? newStyle(random),
    random,
  );
  return move.kind === 'call'
    ? call(game, seat.id)
    : bid(game, seat.id, move.bid);
}

export const youWon = (game: SoloGame) =>
  game.phase === 'over' && isIn(seatOf(game, YOU));

/**
 * Your place at the end: first when you won, otherwise one behind everybody
 * still in when you went out ("You finished 3rd of 4").
 */
export function placeOf(game: SoloGame) {
  return {
    place: youWon(game) ? 1 : seatsIn(game).length + 1,
    of: game.seats.length,
  };
}
