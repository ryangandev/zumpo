import { notices } from '../../../client/src/i18n/en/notices.js';
import { chatText } from '../../../client/src/room/notice-text.js';
import type { AddressInfo } from 'node:net';
import { io as createClient, type Socket } from 'socket.io-client';
import {
  createZumpoServer,
  type CreateZumpoServerOptions,
  type ZumpoServer,
} from '../../app.js';
import type {
  LiarsDiceDurationsInSeconds,
  DailyWordDurationsInSeconds,
  CodeBreakerDurationsInSeconds,
  DoodleChainDurationsInSeconds,
  HushDurationsInSeconds,
  Make24DurationsInSeconds,
  MinesweeperDurationsInSeconds,
  PairsDurationsInSeconds,
  PhaseDurationsInSeconds,
  TriosDurationsInSeconds,
  SnapDurationsInSeconds,
  GomokuDurationsInSeconds,
} from '../../libs/game-clock.js';
import type { MinesweeperState } from '../../socket/minesweeper/index.js';
import type { Make24State } from '../../socket/make-24/index.js';
import type { PairsState } from '../../socket/pairs/index.js';
import type { TriosState } from '../../socket/trios/index.js';
import type { SnapState } from '../../socket/snap/index.js';
import type { GomokuState } from '../../socket/gomoku/index.js';
import type { LiarsDiceState } from '../../socket/liars-dice/index.js';
import type { HushState } from '../../socket/hush/index.js';
import type { DailyWordState } from '../../socket/daily-word/index.js';
import type { CodeBreakerState } from '../../socket/code-breaker/index.js';
import type { DoodleChainState } from '../../socket/doodle-chain/index.js';
import type {
  AnyLobbyRoomInfo,
  AnyRoomState,
  ChatMessage,
  ClientToServerEvents,
  DailyWordRoomState,
  CodeBreakerRoomState,
  DoodleChainRoomState,
  DrawAndGuessRoomState,
  DrawAndGuessState,
  GameType,
  HandshakeAuth,
  LiarsDiceRoomState,
  HushRoomState,
  Make24RoomState,
  MinesweeperDifficulty,
  MinesweeperRoomState,
  PairsBoard,
  PairsRoomState,
  PlayerIdentity,
  RoomSeat,
  TriosRoomState,
  SnapRoomState,
  GomokuRoomState,
  ServerToClientEvent,
  ServerToClientEvents,
  WordCategory,
} from '../../models/types.js';
import type { Room } from '../../libs/rooms/types.js';
import { WORD_CATEGORIES } from '../../../shared/draw-and-guess.js';

/**
 * Phases short enough that a full game runs inside a test, but long enough that
 * a loaded machine does not tick past one before the assertions for it run.
 */
const FAST_PHASES: PhaseDurationsInSeconds = {
  wordSelecting: 0.3,
  drawing: 0.4,
  reviewing: 0.2,
};

/** A drawing phase long enough to make several assertions inside one. */
const SLOW_DRAWING: PhaseDurationsInSeconds = {
  wordSelecting: 0.2,
  drawing: 5,
  reviewing: 0.2,
};

/**
 * A round window long enough that a test can pick inside it deliberately, and a
 * reveal short enough that a game of many rounds still finishes in a test.
 */
const FAST_MINESWEEPER: MinesweeperDurationsInSeconds = {
  round: 0.6,
  reveal: 0.1,
};

/**
 * A hand long enough to solve deliberately inside it, and results short
 * enough that a game of five hands still finishes in a test.
 */
const FAST_MAKE24: Make24DurationsInSeconds = {
  hand: 1,
  reveal: 0.1,
};

/**
 * A turn long enough to flip two cards deliberately inside it, and a miss on
 * show long enough to assert on before the turn passes.
 */
const FAST_PAIRS: PairsDurationsInSeconds = {
  turn: 1,
  show: 0.3,
};

/**
 * A taken trio on show long enough to assert on, a lockout that outlasts a
 * second claim, and hints that come quickly but not before a test can claim.
 */
const FAST_TRIOS: TriosDurationsInSeconds = {
  taken: 0.3,
  lockout: 0.5,
  hint: 0.8,
};

/**
 * A taken card on show long enough to assert on, and a lockout that outlasts
 * a second claim.
 */
const FAST_SNAP: SnapDurationsInSeconds = {
  taken: 0.2,
  lockout: 1,
};

/**
 * A turn long enough to bid or call deliberately inside it, and a reveal long
 * enough to assert on before the next round is rolled.
 */
const FAST_LIARS_DICE: LiarsDiceDurationsInSeconds = {
  turn: 1,
  reveal: 0.3,
};

/**
 * A countdown and a mistake long enough to assert on inside them, and a
 * cleared level short enough that a game of several levels fits in a test.
 */
const FAST_HUSH: HushDurationsInSeconds = {
  countdown: 0.2,
  mistake: 0.3,
  cleared: 0.2,
};

