import type {
  PairsBoard,
  PairsCardView,
  PairsGameSummary,
  PairsLobbyRoomInfo,
  PairsPhase,
  PairsRoomState,
  PairsSettings,
} from '../../models/types.js';
import { lobbyBasics, roomBasics } from '../../libs/rooms/seats.js';
import type { Room } from '../../libs/rooms/types.js';

/** Everything Pairs knows that no other game would. */
interface PairsState {
  board: PairsBoard;
  phase: PairsPhase;
  /**
   * The symbol in each place, row by row: the board in play, or the last
   * game's as it ended; empty before the first. Never leaves the server,
   * except a card at a time while it is up or matched.
   */
  deck: number[];
  matched: boolean[];
  /** The places turned over this turn and not matched: none, one or two. */
  up: number[];
  /**
   * The order players take turns in, shuffled when a game starts. Nobody
   * joins a game in progress, and a player who leaves keeps their place here,
   * so the turn can still be passed on from them.
   */
  order: string[];
  /** Whose turn it is; null between games. */
  turnPlayerId: string | null;
  lastGame: PairsGameSummary | null;
}

const createState = (settings: PairsSettings): PairsState => ({
  board: settings.board,
  phase: 'waiting',
  deck: [],
  matched: [],
  up: [],
  order: [],
  turnPlayerId: null,
  lastGame: null,
});

const pairsFound = (game: PairsState): number =>
  game.matched.filter(Boolean).length / 2;

/**
 * Who goes after `playerId`: the next player in the order still seated and
 * connected. When nobody else is, it is the next one seated, so a game whose
 * players have all dropped keeps passing the turn until they return or their
 * seats go. Null only when nobody else is seated at all.
 */
const playerAfter = (
  room: Room<PairsState>,
  playerId: string | null,
): string | null => {
  const { order } = room.game;
  const from = playerId === null ? -1 : order.indexOf(playerId);
  const after = [...order.slice(from + 1), ...order.slice(0, from + 1)].filter(
    (candidate) => candidate !== playerId && room.playerList[candidate],
  );
  return (
    after.find((candidate) => room.playerList[candidate].isConnected) ??
    after[0] ??
    null
  );
};

const toLobbyInfo = (room: Room<PairsState>): PairsLobbyRoomInfo => ({
  gameType: 'pairs',
  ...lobbyBasics(room),
  board: room.game.board,
});

/**
 * The room as any player may see it. Everybody sees the same board, so the
 * viewer changes nothing: a card's symbol is sent only while it is up or
 * matched, and where the others lie never leaves the server.
 */
const toRoomState = (room: Room<PairsState>): PairsRoomState => {
  const game = room.game;
  const cards: PairsCardView[] = game.deck.map((symbol, index) =>
    game.matched[index]
      ? { state: 'matched', symbol }
      : game.up.includes(index)
        ? { state: 'up', symbol }
        : { state: 'down', symbol: null },
  );

  return {
    ...toLobbyInfo(room),
    ...roomBasics(room),
    phase: game.phase,
    cards,
    pairsFound: pairsFound(game),
    turnPlayerId: game.turnPlayerId,
    nextPlayerId: room.isGameStarted
      ? playerAfter(room, game.turnPlayerId)
      : null,
    lastMiss: game.phase === 'showing' ? [...game.up] : [],
    lastGame: game.lastGame,
  };
};

export { createState, pairsFound, playerAfter, toLobbyInfo, toRoomState };
export type { PairsState };
