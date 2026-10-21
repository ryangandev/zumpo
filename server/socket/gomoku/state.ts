import type {
  GomokuColors,
  GomokuGameSummary,
  GomokuLobbyRoomInfo,
  GomokuMove,
  GomokuPhase,
  GomokuRoomState,
} from '../../models/types.js';
import { lobbyBasics, roomBasics } from '../../libs/rooms/seats.js';
import type { Room } from '../../libs/rooms/types.js';

/**
 * Everything Gomoku knows that no other game would. A player's games won are
 * their points in `playerList`, so the scoreboard shows them as they are.
 */
interface GomokuState {
  phase: GomokuPhase;
  /** This game's colours, or the last game's between games. */
  colors: GomokuColors | null;
  /** This pair's game: 1 for their first, again 1 for a new pair. */
  gameNumber: number;
  moves: GomokuMove[];
  /** Whose turn it is; null between games. */
  turnPlayerId: string | null;
  /** Each player's lost turns in a row this game. */
  missedTurns: Record<string, number>;
  winLines: number[][] | null;
  lastGame: GomokuGameSummary | null;
}

const createState = (): GomokuState => ({
  phase: 'waiting',
  colors: null,
  gameNumber: 0,
  moves: [],
  turnPlayerId: null,
  missedTurns: {},
  winLines: null,
  lastGame: null,
});

type GomokuRoom = Room<GomokuState>;

const toLobbyInfo = (room: GomokuRoom): GomokuLobbyRoomInfo => ({
  gameType: 'gomoku',
  ...lobbyBasics(room),
});

/**
 * The room as anybody may see it. Nothing in Gomoku is hidden, so the viewer
 * makes no difference: a spectator is sent exactly what a player is.
 */
const toRoomState = (room: GomokuRoom): GomokuRoomState => {
  const game = room.game;
  return {
    ...toLobbyInfo(room),
    ...roomBasics(room),
    phase: game.phase,
    colors: game.colors && {
      black: { ...game.colors.black },
      white: { ...game.colors.white },
    },
    gameNumber: game.gameNumber,
    moves: game.moves.map((move) => ({ ...move })),
    turnPlayerId: game.turnPlayerId,
    missedTurns: { ...game.missedTurns },
    winLines: game.winLines && game.winLines.map((line) => [...line]),
    lastGame: game.lastGame,
  };
};

export { createState, toLobbyInfo, toRoomState };
export type { GomokuRoom, GomokuState };