/**
 * A round long enough to type several guesses deliberately inside it, and
 * results short enough that a game of three words still finishes in a test.
 */
const FAST_DAILY_WORD: DailyWordDurationsInSeconds = {
  round: 2,
  reveal: 0.1,
};

/**
 * The same for Code Breaker, with a round long enough for all ten guesses,
 * which a socket's request budget paces past its burst.
 */
const FAST_CODE_BREAKER: CodeBreakerDurationsInSeconds = {
  round: 3,
  reveal: 0.1,
};

/**
 * Steps long enough to write, draw and press Done deliberately inside them,
 * which is how most tests end a step, and a short pause between them.
 */
const FAST_DOODLE_CHAIN: DoodleChainDurationsInSeconds = {
  write: 2,
  describe: 2,
  draw: 2,
  passing: 0.15,
};

/** A move clock long enough to place stones deliberately inside it. */
const FAST_GOMOKU: GomokuDurationsInSeconds = {
  turn: 2,
};

/** A client socket typed on the contract, from the client's side of it. */
type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * A connected client that has already identified itself. `playerId` is what the
 * server keys rooms by, so it is what assertions about seats and scores use.
 *
 * `state` is the latest `room:state` this client was sent, which is all a real
 * client renders from.
 */
interface TestClient extends ClientSocket {
  playerId: string;
  token: string;
  reconnectGraceMs: number;
  state: AnyRoomState | undefined;
}

interface TestServer {
  url: string;
  server: ZumpoServer;
  /**
   * Opens a client, connects it, and completes the identity handshake.
   * `headers` go with the handshake, as a proxy in front would add them.
   */
  connect: (
    identity?: PlayerIdentity,
    headers?: Record<string, string>,
  ) => Promise<TestClient>;
  /**
   * What a browser refresh does: drop the connection and open a new one
   * presenting the same identity. The returned client is a different socket
   * claiming to be the same player.
   */
  reload: (client: TestClient) => Promise<TestClient>;
  /** Closes every client this harness opened, then the server. */
  teardown: () => Promise<void>;
}

/**
 * Boots a real server on an ephemeral port. Every suite gets its own, so a room
 * left behind by one test can never be seen by another.
 */
const startTestServer = async (
  phaseDurations: PhaseDurationsInSeconds = FAST_PHASES,
  graceInSeconds = 0.6,
  minesweeperDurations: MinesweeperDurationsInSeconds = FAST_MINESWEEPER,
  make24Durations: Make24DurationsInSeconds = FAST_MAKE24,
  pairsDurations: PairsDurationsInSeconds = FAST_PAIRS,
  overrides: CreateZumpoServerOptions = {},
): Promise<TestServer> => {
  const server = createZumpoServer({
    serveClient: false,
    phaseDurations,
    minesweeperDurations,
    make24Durations,
    pairsDurations,
    triosDurations: FAST_TRIOS,
    snapDurations: FAST_SNAP,
    liarsDiceDurations: FAST_LIARS_DICE,
    hushDurations: FAST_HUSH,
    dailyWordDurations: FAST_DAILY_WORD,
    codeBreakerDurations: FAST_CODE_BREAKER,
    doodleChainDurations: FAST_DOODLE_CHAIN,
    gomokuDurations: FAST_GOMOKU,
    graceInSeconds,
    // Every test client comes from this machine; the limits' own tests turn
    // them back on.
    perAddressLimits: false,
    ...overrides,
  });

  await new Promise<void>((resolve) => {
    server.httpServer.listen(0, '127.0.0.1', () => resolve());
  });

  const { port } = server.httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const clients: ClientSocket[] = [];

  const connect = (
    identity?: PlayerIdentity,
    headers?: Record<string, string>,
  ): Promise<TestClient> =>
    new Promise((resolve, reject) => {
      const auth: HandshakeAuth = { identity: identity ?? null };
      const client = createClient(url, {
        transports: ['websocket'],
        forceNew: true,
        auth,
        ...(headers && { extraHeaders: headers }),
      }) as TestClient;
      clients.push(client);
      client.state = undefined;
      client.on('room:state', (state) => {
        client.state = state;
      });
      client.on('connect_error', reject);

      // Every real client waits for its identity before doing anything else;
      // the server reads the player id off the connection, never off a payload.
      client.once('session:ready', (session) => {
        client.playerId = session.playerId;
        client.token = session.token;
        client.reconnectGraceMs = session.reconnectGraceMs;
        resolve(client);
      });
    });

  const reload = async (client: TestClient): Promise<TestClient> => {
    const identity = { playerId: client.playerId, token: client.token };
    client.close();
    return connect(identity);
  };

  const teardown = async (): Promise<void> => {
    for (const client of clients) client.close();
    await server.close();
  };

  return { url, server, connect, reload, teardown };
};

