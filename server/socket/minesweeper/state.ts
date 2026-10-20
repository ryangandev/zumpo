import type {
  MinesweeperDifficulty,
  MinesweeperGameSummary,
  MinesweeperLobbyRoomInfo,
  MinesweeperPhase,
  MinesweeperPickResult,
  MinesweeperRoomState,
  MinesweeperSettings,
} from '../../models/types.js';
import { lobbyBasics, roomBasics } from '../../libs/rooms/seats.js';
import type { Room } from '../../libs/rooms/types.js';
import { BOARD_SIZES } from '../../../shared/minesweeper.js';
import { createBoard, minesFound, publicView } from './board.js';
import type { Board } from './board.js';

/**
 * Everything Minesweeper knows that no other game would.
 *
 * Compared with Draw & Guess this is a light module, which is the point: the
 * second consumer of the room layer is what says whether the layer was carrying
 * its weight, and it needs one timer and one per-player field rather than three
 * and one.
 */
interface MinesweeperState {
  difficulty: MinesweeperDifficulty;
  /** Server-private layout lives in here; `publicView` is what leaves. */
  board: Board;
  phase: MinesweeperPhase;
  /** The round open or being revealed; 0 when no game is running. */
  round: number;
  /** This round's picks, player id to cell index. One each, and final. */
  picks: Map<string, number>;
  /**
   * The risk of every cell as it stood when this round opened.
   *
   * Cached rather than recomputed at scoring time, and that is a rule rather
   * than an optimisation: every pick in a round is scored against the same
   * board, the one everybody could see when they chose. Recomputing after the
   * reveals would score people on information they did not have.
   */
  risk: number[];
  /** What the latest resolved round came to; kept after the game ends. */
  lastRound: MinesweeperPickResult[];
  /** How the last game ended, until the next one starts. */
  lastGame: MinesweeperGameSummary | null;
}

const createState = (settings: MinesweeperSettings): MinesweeperState => ({
  difficulty: settings.difficulty,
  board: createBoard(settings.difficulty),
  phase: 'waiting',
  round: 0,
  picks: new Map(),
  risk: [],
  lastRound: [],
  lastGame: null,
});

const toLobbyInfo = (
  room: Room<MinesweeperState>,
): MinesweeperLobbyRoomInfo => ({
  gameType: 'minesweeper',
  ...lobbyBasics(room),
  difficulty: room.game.difficulty,
});

/**
 * The room as one player may see it.
 *
 * `lockedIn` says *who* has chosen, never *what* they chose, and `myPick` is
 * the viewer's own cell and nobody else's. Publishing the cells would hand
 * everyone else a free read on the board and, worse, let a player wait to see
 * where the crowd went before choosing, which is the whole reason the picks
 * are simultaneous. A player's own pick is in their own snapshot so that a
 * refresh mid-round still shows what they locked in.
 */
const toRoomState = (
  room: Room<MinesweeperState>,
  viewerId: string,
): MinesweeperRoomState => {
  const game = room.game;
  const { width, height } = BOARD_SIZES[game.difficulty];

  return {
    ...toLobbyInfo(room),
    ...roomBasics(room),
    difficulty: game.difficulty,
    width,
    height,
    totalMines: game.board.totalMines,
    board: publicView(game.board),
    phase: game.phase,
    round: game.round,
    lockedIn: [...game.picks.keys()],
    myPick:
      game.phase === 'picking' ? (game.picks.get(viewerId) ?? null) : null,
    minesFound: minesFound(game.board),
    lastRound: game.lastRound,
    lastGame: game.lastGame,
  };
};

export { createState, toLobbyInfo, toRoomState };
export type { MinesweeperState };
