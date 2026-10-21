import type {
  DailyWordRoomState,
  DoodleChainRoomState,
  DrawAndGuessRoomState,
  LiarsDiceRoomState,
  HushRoomState,
  Make24RoomState,
  MinesweeperRoomState,
  PairsRoomState,
  PlayerInfo,
  SnapRoomState,
  TriosRoomState,
} from '../../../shared/wire-types';

/** The viewer in every fixture, and the room's host unless a test says not. */
export const ME = 'p1';

const players: Record<string, PlayerInfo> = {
  p1: { username: 'Ryan', points: 0, isConnected: true },
  p2: { username: 'Maya', points: 0, isConnected: true },
};

const room = {
  roomId: 'r1',
  roomName: 'Friday table',
  owner: { username: 'Ryan', playerId: ME },
  status: 'Open' as const,
  currentPlayerCount: 2,
  maxPlayers: 8,
  hasPassword: false,
  spectatorCount: 0,
  playerList: players,
  spectators: {},
  isGameStarted: false,
  phaseEndsInMs: 0,
};

export function minesweeperState(
  overrides: Partial<MinesweeperRoomState> = {},
): MinesweeperRoomState {
  return {
    ...room,
    gameType: 'minesweeper',
    difficulty: 'Small',
    width: 9,
    height: 9,
    totalMines: 10,
    board: Array.from({ length: 81 }, () => -1),
    phase: 'waiting',
    round: 0,
    lockedIn: [],
    myPick: null,
    minesFound: 0,
    lastRound: [],
    lastGame: null,
    ...overrides,
  };
}

export function drawAndGuessState(
  overrides: Partial<DrawAndGuessRoomState> = {},
): DrawAndGuessRoomState {
  return {
    ...room,
    gameType: 'draw-and-guess',
    rounds: 2,
    phase: 'waiting',
    currentRound: 0,
    turn: 0,
    currentDrawer: '',
    wordCategory: '',
    hint: '',
    wordAutoPicked: false,
    scoredThisTurn: [],
    turnPoints: {},
    drawerHoldEndsInMs: 0,
    lastRound: null,
    lastGame: null,
    ...overrides,
  };
}

export function make24State(
  overrides: Partial<Make24RoomState> = {},
): Make24RoomState {
  return {
    ...room,
    gameType: 'make-24',
    hands: 5,
    phase: 'waiting',
    hand: 0,
    deal: [],
    solved: [],
    mySolve: null,
    lastHand: [],
    lastDeal: [],
    lastSolution: '',
    lastGame: null,
    ...overrides,
  };
}

export function pairsState(
  overrides: Partial<PairsRoomState> = {},
): PairsRoomState {
  return {
    ...room,
    maxPlayers: 6,
    gameType: 'pairs',
    board: 'Small',
    phase: 'waiting',
    cards: [],
    pairsFound: 0,
    turnPlayerId: null,
    nextPlayerId: null,
    lastMiss: [],
    lastGame: null,
    ...overrides,
  };
}

export function triosState(
  overrides: Partial<TriosRoomState> = {},
): TriosRoomState {
  return {
    ...room,
    gameType: 'trios',
    trios: 10,
    phase: 'waiting',
    found: 0,
    table: [],
    deckLeft: 0,
    lastTrio: null,
    hint: [],
    searchingMs: 0,
    lockedOutMs: 0,
    myMiss: [],
    lastGame: null,
    ...overrides,
  };
}

export function snapState(
  overrides: Partial<SnapRoomState> = {},
): SnapRoomState {
  return {
    ...room,
    maxPlayers: 6,
    gameType: 'snap',
    phase: 'waiting',
    cards: 0,
    taken: 0,
    middle: null,
    myCard: null,
    lastTake: null,
    cardMs: 0,
    lockedOutMs: 0,
    myMiss: null,
    lastGame: null,
    ...overrides,
  };
}

export function liarsDiceState(
  overrides: Partial<LiarsDiceRoomState> = {},
): LiarsDiceRoomState {
  return {
    ...room,
    maxPlayers: 6,
    gameType: 'liars-dice',
    dicePerPlayer: 3,
    phase: 'waiting',
    round: 0,
    cups: [],
    bids: [],
    turnPlayerId: null,
    nextPlayerId: null,
    reveal: null,
    lastGame: null,
    ...overrides,
  };
}

export function hushState(
  overrides: Partial<HushRoomState> = {},
): HushRoomState {
  return {
    ...room,
    maxPlayers: 4,
    gameType: 'hush',
    phase: 'waiting',
    level: 0,
    levels: 7,
    lives: 3,
    hand: [],
    table: {
      p1: { held: 0, ready: false },
      p2: { held: 0, ready: false },
    },
    pile: [],
    discards: [],
    lastMistake: null,
    lastLevel: null,
    lastGame: null,
    ...overrides,
  };
}

export function dailyWordState(
  overrides: Partial<DailyWordRoomState> = {},
): DailyWordRoomState {
  return {
    ...room,
    gameType: 'daily-word',
    rounds: 3,
    phase: 'waiting',
    round: 0,
    boards: [],
    lastRound: null,
    lastGame: null,
    ...overrides,
  };
}

/** Ryan, Maya and Leo: Doodle Chain needs three. */
export function doodleChainState(
  overrides: Partial<DoodleChainRoomState> = {},
): DoodleChainRoomState {
  return {
    ...room,
    currentPlayerCount: 3,
    playerList: {
      ...players,
      p3: { username: 'Leo', points: 0, isConnected: true },
    },
    gameType: 'doodle-chain',
    phase: 'waiting',
    step: 0,
    steps: 3,
    drawingSeconds: 60,
    order: [
      { playerId: 'p1', username: 'Ryan' },
      { playerId: 'p2', username: 'Maya' },
      { playerId: 'p3', username: 'Leo' },
    ],
    table: {},
    lastGame: null,
    ...overrides,
  };
}
