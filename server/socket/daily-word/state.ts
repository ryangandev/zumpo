import type {
  DailyWordBoard,
  DailyWordGameSummary,
  DailyWordLobbyRoomInfo,
  DailyWordMark,
  DailyWordPhase,
  DailyWordRoomState,
  DailyWordRoundResult,
  DailyWordSettings,
} from '../../models/types.js';
import { lobbyBasics, roomBasics } from '../../libs/rooms/seats.js';
import type { Room } from '../../libs/rooms/types.js';
import { isFound, MAX_GUESSES } from '../../../shared/daily-word.js';

/** One player's guesses at the open word, marked as they came in. */
interface PlayerBoard {
  guesses: string[];
  marks: DailyWordMark[][];
  /** What finding the word earned; 0 until found. */
  points: number;
  /** Whole seconds left on the clock when found; 0 before. */
  secondsLeft: number;
}

/** Everything Daily Word knows that no other game would. */
interface DailyWordState {
  rounds: number;
  phase: DailyWordPhase;
  /** The round open or being revealed, from 1; 0 when no game is running. */
  round: number;
  /** Every word of the game, drawn when it starts. Never in a snapshot. */
  words: string[];
  /** The open round's boards, by player id; a player who has not guessed has none. */
  boards: Map<string, PlayerBoard>;
  /** How many words each player has found this game, by player id. */
  found: Map<string, number>;
  lastRound: DailyWordRoundResult | null;
  lastGame: DailyWordGameSummary | null;
}

const createState = (settings: DailyWordSettings): DailyWordState => ({
  rounds: settings.rounds,
  phase: 'waiting',
  round: 0,
  words: [],
  boards: new Map(),
  found: new Map(),
  lastRound: null,
  lastGame: null,
});

const emptyBoard = (): PlayerBoard => ({
  guesses: [],
  marks: [],
  points: 0,
  secondsLeft: 0,
});

/** The word open or being revealed; '' between games. */
const currentWord = (game: DailyWordState): string =>
  game.round > 0 ? (game.words[game.round - 1] ?? '') : '';

const boardStatus = (board: PlayerBoard): DailyWordBoard['status'] => {
  const last = board.marks.at(-1);
  if (last && isFound(last)) return 'found';
  return board.guesses.length >= MAX_GUESSES ? 'out' : 'guessing';
};

/** A player is done with the open word once they have found it or are out. */
const isDone = (board: PlayerBoard | undefined): boolean =>
  board !== undefined && boardStatus(board) !== 'guessing';

/** A board as the wire carries it, with its letters or only its marks. */
const boardView = (
  playerId: string,
  username: string,
  board: PlayerBoard,
  withLetters: boolean,
): DailyWordBoard => ({
  playerId,
  username,
  rows: board.guesses.map((word, i) => ({
    word: withLetters ? word : null,
    marks: board.marks[i],
  })),
  status: boardStatus(board),
  points: board.points,
  secondsLeft: board.secondsLeft,
});

const toLobbyInfo = (room: Room<DailyWordState>): DailyWordLobbyRoomInfo => ({
  gameType: 'daily-word',
  ...lobbyBasics(room),
  rounds: room.game.rounds,
});

/**
 * The room as one player may see it: while a word is open, every board in
 * seat order with its marks, and letters only on the viewer's own, because
 * anybody else's letters would give the word away. The word itself is never
 * here until its round is over, in `lastRound`.
 */
const toRoomState = (
  room: Room<DailyWordState>,
  viewerId: string,
): DailyWordRoomState => {
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
  currentWord,
  emptyBoard,
  isDone,
  toLobbyInfo,
  toRoomState,
};
export type { DailyWordState, PlayerBoard };
