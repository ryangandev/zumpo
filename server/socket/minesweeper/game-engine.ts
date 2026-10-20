import { SEATS } from '../../../shared/seats.js';
import type {
  MinesweeperPickResult,
  MinesweeperSettings,
} from '../../models/types.js';
import { seatCount } from '../../libs/rooms/seats.js';
import type { GameContext, Room } from '../../libs/rooms/types.js';
import { gameOverNotice, resetPoints, standingsOf } from '../../libs/utils.js';
import {
  minesweeperDurationsInSeconds as defaultDurations,
  type MinesweeperDurationsInSeconds,
} from '../../libs/game-clock.js';
import {
  createBoard,
  hiddenIndexes,
  isHidden,
  isResolved,
  markHitMine,
  publicView,
  revealFrom,
} from './board.js';
import { mineProbabilities } from './probability.js';
import { pointsForPick } from './scoring.js';
import type { MinesweeperState } from './state.js';
import { itemAt } from '../../../shared/list.js';

type MinesweeperRoom = Room<MinesweeperState>;

/**
 * The safest cell on the board, for a player who ran out of time.
 *
 * It reuses the same risk numbers everyone else was scored against, so an
 * auto-play is the move a cautious player would have made - and it forfeits the
 * base points, so it is never better than turning up.
 */
const safestHiddenCell = (room: MinesweeperRoom): number | undefined => {
  const hidden = hiddenIndexes(room.game.board);
  if (hidden.length === 0) return undefined;

  let safest = itemAt(hidden, 0);
  for (const index of hidden) {
    if ((room.game.risk[index] ?? 1) < (room.game.risk[safest] ?? 1)) {
      safest = index;
    }
  }
  return safest;
};

/**
 * Owns the round loop.
 *
 * A round is one window in which **everybody picks at once**, rather than a
 * turn that goes round the table. With up to eight seats, strictly sequential
 * turns would mean waiting two minutes between clicks; picking simultaneously
 * also means every player faces exactly the same board with exactly the same
 * information, which is the cleanest possible answer to "is this fair".
 *
 * What it costs is the one-at-a-time tension, and what it buys back is a
 * mind-game: everybody is choosing blind against everybody else, and picking
 * the obviously-good cell means sharing it.
 */
