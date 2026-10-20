import type {
  Make24GameSummary,
  Make24HandResult,
  Make24LobbyRoomInfo,
  Make24Phase,
  Make24RoomState,
  Make24Settings,
  Make24Solve,
} from '../../models/types.js';
import { lobbyBasics, roomBasics } from '../../libs/rooms/seats.js';
import type { Room } from '../../libs/rooms/types.js';

/** A solve of the open hand, kept until the hand ends. */
interface Solve {
  points: number;
  secondsLeft: number;
  expression: string;
}

/** Everything Make 24 knows that no other game would. */
interface Make24State {
  hands: number;
  phase: Make24Phase;
  /** The hand open or being revealed, from 1; 0 when no game is running. */
  hand: number;
  /** Every hand of the game, dealt when it starts. */
  deals: number[][];
  /**
   * The open hand's solves, player id to solve, in the order they came in.
   * The expressions never leave while the hand is open, except each to its
   * own player.
   */
  solves: Map<string, Solve>;
  lastHand: Make24HandResult[];
  lastDeal: number[];
  lastSolution: string;
  lastGame: Make24GameSummary | null;
}

const createState = (settings: Make24Settings): Make24State => ({
  hands: settings.hands,
  phase: 'waiting',
  hand: 0,
  deals: [],
  solves: new Map(),
  lastHand: [],
  lastDeal: [],
  lastSolution: '',
  lastGame: null,
});

/** The hand on the table, or none between games. */
const currentDeal = (game: Make24State): number[] =>
  game.hand > 0 ? (game.deals[game.hand - 1] ?? []) : [];

const toLobbyInfo = (room: Room<Make24State>): Make24LobbyRoomInfo => ({
  gameType: 'make-24',
  ...lobbyBasics(room),
  hands: room.game.hands,
});

/**
 * The room as one player may see it: who has solved the open hand and for how
 * much, but only the viewer's own expression, because anybody else's would
 * hand them the answer.
 */
const toRoomState = (
  room: Room<Make24State>,
  viewerId: string,
): Make24RoomState => {
  const game = room.game;
  const solved: Make24Solve[] = [];
  for (const [playerId, solve] of game.solves) {
    const player = room.playerList[playerId];
    if (!player) continue;
    solved.push({
      playerId,
      username: player.username,
      points: solve.points,
      secondsLeft: solve.secondsLeft,
    });
  }
  const mine = game.phase === 'solving' ? game.solves.get(viewerId) : null;
  const viewer = room.playerList[viewerId];

  return {
    ...toLobbyInfo(room),
    ...roomBasics(room),
    phase: game.phase,
    hand: game.hand,
    deal: currentDeal(game),
    solved,
    mySolve:
      mine && viewer
        ? {
            playerId: viewerId,
            username: viewer.username,
            solved: true,
            ...mine,
          }
        : null,
    lastHand: game.lastHand,
    lastDeal: game.lastDeal,
    lastSolution: game.lastSolution,
    lastGame: game.lastGame,
  };
};

export { createState, currentDeal, toLobbyInfo, toRoomState };
export type { Make24State, Solve };