type Args<E extends ServerToClientEvent> = Parameters<ServerToClientEvents[E]>;

type Listener = (...args: unknown[]) => void;

/**
 * The client's listener types cannot follow an event chosen by a generic
 * parameter, so the two helpers that take one listen through this. Their own
 * signatures are typed on the contract, which is what callers see.
 */
const listenersOf = (socket: ClientSocket) =>
  socket as unknown as {
    on: (event: string, listener: Listener) => void;
    off: (event: string, listener: Listener) => void;
  };

/**
 * Resolves with the arguments of the next `event` that satisfies `predicate`,
 * rejecting if none arrives in time.
 */
const waitFor = <E extends ServerToClientEvent>(
  socket: ClientSocket,
  event: E,
  predicate: (...args: Args<E>) => boolean = () => true,
  timeoutMs = 3000,
): Promise<Args<E>> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listenersOf(socket).off(event, onEvent);
      reject(new Error(`Timed out waiting for a matching "${event}"`));
    }, timeoutMs);

    const onEvent = (...args: unknown[]) => {
      if (!predicate(...(args as Args<E>))) return;
      clearTimeout(timer);
      listenersOf(socket).off(event, onEvent);
      resolve(args as Args<E>);
    };

    listenersOf(socket).on(event, onEvent);
  });

/**
 * Resolves with the next `room:state` this client is sent that satisfies
 * `predicate`. A snapshot goes out whenever anything in the room changes, so
 * "the next snapshot" is rarely the one a test means; it says which here.
 */
const waitForState = async <T extends AnyRoomState = AnyRoomState>(
  client: ClientSocket,
  predicate: (state: T) => boolean = () => true,
  timeoutMs = 3000,
): Promise<T> => {
  const [state] = await waitFor(
    client,
    'room:state',
    (candidate) => predicate(candidate as T),
    timeoutMs,
  );
  return state as T;
};

/** The same, for Draw & Guess, whose snapshots most tests read. */
const waitForDrawState = (
  client: ClientSocket,
  predicate: (state: DrawAndGuessRoomState) => boolean = () => true,
  timeoutMs = 3000,
) => waitForState<DrawAndGuessRoomState>(client, predicate, timeoutMs);

/** And for Minesweeper. */
const waitForMineState = (
  client: ClientSocket,
  predicate: (state: MinesweeperRoomState) => boolean = () => true,
  timeoutMs = 3000,
) => waitForState<MinesweeperRoomState>(client, predicate, timeoutMs);

/** And for Make 24. */
const waitForMake24State = (
  client: ClientSocket,
  predicate: (state: Make24RoomState) => boolean = () => true,
  timeoutMs = 3000,
) => waitForState<Make24RoomState>(client, predicate, timeoutMs);

/** And for Pairs. */
const waitForPairsState = (
  client: ClientSocket,
  predicate: (state: PairsRoomState) => boolean = () => true,
  timeoutMs = 3000,
) => waitForState<PairsRoomState>(client, predicate, timeoutMs);

/** And for Trios. */
const waitForTriosState = (
  client: ClientSocket,
  predicate: (state: TriosRoomState) => boolean = () => true,
  timeoutMs = 3000,
) => waitForState<TriosRoomState>(client, predicate, timeoutMs);

/** And for Snap. */
const waitForSnapState = (
  client: ClientSocket,
  predicate: (state: SnapRoomState) => boolean = () => true,
  timeoutMs = 3000,
) => waitForState<SnapRoomState>(client, predicate, timeoutMs);

/** And for Gomoku. */
const waitForGomokuState = (
  client: ClientSocket,
  predicate: (state: GomokuRoomState) => boolean = () => true,
  timeoutMs = 3000,
) => waitForState<GomokuRoomState>(client, predicate, timeoutMs);

/** And for Liar's Dice. */
const waitForLiarsDiceState = (
  client: ClientSocket,
  predicate: (state: LiarsDiceRoomState) => boolean = () => true,
  timeoutMs = 3000,
) => waitForState<LiarsDiceRoomState>(client, predicate, timeoutMs);

/** And for Hush. */
const waitForHushState = (
  client: ClientSocket,
  predicate: (state: HushRoomState) => boolean = () => true,
  timeoutMs = 3000,
) => waitForState<HushRoomState>(client, predicate, timeoutMs);

/** And for Daily Word. */
const waitForDailyWordState = (
  client: ClientSocket,
  predicate: (state: DailyWordRoomState) => boolean = () => true,
  timeoutMs = 3000,
) => waitForState<DailyWordRoomState>(client, predicate, timeoutMs);

/** And for Code Breaker. */
const waitForCodeBreakerState = (
  client: ClientSocket,
  predicate: (state: CodeBreakerRoomState) => boolean = () => true,
  timeoutMs = 3000,
) => waitForState<CodeBreakerRoomState>(client, predicate, timeoutMs);
/** And for Doodle Chain. */
const waitForDoodleChainState = (
  client: ClientSocket,
  predicate: (state: DoodleChainRoomState) => boolean = () => true,
  timeoutMs = 3000,
) => waitForState<DoodleChainRoomState>(client, predicate, timeoutMs);

