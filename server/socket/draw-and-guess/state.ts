import type {
  DrawAndGuessLobbyRoomInfo,
  DrawAndGuessRoomState,
  DrawAndGuessSettings,
  DrawAndGuessState,
} from '../../models/types.js';
import { lobbyBasics, roomBasics } from '../../libs/rooms/seats.js';
import type { Room } from '../../libs/rooms/types.js';
import { createRoomCanvas } from '../../libs/drawing/canvas.js';

/** A room that has been created but not yet played in. */
const createState = (settings: DrawAndGuessSettings): DrawAndGuessState => ({
  rounds: settings.rounds,
  phase: 'waiting',
  currentRound: 0,
  turn: 0,
  currentDrawer: '',
  word: '',
  hint: '',
  wordChoices: [],
  wordAutoPicked: false,
  drawerQueue: new Set(),
  wordCategory: '',
  scoredThisTurn: new Set(),
  closeThisTurn: new Set(),
  turnPoints: new Map(),
  roundPoints: new Map(),
  lastRound: null,
  drawerHoldEndsAt: 0,
  lastGame: null,
  canvas: createRoomCanvas(),
});

/**
 * The room summary shown in the lobby. This payload goes to everyone watching
 * the Draw & Guess lobby, so it carries `hasPassword` rather than the password
 * itself.
 */
const toLobbyInfo = (
  room: Room<DrawAndGuessState>,
): DrawAndGuessLobbyRoomInfo => ({
  gameType: 'draw-and-guess',
  ...lobbyBasics(room),
  rounds: room.game.rounds,
});

/**
 * The room as one player may see it.
 *
 * The word is the secret, and who may know it depends on the phase and on who
 * is looking:
 *
 * - **choosing:** the drawer is sent the three `wordChoices`; nobody else is
 *   sent anything about them.
 * - **drawing:** the drawer is sent the `word`; everybody else the `hint`.
 * - **reveal:** everybody is sent the `word`.
 *
 * Fields a viewer may not see are left out of their snapshot altogether, so
 * nothing about the word can leak through a value that was merely blanked.
 */
const toRoomState = (
  room: Room<DrawAndGuessState>,
  viewerId: string,
): DrawAndGuessRoomState => {
  const game = room.game;
  const isDrawer = viewerId !== '' && game.currentDrawer === viewerId;

  const roomState: DrawAndGuessRoomState = {
    ...toLobbyInfo(room),
    ...roomBasics(room),
    phase: game.phase,
    currentRound: game.currentRound,
    turn: game.turn,
    currentDrawer: game.currentDrawer,
    wordCategory: game.wordCategory,
    hint: game.hint,
    wordAutoPicked: game.wordAutoPicked,
    scoredThisTurn: [...game.scoredThisTurn],
    turnPoints: Object.fromEntries(game.turnPoints),
    drawerHoldEndsInMs: Math.max(0, game.drawerHoldEndsAt - Date.now()),
    lastRound: game.lastRound,
    lastGame: game.lastGame,
  };

  if (game.phase === 'choosing' && isDrawer) {
    roomState.wordChoices = [...game.wordChoices];
  }
  if (
    (game.phase === 'drawing' && isDrawer) ||
    (game.phase === 'reveal' && game.word !== '')
  ) {
    roomState.word = game.word;
  }

  return roomState;
};

export { createState, toLobbyInfo, toRoomState };
