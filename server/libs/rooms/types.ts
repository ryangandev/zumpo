import type {
  AnyLobbyRoomInfo,
  AnyRoomState,
  ChatMessage,
  ChatMessageKind,
  RoomNotice,
  GameType,
  OwnerInfo,
  PlayerInfo,
  SpectatorInfo,
} from '../../../shared/wire-types.js';
import type { IoServer, IoSocket } from './emit.js';
import type { RoomTimers } from './timers.js';

/**
 * A room's chat: the messages a page arriving now is sent as `chat:history`,
 * and the id the next one will carry.
 */
interface RoomChat {
  nextId: number;
  /** The most recent messages, oldest first, at most `CHAT_HISTORY_LIMIT`. */
  messages: ChatMessage[];
}

/**
 * A room, minus whatever game is being played in it.
 *
 * Everything here is true of every game: it has a name, an owner, a password,
 * a set of seats keyed by player id, one clock and a chat. The game's own
 * state (a word and a canvas, a minefield and a round of picks) hangs off
 * `game`, and the room layer never looks inside it.
 *
 * Keyed by player id rather than socket id. A socket id changes on every
 * reload; a player id does not, which is what lets a seat, a score and a turn
 * survive a refresh. See `libs/player-session.ts`.
 */
interface Room<TGameState = unknown> {
  gameType: GameType;
  roomId: string;
  /** '' while the room goes by its host's name, which each client words. */
  roomName: string;
  owner: OwnerInfo;
  maxPlayers: number;
  /** Never leaves the process. The wire carries `hasPassword`. */
  password: string;
  /**
   * '' for an unlocked room. Otherwise a random key that the room's invite
   * link carries and `room:join` takes in place of the password, so a friend
   * with the link sits straight down, and the password a host typed, which
   * they may use elsewhere, never goes into a link. Sent only to the room's
   * own members, in their snapshots.
   */
  inviteKey: string;
  playerList: Record<string, PlayerInfo>;
  /**
   * Who is watching. Kept apart from `playerList` so that a game, which reads
   * only `playerList`, never deals a spectator in, waits for one or scores
   * one; the room layer alone knows they are here.
   */
  spectators: Record<string, SpectatorInfo>;
  isGameStarted: boolean;
  /**
   * Who at the table has said Ready for the next game, between games; empty
   * while one is on. See `ready.ts`.
   */
  ready: Set<string>;
  /**
   * Epoch ms the current phase ends; 0 when idle. Set only by `startPhase`
   * and `stopPhase`, with the timer that ends it.
   */
  phaseEndsAt: number;
  chat: RoomChat;
  game: TGameState;
  /** The address it was made from, which counts against that address's rooms. */
  createdFrom?: string;
}

/**
 * What a game module is handed, and all it is handed.
 *
 * Deliberately small. A module gets the socket server and a way to look rooms
 * up, to tell their players something changed, to announce things, and to
 * run the room's clock and timers. Who sent an event it reads off the socket
 * (`socket.data.playerId`).
 */
interface GameContext {
  io: IoServer;
  rooms: RoomLookup;
}

/** Why a line went to its sender alone, which the client shows by it. */
type SenderMark = { close: true };

interface RoomLookup {
  get(roomId: string): Room | undefined;
  /**
   * The room, but only if it is playing this game. A room id is public (it
   * goes out in every lobby broadcast), so a handler that assumed the id it
   * was handed belonged to its own game would be reading another game's state
   * through its own type.
   */
  ofType<TGameState>(
    roomId: string,
    gameType: GameType,
  ): Room<TGameState> | undefined;
  /** Rebroadcasts one game's room list to everyone watching that lobby. */
  emitLobby(gameType: GameType): void;
  /**
   * Something visible in the room changed: every seated, connected player is
   * sent `room:state`, each built for them by the room's module.
   *
   * The one way room state reaches a client. Calls within one synchronous run
   * are coalesced into one snapshot per player, sent once the run is over, so
   * a module can call this after every change without the room seeing the
   * steps in between (a turn that ends and the next one that starts).
   */
  emitState(room: Room): void;
  /** A line in the room's chat that nobody in particular said. */
  announce(
    roomId: string,
    kind: Exclude<ChatMessageKind, 'player'>,
    notice: RoomNotice,
  ): void;
  /**
   * Shows a member what they typed, and nobody else: a Draw & Guess guess so
   * close to the word that the room would read the word in it. The line is
   * theirs, under the name on their place, marked as the game says, and a
   * refresh gives it back to them alone.
   */
  sayToSender(
    room: Room,
    playerId: string,
    text: string,
    mark: SenderMark,
  ): void;
  /**
   * Starts the room's one clock: what its players count down from and what
   * ends the phase, set together so they cannot disagree. Replaces a phase
   * still running. `onEnd` runs only if the room is still there.
   */
  startPhase(room: Room, seconds: number, onEnd: () => void): void;
  /** Stops the room's clock, for a game that ended or no longer waits. */
  stopPhase(room: Room): void;
  /**
   * A set of timers for anything else a game waits on (a letter to reveal, a
   * drawer to come back), one per room or several. They go with their room.
   */
  timers(): RoomTimers;
}