/** Resolves with the next chat message that satisfies `predicate`. */
const waitForChat = async (
  client: ClientSocket,
  predicate: (message: ChatMessage) => boolean = () => true,
  timeoutMs = 3000,
): Promise<ChatMessage> => {
  const [, message] = await waitFor(
    client,
    'chat:message',
    (_roomId, candidate) => predicate(candidate),
    timeoutMs,
  );
  return message;
};

/**
 * Records the arguments of every `event` for later assertion. Used where a
 * test needs to prove something did *not* happen, which no amount of waiting
 * can show.
 */
const collect = <E extends ServerToClientEvent>(
  socket: ClientSocket,
  event: E,
): Args<E>[] => {
  const received: Args<E>[] = [];
  listenersOf(socket).on(event, (...args) => {
    received.push(args as Args<E>);
  });
  return received;
};

/** Every chat message this client is sent from now on. */
const collectChat = (socket: ClientSocket): ChatMessage[] => {
  const received: ChatMessage[] = [];
  socket.on('chat:message', (_roomId, message) => {
    received.push(message);
  });
  return received;
};

/**
 * The notices among `chat` that say a game ended: an early end posts only
 * `game:interrupted`, a finished game its result.
 */
const endNotices = (chat: readonly ChatMessage[]): string[] =>
  chat
    .map((message) => message.notice?.type ?? '')
    .filter((type) =>
      ['game:interrupted', 'game:over', 'game:ended'].includes(type),
    );

/** Every snapshot this client is sent from now on. */
const collectStates = <T extends AnyRoomState = DrawAndGuessRoomState>(
  socket: ClientSocket,
): T[] => {
  const received: T[] = [];
  socket.on('room:state', (state) => {
    received.push(state as T);
  });
  return received;
};

/** Long enough for an emit to have made a full round trip if it was going to. */
const settle = (ms = 150): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends a request and resolves with its answer. Any socket-level argument
 * list works, which is what lets a test send a request the UI could not.
 */
const request = <T = { ok: boolean; error?: { type: string } }>(
  socket: ClientSocket,
  event: string,
  ...args: unknown[]
): Promise<T> =>
  (
    socket.timeout(3000) as unknown as {
      emitWithAck: (event: string, ...args: unknown[]) => Promise<T>;
    }
  ).emitWithAck(event, ...args);

interface CreateRoomOptions {
  roomName?: string;
  username?: string;
  maxPlayers?: number;
  rounds?: number;
  /** Every category unless the test says. */
  categories?: WordCategory[];
  password?: string;
}

/**
 * Creates a Draw & Guess room and returns its id. The creator is seated in it
 * as its owner by the request itself.
 */
const createRoom = async (
  client: ClientSocket,
  options: CreateRoomOptions = {},
): Promise<string> => {
  const answer = await client.timeout(3000).emitWithAck('room:create', {
    gameType: 'draw-and-guess',
    roomName: options.roomName ?? 'Test Room',
    username: options.username ?? 'Owner',
    maxPlayers: options.maxPlayers ?? 4,
    password: options.password ?? '',
    settings: {
      rounds: options.rounds ?? 1,
      categories: options.categories ?? [...WORD_CATEGORIES],
    },
  });
  if (!answer.ok) throw new Error(`room:create refused: ${answer.error.type}`);
  return answer.roomId;
};

interface CreateMinesweeperRoomOptions {
  roomName?: string;
  username?: string;
  maxPlayers?: number;
  difficulty?: MinesweeperDifficulty;
  password?: string;
}

/** Creates a Minesweeper room, with its creator seated, and returns its id. */
const createMinesweeperRoom = async (
  client: ClientSocket,
  options: CreateMinesweeperRoomOptions = {},
): Promise<string> => {
  const answer = await client.timeout(3000).emitWithAck('room:create', {
    gameType: 'minesweeper',
    roomName: options.roomName ?? 'Minefield',
    username: options.username ?? 'Owner',
    maxPlayers: options.maxPlayers ?? 4,
    password: options.password ?? '',
    settings: { difficulty: options.difficulty ?? 'Small' },
  });
  if (!answer.ok) throw new Error(`room:create refused: ${answer.error.type}`);
  return answer.roomId;
};

/** Creates a Make 24 room, with its creator seated, and returns its id. */
const createMake24Room = async (
  client: ClientSocket,
  options: { roomName?: string; username?: string; hands?: number } = {},
): Promise<string> => {
  const answer = await client.timeout(3000).emitWithAck('room:create', {
    gameType: 'make-24',
    roomName: options.roomName ?? 'Card table',
    username: options.username ?? 'Owner',
    maxPlayers: 4,
    password: '',
    settings: { hands: options.hands ?? 5 },
  });
  if (!answer.ok) throw new Error(`room:create refused: ${answer.error.type}`);
  return answer.roomId;
};

