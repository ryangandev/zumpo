import type {
  HushDiscard,
  HushGameSummary,
  HushLevelRecord,
  HushLobbyRoomInfo,
  HushMistake,
  HushPhase,
  HushPlay,
  HushRoomState,
  HushSeat,
  HushSettings,
} from '../../models/types.js';
import { lobbyBasics, roomBasics, seatCount } from '../../libs/rooms/seats.js';
import type { Room } from '../../libs/rooms/types.js';
import { getRemainingPhaseMs } from '../../libs/utils.js';
import { levelsFor, START_LIVES } from '../../../shared/hush.js';

/** Everything Hush knows that no other game would. */
interface HushState {
  phase: HushPhase;
  /** The level being played, from 1; 0 between games. */
  level: number;
  /** Fixed when a game starts, by the players seated then. */
  levels: number;
  lives: number;
  /**
   * Every player's cards, lowest first, keyed by player id. Never leaves the
   * server, except each hand to its own player and, when a game ends, what is
   * still held.
   */
  hands: Record<string, number[]>;
  /** Who has pressed Ready for the coming level. */
  ready: Set<string>;
  /** This level's pile, lowest first; between games, the last as it ended. */
  pile: HushPlay[];
  discards: HushDiscard[];
  /** Lives this level has cost so far. */
  livesLost: number;
  lastMistake: HushMistake | null;
  lastLevel: HushLevelRecord | null;
  history: HushLevelRecord[];
  /**
   * When each dropped player's seat runs out, in epoch ms: a pause shows it as
   * its clock.
   */
  seatEndsAt: Map<string, number>;
  /**
   * While a level waits for the away, when the last of their seats goes, in
   * epoch ms; 0 otherwise. The room's clock stays stopped, since nothing the
   * game times ends a pause.
   */
  pausedUntil: number;
  lastGame: HushGameSummary | null;
}

const createState = (_settings: HushSettings): HushState => ({
  phase: 'waiting',
  level: 0,
  levels: 0,
  lives: START_LIVES,
  hands: {},
  ready: new Set(),
  pile: [],
  discards: [],
  livesLost: 0,
  lastMistake: null,
  lastLevel: null,
  history: [],
  seatEndsAt: new Map(),
  pausedUntil: 0,
  lastGame: null,
});

const toLobbyInfo = (room: Room<HushState>): HushLobbyRoomInfo => ({
  gameType: 'hush',
  ...lobbyBasics(room),
});

/**
 * The room as `viewerId` may see it: their own cards, and only how many
 * everybody else holds. What was played or discarded is everybody's.
 */
const toRoomState = (
  room: Room<HushState>,
  viewerId: string,
): HushRoomState => {
  const game = room.game;
  const table: Record<string, HushSeat> = Object.fromEntries(
    Object.keys(room.playerList).map((playerId) => [
      playerId,
      {
        held: game.hands[playerId]?.length ?? 0,
        ready: game.ready.has(playerId),
      },
    ]),
  );

  return {
    ...toLobbyInfo(room),
    ...roomBasics(room),
    phaseEndsInMs:
      game.phase === 'paused'
        ? Math.max(0, game.pausedUntil - Date.now())
        : getRemainingPhaseMs(room),
    phase: game.phase,
    level: game.level,
    levels: room.isGameStarted ? game.levels : levelsFor(seatCount(room)),
    lives: game.lives,
    hand: [...(game.hands[viewerId] ?? [])],
    table,
    pile: game.pile.map((play) => ({ ...play })),
    discards: game.discards.map((discard) => ({ ...discard })),
    lastMistake: game.phase === 'mistake' ? game.lastMistake : null,
    lastLevel: game.phase === 'cleared' ? game.lastLevel : null,
    lastGame: game.lastGame,
  };
};

export { createState, toLobbyInfo, toRoomState };
export type { HushState };
