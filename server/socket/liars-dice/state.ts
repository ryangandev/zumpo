import type {
  LiarsDiceBid,
  LiarsDiceCup,
  LiarsDiceGameSummary,
  LiarsDiceLobbyRoomInfo,
  LiarsDicePhase,
  LiarsDiceReveal,
  LiarsDiceRoomState,
  LiarsDiceSettings,
} from '../../models/types.js';
import { lobbyBasics, roomBasics, seatOf } from '../../libs/rooms/seats.js';
import type { Room } from '../../libs/rooms/types.js';

/**
 * Everything Liar's Dice knows that no other game would. A player's dice left
 * are their points in `playerList`, so the scoreboard shows them as they are.
 */
interface LiarsDiceState {
  dicePerPlayer: number;
  phase: LiarsDicePhase;
  round: number;
  /**
   * The order players take turns in, shuffled when a game starts. A player
   * who leaves keeps their place here, so the turn can still be passed on
   * from them; snapshots show only those still seated.
   */
  order: string[];
  /**
   * Each player's dice this round: the round in play, the one being revealed,
   * or after a game the last one. Never leaves the server except as each
   * viewer may see it.
   */
  dice: Record<string, number[]>;
  bids: LiarsDiceBid[];
  /** Whose turn it is; null during a reveal and between games. */
  turnPlayerId: string | null;
  reveal: LiarsDiceReveal | null;
  /** Who lost their last die, and in which round, first out first. */
  outs: { playerId: string; round: number }[];
  lastGame: LiarsDiceGameSummary | null;
}

const createState = (settings: LiarsDiceSettings): LiarsDiceState => ({
  dicePerPlayer: settings.dicePerPlayer,
  phase: 'waiting',
  round: 0,
  order: [],
  dice: {},
  bids: [],
  turnPlayerId: null,
  reveal: null,
  outs: [],
  lastGame: null,
});

type LiarsDiceRoom = Room<LiarsDiceState>;

/** A seated player with dice left. */
const isIn = (room: LiarsDiceRoom, playerId: string): boolean =>
  (room.playerList[playerId]?.points ?? 0) > 0;

/** Seated players with dice left, in turn order. */
const playersIn = (room: LiarsDiceRoom): string[] =>
  room.game.order.filter((playerId) => isIn(room, playerId));

/** Every die still on the table. */
const diceOnTable = (room: LiarsDiceRoom): number =>
  playersIn(room).reduce(
    (total, playerId) => total + seatOf(room, playerId).points,
    0,
  );

/**
 * Who goes after `playerId`: the next player in the order still seated with
 * dice left, connected or not. A turn is never skipped, because a skip could
 * hand the bid back to the player who made it; a player who is away has their
 * turn played for them when its clock runs out. Null when nobody else is in.
 */
const playerAfter = (
  room: LiarsDiceRoom,
  playerId: string | null,
): string | null => {
  const { order } = room.game;
  const from = playerId === null ? -1 : order.indexOf(playerId);
  return (
    [...order.slice(from + 1), ...order.slice(0, from + 1)].find(
      (candidate) => candidate !== playerId && isIn(room, candidate),
    ) ?? null
  );
};

const toLobbyInfo = (room: LiarsDiceRoom): LiarsDiceLobbyRoomInfo => ({
  gameType: 'liars-dice',
  ...lobbyBasics(room),
  dicePerPlayer: room.game.dicePerPlayer,
});

/**
 * The room as `viewerId` may see it. While bidding, a player is sent their
 * own dice and nobody else's; a player who is out sees no more than anybody.
 * A reveal opens every cup, and the last one stays open after a game.
 */
const toRoomState = (
  room: LiarsDiceRoom,
  viewerId: string,
): LiarsDiceRoomState => {
  const game = room.game;
  const open = game.phase === 'reveal' || game.reveal !== null;
  const cups: LiarsDiceCup[] = game.order
    .flatMap((playerId) => {
      const seat = room.playerList[playerId];
      return seat ? [{ playerId, seat }] : [];
    })
    .map(({ playerId, seat }) => ({
      playerId,
      diceLeft: seat.points,
      dice:
        open || playerId === viewerId ? [...(game.dice[playerId] ?? [])] : null,
      outInRound:
        game.outs.find((out) => out.playerId === playerId)?.round ?? null,
    }));

  return {
    ...toLobbyInfo(room),
    ...roomBasics(room),
    phase: game.phase,
    round: game.round,
    cups,
    bids: game.bids.map((bid) => ({ ...bid })),
    turnPlayerId: game.turnPlayerId,
    nextPlayerId:
      game.phase === 'bidding' ? playerAfter(room, game.turnPlayerId) : null,
    reveal: game.reveal,
    lastGame: game.lastGame,
  };
};

export {
  createState,
  diceOnTable,
  isIn,
  playerAfter,
  playersIn,
  toLobbyInfo,
  toRoomState,
};
export type { LiarsDiceRoom, LiarsDiceState };
