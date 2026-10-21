import type {
  SnapGameSummary,
  SnapLobbyRoomInfo,
  SnapMiddle,
  SnapMiss,
  SnapPhase,
  SnapRoomState,
  SnapTake,
} from '../../models/types.js';
import { lobbyBasics, roomBasics } from '../../libs/rooms/seats.js';
import type { Room } from '../../libs/rooms/types.js';
import type { Card } from '../../../shared/snap.js';

/**
 * A wrong claim: until when its player may not claim, what they tapped, and
 * the middle card it was on.
 */
interface Lockout {
  endsAt: number;
  miss: SnapMiss;
  /** The number of the middle card the miss was about. */
  card: number;
}

/** Everything Snap knows that no other game would. */
interface SnapState {
  phase: SnapPhase;
  /** Cards this game has to take: 31 less the players dealt in. */
  cards: number;
  taken: number;
  /**
   * The cards still to be turned up, in order, under the middle card. Never
   * sent: only the middle card is everybody's.
   */
  pile: Card[];
  /** The middle card in play, or the last game's as it ended; null before. */
  middle: SnapMiddle | null;
  /**
   * Each seated player's own card, by player id. A player is sent only their
   * own. Between games, the last game's, so the results show yours.
   */
  hands: Map<string, Card>;
  lastTake: SnapTake | null;
  /** When the middle card in play was turned up; 0 outside `finding`. */
  cardSince: number;
  /** Each locked-out player's wrong claim, by player id. */
  lockouts: Map<string, Lockout>;
  lastGame: SnapGameSummary | null;
}

const createState = (): SnapState => ({
  phase: 'waiting',
  cards: 0,
  taken: 0,
  pile: [],
  middle: null,
  hands: new Map(),
  lastTake: null,
  cardSince: 0,
  lockouts: new Map(),
  lastGame: null,
});

/** The lockout `playerId` is under, if it has not run out. */
const lockoutOf = (
  game: SnapState,
  playerId: string,
  now = Date.now(),
): Lockout | null => {
  const lockout = game.lockouts.get(playerId);
  return lockout && lockout.endsAt > now ? lockout : null;
};

const toLobbyInfo = (room: Room<SnapState>): SnapLobbyRoomInfo => ({
  gameType: 'snap',
  ...lobbyBasics(room),
});

/**
 * The room as `viewerId` may see it: the same middle card for everybody, and
 * the viewer's own card and lockout, which nobody else is told about. A
 * spectator has no card.
 */
const toRoomState = (
  room: Room<SnapState>,
  viewerId: string,
): SnapRoomState => {
  const game = room.game;
  const lockout = lockoutOf(game, viewerId);
  const mine = room.playerList[viewerId] ? game.hands.get(viewerId) : undefined;

  return {
    ...toLobbyInfo(room),
    ...roomBasics(room),
    phase: game.phase,
    cards: game.cards,
    taken: game.taken,
    middle: game.middle
      ? { number: game.middle.number, symbols: [...game.middle.symbols] }
      : null,
    myCard: mine ? [...mine] : null,
    lastTake: game.lastTake,
    cardMs: game.phase === 'finding' ? Date.now() - game.cardSince : 0,
    lockedOutMs: lockout ? lockout.endsAt - Date.now() : 0,
    // The miss is about the card it was on: under the next, it says nothing.
    myMiss:
      lockout && lockout.card === game.middle?.number
        ? { ...lockout.miss }
        : null,
    lastGame: game.lastGame,
  };
};

export { createState, lockoutOf, toLobbyInfo, toRoomState };
export type { Lockout, SnapState };