/** Creates a Pairs room, with its creator seated, and returns its id. */
const createPairsRoom = async (
  client: ClientSocket,
  options: { username?: string; board?: PairsBoard; maxPlayers?: number } = {},
): Promise<string> => {
  const answer = await client.timeout(3000).emitWithAck('room:create', {
    gameType: 'pairs',
    roomName: 'Memory lane',
    username: options.username ?? 'Owner',
    maxPlayers: options.maxPlayers ?? 4,
    password: '',
    settings: { board: options.board ?? 'Small' },
  });
  if (!answer.ok) throw new Error(`room:create refused: ${answer.error.type}`);
  return answer.roomId;
};

/** Creates a Trios room, with its creator seated, and returns its id. */
const createTriosRoom = async (
  client: ClientSocket,
  options: { username?: string; trios?: number; maxPlayers?: number } = {},
): Promise<string> => {
  const answer = await client.timeout(3000).emitWithAck('room:create', {
    gameType: 'trios',
    roomName: 'Odd ones in',
    username: options.username ?? 'Owner',
    maxPlayers: options.maxPlayers ?? 4,
    password: '',
    settings: { trios: options.trios ?? 10 },
  });
  if (!answer.ok) throw new Error(`room:create refused: ${answer.error.type}`);
  return answer.roomId;
};

/** Creates a Snap room, with its creator seated, and returns its id. */
const createSnapRoom = async (
  client: ClientSocket,
  options: { username?: string; maxPlayers?: number } = {},
): Promise<string> => {
  const answer = await client.timeout(3000).emitWithAck('room:create', {
    gameType: 'snap',
    roomName: 'Spot on',
    username: options.username ?? 'Owner',
    maxPlayers: options.maxPlayers ?? 4,
    password: '',
    settings: {},
  });
  if (!answer.ok) throw new Error(`room:create refused: ${answer.error.type}`);
  return answer.roomId;
};

/** Creates a Gomoku room, with its creator seated, and returns its id. */
const createGomokuRoom = async (
  client: ClientSocket,
  options: { username?: string } = {},
): Promise<string> => {
  const answer = await client.timeout(3000).emitWithAck('room:create', {
    gameType: 'gomoku',
    roomName: 'Five in a row',
    username: options.username ?? 'Owner',
    maxPlayers: 2,
    password: '',
    settings: {},
  });
  if (!answer.ok) throw new Error(`room:create refused: ${answer.error.type}`);
  return answer.roomId;
};

/** Creates a Liar's Dice room, with its creator seated, and returns its id. */
const createLiarsDiceRoom = async (
  client: ClientSocket,
  options: {
    username?: string;
    dicePerPlayer?: number;
    maxPlayers?: number;
  } = {},
): Promise<string> => {
  const answer = await client.timeout(3000).emitWithAck('room:create', {
    gameType: 'liars-dice',
    roomName: 'Tavern',
    username: options.username ?? 'Owner',
    maxPlayers: options.maxPlayers ?? 4,
    password: '',
    settings: { dicePerPlayer: options.dicePerPlayer ?? 3 },
  });
  if (!answer.ok) throw new Error(`room:create refused: ${answer.error.type}`);
  return answer.roomId;
};

/** Creates a Hush room, with its creator seated, and returns its id. */
const createHushRoom = async (
  client: ClientSocket,
  options: { username?: string; maxPlayers?: number } = {},
): Promise<string> => {
  const answer = await client.timeout(3000).emitWithAck('room:create', {
    gameType: 'hush',
    roomName: 'Quiet corner',
    username: options.username ?? 'Owner',
    maxPlayers: options.maxPlayers ?? 4,
    password: '',
    settings: {},
  });
  if (!answer.ok) throw new Error(`room:create refused: ${answer.error.type}`);
  return answer.roomId;
};

/** Creates a Doodle Chain room, with its creator seated, and returns its id. */
const createDoodleChainRoom = async (
  client: ClientSocket,
  options: {
    username?: string;
    drawingSeconds?: number;
    maxPlayers?: number;
  } = {},
): Promise<string> => {
  const answer = await client.timeout(3000).emitWithAck('room:create', {
    gameType: 'doodle-chain',
    roomName: 'Sketchbook',
    username: options.username ?? 'Owner',
    maxPlayers: options.maxPlayers ?? 8,
    password: '',
    settings: { drawingSeconds: options.drawingSeconds ?? 60 },
  });
  if (!answer.ok) throw new Error(`room:create refused: ${answer.error.type}`);
  return answer.roomId;
};

/**
 * The server's own Doodle Chain room. Tests read the chains through it on
 * purpose: what everybody made is exactly what no client is sent before the
 * reveal.
 */
