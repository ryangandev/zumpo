import type {
  CanvasStroke,
  DrawAndGuessGameSummary,
  DrawAndGuessPhase,
  DrawAndGuessRoundSummary,
  WordCategory,
} from '../../shared/wire-types.js';

/**
 * Server-private state.
 *
 * Everything a client can see is defined once, in `shared/wire-types.d.ts`, and
 * re-exported at the bottom of this file so that the rest of the backend can go
 * on importing its types from one place. What is left here is what never leaves
 * the process: the word while it is being guessed, and the drawing in the
 * mutable form the relay maintains it in.
 *
 * The room itself is no longer described here. `RoomInfo` and
 * `DrawAndGuessDetailRoomInfo` were one type that mixed the two - a room's name,
 * seats and password alongside a drawer queue and a canvas - which is precisely
 * the seam the extraction cut along. What is generic is `Room<TGameState>` in
 * `libs/rooms/types.ts`; what is Draw & Guess's is `DrawAndGuessState` below,
 * and it hangs off `room.game`.
 */

/**
 * The room's drawing. `pointCount` is a running total so the size cap is an
 * O(1) check rather than a walk of the whole drawing on every point; the wire
 * only ever sees `strokes`.
 */
interface RoomCanvas {
  strokes: CanvasStroke[];
  pointCount: number;
}

/**
 * Everything Draw & Guess knows that no other game would.
 *
 * Per-player facts the game cares about (who has scored, what each player made
 * this turn) live here rather than on `PlayerInfo`, the shape every game
 * shares, keyed by the same player id.
 */
interface DrawAndGuessState {
  rounds: number;
  /** The categories a game draws its one from; at least one, in `WORD_CATEGORIES` order. */
  categories: WordCategory[];
  phase: DrawAndGuessPhase;
  /** 1-based; 0 when no game is running. */
  currentRound: number;
  /** Turns started in this game, including the current one. */
  turn: number;
  /** The drawer's player id; '' between games. */
  currentDrawer: string;
  /** The word in play; '' until the drawer has one. Never in another player's snapshot. */
  word: string;
  /** The word with its unrevealed letters as underscores; '' outside a drawing. */
  hint: string;
  /** What the drawer is choosing between; empty once a word is chosen. */
  wordChoices: string[];
  /** True when the word-select clock ran out and took the first choice. */
  wordAutoPicked: boolean;
  /** Player ids still to draw this round. */
  drawerQueue: Set<string>;
  wordCategory: WordCategory | ''; // '' when no game is in progress
  /**
   * The words played this game, chosen or picked by the clock, so no word is
   * offered twice in one game; cleared as a game starts, never sent to anybody.
   */
  dealt: Set<string>;
  /** Player ids that have already scored this turn, and so cannot guess again. */
  scoredThisTurn: Set<string>;
  /**
   * Player ids the room has been told are close this turn, so it is told once
   * a turn for each; never sent to anybody.
   */
  closeThisTurn: Set<string>;
  /** What each player gained this turn, the drawer included; absent means nothing. */
  turnPoints: Map<string, number>;
  /** What each player has gained this round, the same way. */
  roundPoints: Map<string, number>;
  /** The round that just ended, from its last reveal to the next round's first word. */
  lastRound: DrawAndGuessRoundSummary | null;
  /** Epoch ms the hold for a dropped drawer runs out; 0 when not holding. */
  drawerHoldEndsAt: number;
  /** How the last game ended, until the next one starts. */
  lastGame: DrawAndGuessGameSummary | null;
  // Sent to arrivals on its own rather than with the room snapshot: a snapshot
  // goes out every time anything in the room changes, and the drawing is the
  // largest thing in the room.
  canvas: RoomCanvas;
}

/**
 * The wire contract. A module's `toLobbyInfo` and `toRoomState` are the only way
 * the internal types above become these, which is what keeps a password or a
 * live word from leaking by someone emitting a room object wholesale.
 */
