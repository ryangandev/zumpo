import type { AnyLobbyRoomInfo } from '../../../shared/wire-types';
import { levelsFor } from '../../../shared/hush';
import { DECK_SIZE as SNAP_DECK } from '../../../shared/snap';
import type { Messages } from '../i18n';

/** The setting a room was made with: "2 rounds", "Small 9 × 9", "10 hands",
 * "Large 6 × 6", "20 trios", "31 cards", "3 dice each", "7 levels",
 * "60s to draw", "3 words". */
export function roomSetting(room: AnyLobbyRoomInfo, m: Messages): string {
  switch (room.gameType) {
    case 'draw-and-guess':
      return m.games.counts['draw-and-guess'](room.rounds);
    case 'minesweeper':
      return m.minesweeper.boardName(room.difficulty);
    case 'make-24':
      return m.games.counts['make-24'](room.hands);
    case 'pairs':
      return m.pairs.boardName(room.board);
    case 'trios':
      return m.games.counts.trios(room.trios);
    case 'snap':
      // Nothing is chosen; the deck is always the same.
      return m.games.counts.snap(SNAP_DECK);
    case 'liars-dice':
      return m.games.counts['liars-dice'](room.dicePerPlayer);
    case 'hush':
      // Nothing is chosen; the level count follows who is seated.
      return m.games.counts.hush(levelsFor(room.currentPlayerCount));
    case 'doodle-chain':
      return m.games.counts['doodle-chain'](room.drawingSeconds);
    case 'daily-word':
      return m.games.counts['daily-word'](room.rounds);
  }
}