const doodleChainRoom = (
  harness: TestServer,
  roomId: string,
): Room<DoodleChainState> =>
  harness.server.rooms.get(roomId) as Room<DoodleChainState>;

/**
 * Takes a seat, or a spectator seat, and fails the test if the server
 * refuses it. Without `seat` the room decides, as a room page lets it.
 */
const joinRoom = async (
  client: ClientSocket,
  roomId: string,
  username: string,
  password = '',
  seat: RoomSeat | null = null,
): Promise<void> => {
  const answer = await client
    .timeout(3000)
    .emitWithAck('room:join', roomId, username, password, seat);
  if (!answer.ok) throw new Error(`room:join refused: ${answer.error.type}`);
};

/** A client for each name, as a tuple exactly as long as the names. */
type ClientsFor<Names extends readonly string[]> = {
  -readonly [K in keyof Names]: TestClient;
};

/** Names for a table of two, when a test does not care who sits at it. */
const TWO_NAMES = ['Alice', 'Bob'] as const;

/**
 * Connects a client per name and seats them at a table the first makes with
 * `create`, as its owner. The clients come back in a tuple as long as the
 * names, so a test can take them apart by name.
 */
const seatTable = async <const Names extends readonly [string, ...string[]]>(
  harness: TestServer,
  names: Names,
  create: (owner: TestClient, username: string) => Promise<string>,
): Promise<{
  roomId: string;
  players: ClientsFor<Names>;
  owner: TestClient;
}> => {
  const players: TestClient[] = [];
  for (const _ of names) players.push(await harness.connect());
  const [owner] = players as [TestClient];
  const roomId = await create(owner, names[0]);
  for (const [index, player] of players.entries()) {
    if (index > 0) await joinRoom(player, roomId, names[index]!);
  }
  return { roomId, players: players as ClientsFor<Names>, owner };
};

/** Starts the game, and fails the test if the server refuses. */
const startGame = async (client: ClientSocket, roomId: string) => {
  const answer = await client.timeout(3000).emitWithAck('game:start', roomId);
  if (!answer.ok) throw new Error(`game:start refused: ${answer.error.type}`);
};

/**
 * What a room page does once it has mounted: ask for the room, and collect
 * what comes back (the snapshot, the chat so far, and the drawing for Draw &
 * Guess).
 */
const syncRoom = async (client: ClientSocket, roomId: string) => {
  const state = waitFor(client, 'room:state');
  const history = waitFor(
    client,
    'chat:history',
    (forRoom) => forRoom === roomId,
  );
  const answer = await client.timeout(3000).emitWithAck('room:sync', roomId);
  if (!answer.ok) throw new Error(`room:sync refused: ${answer.error.type}`);
  const [[snapshot], [, messages]] = await Promise.all([state, history]);
  return { state: snapshot, messages };
};

/**
 * Seats Alice (the owner) and Bob in a Draw & Guess room, without starting it.
 */
const seatTwoPlayers = async (harness: TestServer, rounds = 1) => {
  const alice = await harness.connect();
  const bob = await harness.connect();
  const roomId = await createRoom(alice, { username: 'Alice', rounds });
  await joinRoom(bob, roomId, 'Bob');
  return { alice, bob, roomId };
};

/**
 * Seats two players and plays as far as the drawing phase, reporting who the
 * server picked to draw, who is left guessing, and what the word is.
 *
 * The drawer is chosen at random, so no test may assume it is a particular
 * client; the snapshot says who it is, and the drawer's own says the word.
 */
const playToDrawingPhase = async (harness: TestServer) => {
  const { alice, bob, roomId } = await seatTwoPlayers(harness);

  const aliceDrawing = waitForDrawState(
    alice,
    (s) => s.phase === 'drawing',
    5000,
  );
  const bobDrawing = waitForDrawState(bob, (s) => s.phase === 'drawing', 5000);
  await startGame(alice, roomId);
  const [aliceView, bobView] = await Promise.all([aliceDrawing, bobDrawing]);

  const drawer = aliceView.currentDrawer === alice.playerId ? alice : bob;
  const guesser = drawer === alice ? bob : alice;
  const drawerView = drawer === alice ? aliceView : bobView;

  return {
    roomId,
    alice,
    bob,
    drawer,
    drawerName: drawer === alice ? 'Alice' : 'Bob',
    guesser,
    guesserName: guesser === alice ? 'Alice' : 'Bob',
    word: drawerView.word!,
  };
};

/**
 * The lobby's view of a single room, as any subscriber would see it.
 * Subscribing is what asks for the list now.
 */
const lobbyView = async (
  socket: ClientSocket,
  roomId: string,
  gameType: GameType = 'draw-and-guess',
): Promise<AnyLobbyRoomInfo | undefined> => {
  const list = waitFor(
    socket,
    'lobby:rooms',
    (forGame) => forGame === gameType,
  );
  socket.emit('lobby:subscribe', gameType);
  const [, rooms] = await list;
  return rooms.find((room) => room.roomId === roomId);
};