const createMinesweeperGameEngine = (
  ctx: GameContext,
  durations: MinesweeperDurationsInSeconds = defaultDurations,
) => {
  const roomOf = (roomId: string): MinesweeperRoom | undefined =>
    ctx.rooms.ofType<MinesweeperState>(roomId, 'minesweeper');

  const startGame = (room: MinesweeperRoom) => {
    // A fresh minefield every game, so a room that plays twice is not playing
    // the same board with the answers already known.
    room.game.board = createBoard(room.game.difficulty);
    room.game.round = 0;
    room.game.picks.clear();
    room.game.lastRound = [];
    room.game.lastGame = null;
    room.playerList = resetPoints(room.playerList);
    room.isGameStarted = true;

    console.log(
      `Minesweeper started in room ${room.roomId} on ${room.game.difficulty}.`,
    );

    ctx.rooms.announce(room.roomId, 'system', {
      type: 'ms:started',
      mines: room.game.board.totalMines,
      width: room.game.board.width,
      height: room.game.board.height,
    });
    ctx.rooms.emitLobby('minesweeper');

    beginRound(room);
  };

  const beginRound = (room: MinesweeperRoom) => {
    const game = room.game;
    game.phase = 'picking';
    game.round += 1;
    game.picks.clear();

    // Computed once, from the public board, before anybody has picked. This is
    // the number every score in this round is made of.
    game.risk = mineProbabilities({
      width: game.board.width,
      height: game.board.height,
      totalMines: game.board.totalMines,
      cells: publicView(game.board),
    });

    ctx.rooms.startPhase(room, durations.round, () => resolveRound(room));
    ctx.rooms.emitState(room);
  };

  /**
   * A player has chosen a cell. One pick each, and it is final - you cannot
   * watch who locks in and then change your mind, which is what keeps the
   * simultaneous window honest.
   */
  const pick = (roomId: string, playerId: string, index: number) => {
    const room = roomOf(roomId);
    if (!room) return;

    const game = room.game;
    if (!room.isGameStarted) return;
    if (game.phase !== 'picking') return; // between rounds
    if (!room.playerList[playerId]) return; // not in this room
    if (game.picks.has(playerId)) return; // already committed
    if (index < 0 || index >= game.board.width * game.board.height) return;
    if (!isHidden(game.board, index)) return; // already resolved

    game.picks.set(playerId, index);

    ctx.rooms.emitState(room);

    maybeResolveEarly(room);
  };

  /**
   * Once everybody who *could* pick has, the rest of the window is dead time.
   *
   * Players inside their reconnect grace are not waited for: they cannot pick
   * while they are away, and holding the round open for them would cost the
   * room the whole window.
   */
  const maybeResolveEarly = (room: MinesweeperRoom) => {
    if (!room.isGameStarted || room.game.phase !== 'picking') return;

    const stillChoosing = Object.entries(room.playerList).filter(
      ([playerId, player]) =>
        player.isConnected && !room.game.picks.has(playerId),
    );
    if (stillChoosing.length > 0) return;

    resolveRound(room);
  };

  const resolveRound = (room: MinesweeperRoom) => {
    ctx.rooms.stopPhase(room);
    const game = room.game;
    if (!room.isGameStarted) return;

    // Anybody present who did not choose gets the safest cell going.
    const autoPlayed = new Set<string>();
    for (const [playerId, player] of Object.entries(room.playerList)) {
      if (!player.isConnected || game.picks.has(playerId)) continue;
      const fallback = safestHiddenCell(room);
      if (fallback === undefined) break;
      game.picks.set(playerId, fallback);
      autoPlayed.add(playerId);
    }

    // How many players landed on each cell, which is what splits a reward.
    const pickedBy = new Map<number, string[]>();
    for (const [playerId, index] of game.picks) {
      const others = pickedBy.get(index);
      if (others) others.push(playerId);
      else pickedBy.set(index, [playerId]);
    }

    // Scored against the board as it was, before a single reveal is applied.
    const results: MinesweeperPickResult[] = [];
    for (const [playerId, index] of game.picks) {
      const player = room.playerList[playerId];
      if (!player) continue;

      const risk = game.risk[index] ?? 0;
      const hitMine = itemAt(game.board.mines, index);
      const sharedWith = pickedBy.get(index)?.length ?? 1;
      const points = pointsForPick({
        risk,
        hitMine,
        sharedWith,
        autoPlayed: autoPlayed.has(playerId),
      });

      player.points += points;
      results.push({
        playerId,
        username: player.username,
        index,
        risk,
        hitMine,
        points,
        sharedWith,
        autoPlayed: autoPlayed.has(playerId),
      });
    }

    // Only now does the board move. A cell somebody else's cascade would have
    // opened still pays what it was worth when they chose it.
    for (const index of pickedBy.keys()) {
      if (game.board.mines[index]) markHitMine(game.board, index);
      else revealFrom(game.board, index);
    }

    game.lastRound = results;
    game.picks.clear();
    game.phase = 'reveal';
    const solved = isResolved(game.board);
    ctx.rooms.startPhase(room, durations.reveal, () =>
      solved ? endGame(room, { endedEarly: false }) : beginRound(room),
    );
    ctx.rooms.emitState(room);

    for (const result of results) {
      if (!result.hitMine) continue;
      // U+2212, a true minus: a hyphen reads as a dash beside a number.
      ctx.rooms.announce(room.roomId, 'alert', {
        type: 'ms:mine',
        name: result.username,
        risk: result.risk,
        points: result.points,
      });
    }
  };

  /**
   * The board and the last round stay as they are: the results screen shows
   * the final board and what its last round came to, and so does a refresh.
   */
  const endGame = (
    room: MinesweeperRoom,
    { endedEarly }: { endedEarly: boolean },
  ) => {
    ctx.rooms.stopPhase(room);
    const game = room.game;

    const standings = standingsOf(room.playerList);

    game.lastGame = {
      endedEarly,
      standings,
      difficulty: game.difficulty,
      // A round still open for picks when the game stopped was never played.
      rounds: game.phase === 'picking' ? game.round - 1 : game.round,
    };

    room.isGameStarted = false;
    game.phase = 'waiting';
    game.round = 0;
    game.picks.clear();

    ctx.rooms.emitState(room);
    ctx.rooms.announce(room.roomId, 'system', gameOverNotice(standings));
    ctx.rooms.emitLobby('minesweeper');
  };

  /** Called after the seat is already gone from `playerList`. */
  const handlePlayerDeparture = (room: MinesweeperRoom, playerId: string) => {
    room.game.picks.delete(playerId);

    if (!room.isGameStarted) return;

    if (seatCount(room) < SEATS['minesweeper'].min) {
      ctx.rooms.announce(room.roomId, 'alert', { type: 'game:interrupted' });
      endGame(room, { endedEarly: true });
      return;
    }

    // The round may have been waiting only on them.
    maybeResolveEarly(room);
  };

  /**
   * A connection dropped. There is no turn to hold here - the round belongs to
   * everybody - so the only thing to do is stop waiting for a player who cannot
   * answer. Their seat and score are held by the room layer as usual.
   */
  const handleDisconnect = (room: MinesweeperRoom) => {
    if (!room.isGameStarted) return;
    maybeResolveEarly(room);
  };

  return {
    startGame,
    pick,
    handlePlayerDeparture,
    handleDisconnect,
    /** Exposed for tests: what the engine would pick for an absent player. */
    safestHiddenCell,
  };
};

type MinesweeperGameEngine = ReturnType<typeof createMinesweeperGameEngine>;

export { createMinesweeperGameEngine };
export type { MinesweeperGameEngine, MinesweeperRoom, MinesweeperSettings };
