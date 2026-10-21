import type {
  CodeBreakerBoard,
  CodeBreakerGameSummary,
  CodeBreakerLobbyRoomInfo,
  CodeBreakerMark,
  CodeBreakerPhase,
  CodeBreakerRoomState,
  CodeBreakerRoundResult,
  CodeBreakerSettings,
} from '../../models/types.js';
import { lobbyBasics, roomBasics } from '../../libs/rooms/seats.js';
import type { Room } from '../../libs/rooms/types.js';
import { isCracked, MAX_GUESSES } from '../../../shared/code-breaker.js';
import { itemAt } from '../../../shared/list.js';

/** One player's guesses at the open code, marked as they came in. */
interface PlayerBoard {
  guesses: string[];
  marks: CodeBreakerMark[];
  /** What cracking the code earned; 0 until cracked. */
  points: number;
  /** Whole seconds left on the clock when cracked; 0 before. */
  secondsLeft: number;
}

/** Everything Code Breaker knows that no other game would. */
interface CodeBreakerState {
  rounds: number;
  phase: CodeBreakerPhase;
  /** The round open or being revealed, from 1; 0 when no game is running. */
  round: number;
  /** Every code of the game, drawn when it starts. Never in a snapshot. */
  codes: string[];
  /** The open round's boards, by player id; a player who has not guessed has none. */
  boards: Map<string, PlayerBoard>;
  /** How many codes each player has cracked this game, by player id. */
  cracked: Map<string, number>;
  lastRound: CodeBreakerRoundResult | null;
  lastGame: CodeBreakerGameSummary | null;
}

const createState = (settings: CodeBreakerSettings): CodeBreakerState => ({
  rounds: settings.rounds,
  phase: 'waiting',
  round: 0,
  codes: [],
  boards: new Map(),
  cracked: new Map(),
  lastRound: null,
  lastGame: null,
});

const emptyBoard = (): PlayerBoard => ({
  guesses: [],
  marks: [],
  points: 0,
  secondsLeft: 0,
});

/** The code open or being revealed; '' between games. */
const currentCode = (game: CodeBreakerState): string =>
  game.round > 0 ? (game.codes[game.round - 1] ?? '') : '';

const boardStatus = (board: PlayerBoard): CodeBreakerBoard['status'] => {
  const last = board.marks.at(-1);
  if (last && isCracked(last)) return 'cracked';
  return board.guesses.length >= MAX_GUESSES ? 'out' : 'guessing';
};

/** A player is done with the open code once they have cracked it or are out. */
const isDone = (board: PlayerBoard | undefined): boolean =>
  board !== undefined && boardStatus(board) !== 'guessing';

/** A board as the wire carries it, with its digits or only its marks. */
const boardView = (
  playerId: string,
  username: string,
  board: PlayerBoard,
  withDigits: boolean,
): CodeBreakerBoard => ({
  playerId,
  username,
  rows: board.guesses.map((guess, i) => ({
    guess: withDigits ? guess : null,
    mark: { ...itemAt(board.marks, i) },
  })),
  status: boardStatus(board),
  points: board.points,
  secondsLeft: board.secondsLeft,
});

const toLobbyInfo = (
  room: Room<CodeBreakerState>,
): CodeBreakerLobbyRoomInfo => ({
  gameType: 'code-breaker',
  ...lobbyBasics(room),
  rounds: room.game.rounds,
});

/**
 * The room as one player may see it: while a code is open, every board in
 * seat order with its marks, and digits only on the viewer's own, because
 * anybody else's digits next to their marks would give the code away. The
 * code itself is never here until its round is over, in `lastRound`.
 */
const toRoomState = (
  room: Room<CodeBreakerState>,
  viewerId: string,
): CodeBreakerRoomState => {
  const game = room.game;
  const boards =
    game.phase === 'guessing'
      ? Object.entries(room.playerList).map(([playerId, player]) =>
          boardView(
            playerId,
            player.username,
            game.boards.get(playerId) ?? emptyBoard(),
            playerId === viewerId,
          ),
        )
      : [];

  return {
    ...toLobbyInfo(room),
    ...roomBasics(room),
    phase: game.phase,
    round: game.round,
    boards,
    lastRound: game.lastRound,
    lastGame: game.lastGame,
  };
};

export {
  boardStatus,
  boardView,
  createState,
  currentCode,
  emptyBoard,
  isDone,
  toLobbyInfo,
  toRoomState,
};
export type { CodeBreakerState, PlayerBoard };