/** The server's own copy of a room, typed as the Draw & Guess room it is. */
const serverRoom = (
  harness: TestServer,
  roomId: string,
): Room<DrawAndGuessState> =>
  harness.server.rooms.get(roomId) as Room<DrawAndGuessState>;

/**
 * The same, for Minesweeper. Tests reach through to the hidden layout on
 * purpose: knowing where the mines are is the only way to assert on what a pick
 * *should* have paid, and it is exactly what a client can never see.
 */
const minesweeperRoom = (
  harness: TestServer,
  roomId: string,
): Room<MinesweeperState> =>
  harness.server.rooms.get(roomId) as Room<MinesweeperState>;

/** The server's own Make 24 room, with every hand of the game in it. */
const make24Room = (harness: TestServer, roomId: string): Room<Make24State> =>
  harness.server.rooms.get(roomId) as Room<Make24State>;

/** Seats Alice and Bob in a Make 24 room and deals the first hand. */
const playToFirstHand = async (harness: TestServer, hands = 5) => {
  const alice = await harness.connect();
  const bob = await harness.connect();

  const roomId = await createMake24Room(alice, { username: 'Alice', hands });
  await joinRoom(bob, roomId, 'Bob');

  const hand = waitForMake24State(
    alice,
    (state) => state.phase === 'solving' && state.hand === 1,
    5000,
  );
  await startGame(alice, roomId);
  const first = await hand;

  return { roomId, alice, bob, first };
};

/**
 * The server's own Pairs room. Tests read the deck through it on purpose:
 * knowing where each symbol lies is the only way to play a pair or a miss
 * deliberately, and it is exactly what a client is never sent.
 */
const pairsRoom = (harness: TestServer, roomId: string): Room<PairsState> =>
  harness.server.rooms.get(roomId) as Room<PairsState>;

/**
 * The server's own Trios room. Tests read the deck through it to know what is
 * coming; the table they can read off any snapshot, as a player could.
 */
const triosRoom = (harness: TestServer, roomId: string): Room<TriosState> =>
  harness.server.rooms.get(roomId) as Room<TriosState>;

/**
 * The server's own Snap room. Tests read the pile and the hands through it to
 * know what is coming and what another player holds, which no client is sent.
 */
const snapRoom = (harness: TestServer, roomId: string): Room<SnapState> =>
  harness.server.rooms.get(roomId) as Room<SnapState>;

/** The server's own Gomoku room. */
const gomokuRoom = (harness: TestServer, roomId: string): Room<GomokuState> =>
  harness.server.rooms.get(roomId) as Room<GomokuState>;

/**
 * The server's own Liar's Dice room. Tests read and set the dice through it on
 * purpose: a call can only be played deliberately by knowing what the cups
 * hold, which is exactly what a client is never sent.
 */
const liarsDiceRoom = (
  harness: TestServer,
  roomId: string,
): Room<LiarsDiceState> =>
  harness.server.rooms.get(roomId) as Room<LiarsDiceState>;

/**
 * The server's own Hush room. Tests read the hands through it on purpose:
 * knowing who holds what is the only way to play a mistake deliberately, and
 * it is exactly what a client is never sent.
 */
const hushRoom = (harness: TestServer, roomId: string): Room<HushState> =>
  harness.server.rooms.get(roomId) as Room<HushState>;

/** Creates a Daily Word room, with its creator seated, and returns its id. */
const createDailyWordRoom = async (
  client: ClientSocket,
  options: { username?: string; rounds?: number; maxPlayers?: number } = {},
): Promise<string> => {
  const answer = await client.timeout(3000).emitWithAck('room:create', {
    gameType: 'daily-word',
    roomName: 'Word table',
    username: options.username ?? 'Owner',
    maxPlayers: options.maxPlayers ?? 4,
    password: '',
    settings: { rounds: options.rounds ?? 3 },
  });
  if (!answer.ok) throw new Error(`room:create refused: ${answer.error.type}`);
  return answer.roomId;
};

/**
 * The server's own Daily Word room. Tests read the words through it on
 * purpose: knowing the word is the only way to find it deliberately, and it is
 * exactly what a client is never sent.
 */
const dailyWordRoom = (
  harness: TestServer,
  roomId: string,
): Room<DailyWordState> =>
  harness.server.rooms.get(roomId) as Room<DailyWordState>;

/** Seats Alice and Bob, and Carol if asked, in a Daily Word room and opens the first word. */
const playToFirstWord = async (
  harness: TestServer,
  rounds = 3,
  { carol = false }: { carol?: boolean } = {},
) => {
  const alice = await harness.connect();
  const bob = await harness.connect();
  const third = carol ? await harness.connect() : null;

  const roomId = await createDailyWordRoom(alice, {
    username: 'Alice',
    rounds,
  });
  await joinRoom(bob, roomId, 'Bob');
  if (third) await joinRoom(third, roomId, 'Carol');

  const round = waitForDailyWordState(
    alice,
    (state) => state.phase === 'guessing' && state.round === 1,
    5000,
  );
  await startGame(alice, roomId);
  const first = await round;

  return { roomId, alice, bob, carol: third, first };
};