export type {
  GameType,
  RoomStatus,
  WordCategory,
  PlayerInfo,
  SpectatorInfo,
  RoomSeat,
  OwnerInfo,
  PlayerIdentity,
  HandshakeAuth,
  SessionInfo,
  RoomCreateRequest,
  Coordinate,
  CanvasStroke,
  ChatMessage,
  ChatMessageKind,
  LobbyRoomInfo,
  AnyLobbyRoomInfo,
  RoomState,
  AnyRoomState,
  Standing,
  DrawAndGuessPhase,
  DrawAndGuessGameSummary,
  DrawAndGuessRoundSummary,
  DrawAndGuessLobbyRoomInfo,
  DrawAndGuessRoomState,
  DrawAndGuessSettings,
  MinesweeperDifficulty,
  MinesweeperSettings,
  MinesweeperCellView,
  MinesweeperPhase,
  MinesweeperPickResult,
  MinesweeperGameSummary,
  MinesweeperLobbyRoomInfo,
  MinesweeperRoomState,
  Make24Settings,
  Make24LobbyRoomInfo,
  Make24Step,
  Make24Phase,
  Make24Solve,
  Make24HandResult,
  Make24GameSummary,
  Make24RoomState,
  PairsBoard,
  PairsSettings,
  PairsLobbyRoomInfo,
  PairsPhase,
  PairsCardView,
  PairsGameSummary,
  PairsRoomState,
  TriosSettings,
  TriosLobbyRoomInfo,
  TriosPhase,
  TriosTrio,
  TriosGameSummary,
  TriosRoomState,
  SnapSettings,
  SnapLobbyRoomInfo,
  SnapPhase,
  SnapCard,
  SnapMiddle,
  SnapTake,
  SnapMiss,
  SnapGameSummary,
  SnapRoomState,
  LiarsDiceSettings,
  LiarsDiceLobbyRoomInfo,
  LiarsDicePhase,
  LiarsDiceBid,
  LiarsDiceCup,
  LiarsDiceReveal,
  LiarsDiceStanding,
  LiarsDiceGameSummary,
  LiarsDiceRoomState,
  HushSettings,
  HushLobbyRoomInfo,
  HushPhase,
  HushPlay,
  HushDiscard,
  HushSeat,
  HushMistake,
  HushLevelRecord,
  HushHeld,
  HushGameSummary,
  HushRoomState,
  DailyWordSettings,
  DailyWordLobbyRoomInfo,
  DailyWordPhase,
  DailyWordMark,
  DailyWordRow,
  DailyWordBoard,
  DailyWordRoundResult,
  DailyWordGameSummary,
  DailyWordRoomState,
  CodeBreakerSettings,
  CodeBreakerLobbyRoomInfo,
  CodeBreakerPhase,
  CodeBreakerMark,
  CodeBreakerRow,
  CodeBreakerBoard,
  CodeBreakerRoundResult,
  CodeBreakerGameSummary,
  CodeBreakerRoomState,
  DoodleChainSettings,
  DoodleChainLobbyRoomInfo,
  DoodleChainKind,
  DoodleChainPhase,
  DoodleChainStepEnd,
  DoodleChainPlayer,
  DoodleChainDraft,
  DoodleChainContent,
  DoodleChainEntry,
  DoodleChainSeat,
  DoodleChainTask,
  DoodleChainChain,
  DoodleChainReveal,
  DoodleChainGameSummary,
  DoodleChainRoomState,
  GomokuSettings,
  GomokuLobbyRoomInfo,
  GomokuPhase,
  GomokuColor,
  GomokuSide,
  GomokuColors,
  GomokuMove,
  GomokuEnding,
  GomokuGameSummary,
  GomokuRoomState,
  ClientToServerEvent,
  ClientToServerEvents,
  ServerToClientEvent,
  ServerToClientEvents,
} from '../../shared/wire-types.js';

export type { RoomCanvas, DrawAndGuessState };
