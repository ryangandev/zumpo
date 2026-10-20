import type {
  TriosGameSummary,
  TriosLobbyRoomInfo,
  TriosPhase,
  TriosRoomState,
  TriosSettings,
  TriosTrio,
} from '../../models/types.js';
import { lobbyBasics, roomBasics } from '../../libs/rooms/seats.js';
import type { Room } from '../../libs/rooms/types.js';
import type { Deal } from '../../../shared/trios.js';

/** A wrong claim: until when its player may not claim, and what they picked. */
interface Lockout {
  endsAt: number;
  cards: number[];
}

/** Everything Trios knows that no other game would. */
interface TriosState {
  /** Trios a game has: 10 or 20. */
  trios: number;
  phase: TriosPhase;
  /**
   * The table and the deck under it. The table is everybody's; the deck's
   * order never leaves the server. Between games, the last table as it ended;
   * empty before the first.
   */
  deal: Deal;
  found: number;
  lastTrio: TriosTrio | null;
  /** The places the hints have marked, in the order they were given. */
  hint: number[];
  /** When everybody began looking at the table in play; 0 outside `finding`. */
  findingSince: number;
  /**
   * The trio this table's hints point at, by place, shuffled; null until its
   * first hint. Never sent: the hints give it away one card at a time.
   */
  hintPlan: number[] | null;
  /** Each locked-out player's wrong claim, by player id. */
  lockouts: Map<string, Lockout>;
  lastGame: TriosGameSummary | null;
}

const createState = (settings: TriosSettings): TriosState => ({
  trios: settings.trios,
  phase: 'waiting',
  deal: { table: [], deck: [] },
  found: 0,
  lastTrio: null,
  hint: [],
  findingSince: 0,
  hintPlan: null,
  lockouts: new Map(),
  lastGame: null,
});

/** The lockout `playerId` is under, if it has not run out. */
const lockoutOf = (
  game: TriosState,
  playerId: string,
  now = Date.now(),
): Lockout | null => {
  const lockout = game.lockouts.get(playerId);
  return lockout && lockout.endsAt > now ? lockout : null;
};

const toLobbyInfo = (room: Room<TriosState>): TriosLobbyRoomInfo => ({
  gameType: 'trios',
  ...lobbyBasics(room),
  trios: room.game.trios,
});

/**
 * The room as `viewerId` may see it: the same table for everybody, and the
 * viewer's own lockout, which nobody else is told about.
 */
const toRoomState = (
  room: Room<TriosState>,
  viewerId: string,
): TriosRoomState => {
  const game = room.game;
  const lockout = lockoutOf(game, viewerId);

  return {
    ...toLobbyInfo(room),
    ...roomBasics(room),
    phase: game.phase,
    found: game.found,
    table: [...game.deal.table],
    deckLeft: game.deal.deck.length,
    lastTrio: game.lastTrio,
    hint: [...game.hint],
    searchingMs: game.phase === 'finding' ? Date.now() - game.findingSince : 0,
    lockedOutMs: lockout ? lockout.endsAt - Date.now() : 0,
    myMiss: lockout ? [...lockout.cards] : [],
    lastGame: game.lastGame,
  };
};

export { createState, lockoutOf, toLobbyInfo, toRoomState };
export type { Lockout, TriosState };