/** Creates a Code Breaker room, with its creator seated, and returns its id. */
const createCodeBreakerRoom = async (
  client: ClientSocket,
  options: { username?: string; rounds?: number; maxPlayers?: number } = {},
): Promise<string> => {
  const answer = await client.timeout(3000).emitWithAck('room:create', {
    gameType: 'code-breaker',
    roomName: 'Code table',
    username: options.username ?? 'Owner',
    maxPlayers: options.maxPlayers ?? 4,
    password: '',
    settings: { rounds: options.rounds ?? 3 },
  });
  if (!answer.ok) throw new Error(`room:create refused: ${answer.error.type}`);
  return answer.roomId;
};

/**
 * The server's own Code Breaker room. Tests read the codes through it on
 * purpose: knowing the code is the only way to crack it deliberately, and it
 * is exactly what a client is never sent.
 */
const codeBreakerRoom = (
  harness: TestServer,
  roomId: string,
): Room<CodeBreakerState> =>
  harness.server.rooms.get(roomId) as Room<CodeBreakerState>;

/** Seats Alice and Bob, and Carol if asked, in a Code Breaker room and opens the first code. */
const playToFirstCode = async (
  harness: TestServer,
  rounds = 3,
  { carol = false }: { carol?: boolean } = {},
) => {
  const alice = await harness.connect();
  const bob = await harness.connect();
  const third = carol ? await harness.connect() : null;

  const roomId = await createCodeBreakerRoom(alice, {
    username: 'Alice',
    rounds,
  });
  await joinRoom(bob, roomId, 'Bob');
  if (third) await joinRoom(third, roomId, 'Carol');

  const round = waitForCodeBreakerState(
    alice,
    (state) => state.phase === 'guessing' && state.round === 1,
    5000,
  );
  await startGame(alice, roomId);
  const first = await round;

  return { roomId, alice, bob, carol: third, first };
};

/** Seats two players in a Minesweeper room and opens the first round. */
const playToFirstRound = async (harness: TestServer) => {
  const alice = await harness.connect();
  const bob = await harness.connect();

  const roomId = await createMinesweeperRoom(alice, { username: 'Alice' });
  await joinRoom(bob, roomId, 'Bob');

  const round = waitForMineState(
    alice,
    (state) => state.phase === 'picking' && state.round === 1,
    5000,
  );
  await startGame(alice, roomId);
  const first = await round;

  return { roomId, alice, bob, first };
};

export {
  FAST_PHASES,
  SLOW_DRAWING,
  FAST_MINESWEEPER,
  FAST_MAKE24,
  FAST_PAIRS,
  FAST_TRIOS,
  FAST_SNAP,
  FAST_GOMOKU,
  FAST_LIARS_DICE,
  FAST_HUSH,
  FAST_DAILY_WORD,
  FAST_CODE_BREAKER,
  FAST_DOODLE_CHAIN,
  startTestServer,
  waitFor,
  waitForState,
  waitForDrawState,
  waitForMineState,
  waitForMake24State,
  waitForPairsState,
  waitForTriosState,
  waitForSnapState,
  waitForGomokuState,
  waitForLiarsDiceState,
  waitForHushState,
  waitForDailyWordState,
  waitForCodeBreakerState,
  waitForDoodleChainState,
  waitForChat,
  collect,
  collectChat,
  endNotices,
  collectStates,
  settle,
  request,
  createRoom,
  createMinesweeperRoom,
  createMake24Room,
  createPairsRoom,
  createTriosRoom,
  createSnapRoom,
  createGomokuRoom,
  createLiarsDiceRoom,
  createHushRoom,
  createDailyWordRoom,
  createCodeBreakerRoom,
  createDoodleChainRoom,
  joinRoom,
  seatTable,
  TWO_NAMES,
  startGame,
  syncRoom,
  seatTwoPlayers,
  playToDrawingPhase,
  lobbyView,
  serverRoom,
  minesweeperRoom,
  playToFirstRound,
  make24Room,
  playToFirstHand,
  pairsRoom,
  triosRoom,
  snapRoom,
  gomokuRoom,
  liarsDiceRoom,
  hushRoom,
  dailyWordRoom,
  playToFirstWord,
  codeBreakerRoom,
  playToFirstCode,
  doodleChainRoom,
};
export type { TestServer, TestClient, ClientSocket, ClientsFor };

/** Visible English text, without adding wording to the server's wire. */
export const textOf = (message: ChatMessage): string =>
  chatText(message, { notices });