/**
 * What a module makes of a chat message:
 *
 * - `chat`: an ordinary message; the room layer posts it.
 * - `consumed`: the game used it (a correct guess) and said whatever it had to.
 * - `blocked`: nobody sees it (a drawer who would be giving the word away).
 * - `spectators`: only the spectators see it (a spectator talking while the
 *   word is drawn, who could hint at it to the players).
 */
type ChatVerdict = 'chat' | 'consumed' | 'blocked' | 'spectators';

/**
 * One game, as the room layer sees it.
 *
 * The room layer calls these; nothing else about the game is visible to it.
 * The two halves of the split are worth stating, because getting them wrong is
 * what an abstraction with a single consumer usually gets wrong:
 *
 * - **Timers.** A module decides when its timers run and what they do; the
 *   room layer keeps them, so they end with their room. A room has one clock
 *   (`startPhase`), which is what its players count down from, and a module
 *   asks for further sets of timers (`timers()`) for anything else it waits
 *   on. The layer's own are the seat expiries that hold a dropped player's
 *   place.
 * - **Per-player state.** `PlayerInfo` carries what every game has: a name, a
 *   score, whether they are still connected. Anything else about a player
 *   belongs in the module's own state, keyed by the same player id.
 */
interface GameModule<TGameState = unknown, TSettings = unknown> {
  readonly gameType: GameType;
  readonly minPlayers: number;
  readonly maxPlayers: number;

  /**
   * Reads the game-specific half of a create request, or returns null to
   * reject it. The generic half (name, seats, password) is validated by the
   * room layer before this is called.
   *
   * Between games the starter may change the settings for the next game
   * (`room:settings`), read by the same function. Each setting is kept on the
   * game's state under its own name, as `room-settings.test.ts` checks of
   * every game, so the room layer sets it there; the next `startGame` plays with it.
   */
  parseSettings(raw: unknown): TSettings | null;
  createState(settings: TSettings): TGameState;

  /** The room as its lobby table shows it. Must not carry the password. */
  toLobbyInfo(room: Room<TGameState>): AnyLobbyRoomInfo;
  /**
   * The room as one player may see it. Must not carry the password, nor
   * anything in play that this viewer is not allowed to know. The viewer may
   * be a spectator, in no `playerList`, who is shown what any player may see.
   */
  toRoomState(room: Room<TGameState>, viewerId: string): AnyRoomState;

  /**
   * Anything one arriving socket needs beyond the snapshot and the chat, such
   * as a drawing. Called by `room:sync` after both have been sent to that
   * socket alone, which is the one moment its listeners are known to be live.
   */
  syncTo(socket: IoSocket, room: Room<TGameState>, playerId: string): void;

  /**
   * Somebody in the room said something: a player, or a spectator, whose id
   * is in no `playerList` and must never score. Optional: a game without an
   * opinion has every message posted as it is.
   */
  handleChat?(
    room: Room<TGameState>,
    playerId: string,
    text: string,
  ): ChatVerdict;

  /**
   * The next game starts: the starter pressed start, or everybody said Ready.
   * The room layer has already checked that it may: no game is on, and
   * `minPlayers` are seated.
   */
  startGame(room: Room<TGameState>): void;

  /** The seat is already gone from `playerList` by the time this is called. */
  onDeparture(room: Room<TGameState>, playerId: string): void;
  /** The seat is being held; the player is marked away. */
  onDisconnect(room: Room<TGameState>, playerId: string): void;
  /** They proved who they were inside the grace period. */
  onReturn(room: Room<TGameState>, playerId: string): void;

  /** Wire up this game's own inbound events on a new connection. */
  registerHandlers(socket: IoSocket): void;
}

export type {
  Room,
  RoomChat,
  RoomLookup,
  SenderMark,
  GameContext,
  GameModule,
  ChatVerdict,
};
