import { SEATS } from '../../../shared/seats';
import type { GameType } from '../../../shared/wire-types';
import type { Messages } from '../i18n';

/**
 * What a game has you do; every game has exactly one, and the home page sorts
 * and filters by it (docs/design.md).
 */
export type GameKind = 'party' | 'puzzles' | 'spot-and-remember';

/** The kinds, alphabetically; what each says of itself is in the catalog. */
export const GAME_KINDS: readonly GameKind[] = [
  'party',
  'puzzles',
  'spot-and-remember',
];

/**
 * What every page knows about a game outside its room. Everything a player
 * reads about it, its name included, is `m.games.of[type]` in the language
 * catalog (docs/architecture.md#languages).
 */
export interface GameInfo {
  type: GameType;
  kind: GameKind;
  /** The game's surface colour on the home, games and rules pages. */
  tone: 'peach' | 'blue' | 'lime' | 'sand';
  /** The fewest players it starts with. */
  minPlayers: number;
  /** The most seats a room may have. */
  maxPlayers: number;
  /** A game that can be played on your own, without a room. */
  solo: boolean;
}

const ENTRIES: readonly Omit<GameInfo, 'minPlayers' | 'maxPlayers'>[] = [
  {
    type: 'draw-and-guess',
    kind: 'party',
    tone: 'peach',
    solo: false,
  },
  {
    type: 'minesweeper',
    kind: 'puzzles',
    tone: 'blue',
    solo: true,
  },
  { type: 'make-24', kind: 'puzzles', tone: 'lime', solo: true },
  {
    type: 'pairs',
    kind: 'spot-and-remember',
    tone: 'sand',
    solo: true,
  },
  {
    type: 'trios',
    kind: 'spot-and-remember',
    tone: 'peach',
    solo: true,
  },
  {
    type: 'liars-dice',
    kind: 'party',
    tone: 'lime',
    solo: true,
  },
  { type: 'hush', kind: 'party', tone: 'sand', solo: false },
  { type: 'doodle-chain', kind: 'party', tone: 'blue', solo: false },
  {
    type: 'daily-word',
    kind: 'puzzles',
    tone: 'blue',
    solo: true,
  },
];

export const GAMES: readonly GameInfo[] = ENTRIES.map((game) => ({
  ...game,
  minPlayers: SEATS[game.type].min,
  maxPlayers: SEATS[game.type].max,
}));

/** A kind's games, alphabetically by their names in the player's language. */
export function gamesOfKind(
  kind: GameKind,
  m: Messages,
  locale: string,
): GameInfo[] {
  return GAMES.filter((game) => game.kind === kind).toSorted((a, b) =>
    m.games.of[a.type].name.localeCompare(m.games.of[b.type].name, locale),
  );
}

export function isGameKind(value: string | null): value is GameKind {
  return GAME_KINDS.some((kind) => kind === value);
}

export function gameInfo(type: GameType): GameInfo {
  const game = GAMES.find((candidate) => candidate.type === type);
  if (!game) throw new Error(`Unknown game ${type}`);
  return game;
}

export function isGameType(value: string | undefined): value is GameType {
  return GAMES.some((game) => game.type === value);
}

/** A game on your own, which never reaches the server. */
export const soloPath = (type: GameType) => `/games/${type}/solo`;

/** The game's page: what it is, its ways in, its open rooms and its rules. */
export const gamePath = (type: GameType) => `/games/${type}`;
export const createRoomPath = (type: GameType) => `/games/${type}/new`;
export const roomPath = (type: GameType, roomId: string) =>
  `/games/${type}/rooms/${roomId}`;

/** "3 points", "1 pair": a score in its game's own unit. */
export function scoreOf(
  m: Messages,
  gameType: GameType,
  score: number,
): string {
  return m.games.of[gameType].score(score);
}
