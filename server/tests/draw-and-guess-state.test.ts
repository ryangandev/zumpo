import { describe, expect, it } from 'vitest';
import type { DrawAndGuessState } from '../models/types.js';
import type { Room } from '../libs/rooms/types.js';
import {
  createState,
  toLobbyInfo,
  toRoomState,
} from '../socket/draw-and-guess/state.js';
import {
  buildWordHint,
  getRandomChoicesFromList,
  revealablePositions,
} from '../socket/draw-and-guess/words.js';

/**
 * The two builders that turn a room into what a client is allowed to see, and
 * the word helpers they lean on.
 *
 * These used to be `getDrawAndGuessLobbyRoomInfo` and
 * `getDrawAndGuessRoomState` in `libs/utils.ts`. They are the same functions
 * with the same job: the extraction moved them next to the game whose wire
 * format they define, and made them two members of the interface the room layer
 * calls rather than two exports anyone could reach for.
 */

const makeRoom = (
  overrides: Partial<Room<DrawAndGuessState>> = {},
  gameOverrides: Partial<DrawAndGuessState> = {},
): Room<DrawAndGuessState> => ({
  gameType: 'draw-and-guess',
  roomId: 'room-1',
  roomName: 'Room One',
  owner: { username: 'Owner', playerId: 'player-owner' },
  maxPlayers: 4,
  password: '',
  inviteKey: '',
  playerList: {
    'player-owner': { username: 'Owner', points: 0, isConnected: true },
  },
  spectators: {},
  isGameStarted: false,
  ready: new Set(),
  phaseEndsAt: 0,
  chat: { nextId: 1, messages: [] },
  ...overrides,
  game: { ...createState({ rounds: 2 }), ...gameOverrides },
});

describe('toLobbyInfo', () => {
  it('replaces the password with a boolean', () => {
    const locked = toLobbyInfo(makeRoom({ password: 'hunter2' }));

    expect(locked.hasPassword).toBe(true);
    expect(locked).not.toHaveProperty('password');
    expect(JSON.stringify(locked)).not.toContain('hunter2');
  });

  it('marks an unlocked room as having no password', () => {
    expect(toLobbyInfo(makeRoom()).hasPassword).toBe(false);
  });

  it('carries no player list, so the lobby cannot see inside a room', () => {
    expect(toLobbyInfo(makeRoom())).not.toHaveProperty('playerList');
  });

  it('says which game it is, so one lobby cannot show another’s rooms', () => {
    expect(toLobbyInfo(makeRoom()).gameType).toBe('draw-and-guess');
  });

  it('carries the round count, which is the game’s own setting', () => {
    expect(toLobbyInfo(makeRoom({}, { rounds: 4 })).rounds).toBe(4);
  });
});

describe('toRoomState', () => {
  const DRAWER = 'player-drawer';
  const GUESSER = 'player-guesser';

  const inPhase = (
    phase: DrawAndGuessState['phase'],
    gameOverrides: Partial<DrawAndGuessState> = {},
  ) =>
    makeRoom(
      { isGameStarted: phase !== 'waiting' },
      {
        phase,
        currentDrawer: DRAWER,
        word: 'giraffe',
        hint: phase === 'drawing' || phase === 'reveal' ? '_______' : '',
        wordChoices: ['giraffe', 'kettle', 'anchor'],
        ...gameOverrides,
      },
    );

  it('shows the choices to the drawer alone while the word is chosen', () => {
    const room = inPhase('choosing', { word: '' });

    expect(toRoomState(room, DRAWER).wordChoices).toEqual([
      'giraffe',
      'kettle',
      'anchor',
    ]);

    const guesser = toRoomState(room, GUESSER);
    // Omitted rather than blanked, so nothing about the choices travels.
    expect(guesser).not.toHaveProperty('wordChoices');
    expect(guesser).not.toHaveProperty('word');
    expect(JSON.stringify(guesser)).not.toContain('giraffe');
  });

  it('shows the word to the drawer alone while it is drawn', () => {
    const room = inPhase('drawing');

    const drawer = toRoomState(room, DRAWER);
    expect(drawer.word).toBe('giraffe');
    expect(drawer).not.toHaveProperty('wordChoices');

    const guesser = toRoomState(room, GUESSER);
    expect(guesser).not.toHaveProperty('word');
    expect(guesser).not.toHaveProperty('wordChoices');
    expect(guesser.hint).toBe('_______');
    expect(JSON.stringify(guesser)).not.toContain('giraffe');
  });

  it('reveals the word to everybody once the guessing is over', () => {
    const room = inPhase('reveal');

    expect(toRoomState(room, GUESSER).word).toBe('giraffe');
    expect(toRoomState(room, DRAWER).word).toBe('giraffe');
    expect(toRoomState(room, GUESSER)).not.toHaveProperty('wordChoices');
  });

  it('shows no word to anybody between games', () => {
    const room = inPhase('waiting', { word: '', wordChoices: [] });

    for (const viewer of [DRAWER, GUESSER]) {
      expect(toRoomState(room, viewer)).not.toHaveProperty('word');
      expect(toRoomState(room, viewer)).not.toHaveProperty('wordChoices');
    }
  });

  it('carries the phase and the turn it is in', () => {
    const state = toRoomState(
      inPhase('drawing', { currentRound: 2, turn: 5, wordAutoPicked: true }),
      GUESSER,
    );

    expect(state).toMatchObject({
      phase: 'drawing',
      currentRound: 2,
      turn: 5,
      currentDrawer: DRAWER,
      wordAutoPicked: true,
    });
  });

  it('never carries the room password', () => {
    const state = toRoomState(makeRoom({ password: 'letmein' }), GUESSER);

    expect(state).not.toHaveProperty('password');
    expect(state.hasPassword).toBe(true);
    expect(JSON.stringify(state)).not.toContain('letmein');
  });

  /*
   * This used to be a `receivedPointsThisTurn` boolean on every PlayerInfo,
   * which put a field only a drawing phase means anything to on the shape
   * every game shares. It is the game's state now, and reaches the wire as a
   * list of player ids.
   */
  it('reports who has already scored, as ids rather than a flag per player', () => {
    const state = toRoomState(
      makeRoom({}, { scoredThisTurn: new Set(['player-owner']) }),
      GUESSER,
    );

    expect(state.scoredThisTurn).toEqual(['player-owner']);
    expect(JSON.parse(JSON.stringify(state)).scoredThisTurn).toEqual([
      'player-owner',
    ]);
    expect(state.playerList['player-owner']).not.toHaveProperty(
      'receivedPointsThisTurn',
    );
  });

  it('sends what each player gained this turn as an object, which survives serialization', () => {
    const state = toRoomState(
      makeRoom(
        {},
        {
          turnPoints: new Map([
            [DRAWER, 50],
            [GUESSER, 120],
          ]),
        },
      ),
      GUESSER,
    );

    expect(JSON.parse(JSON.stringify(state)).turnPoints).toEqual({
      [DRAWER]: 50,
      [GUESSER]: 120,
    });
  });

  it('keeps the drawer queue to itself', () => {
    const state = toRoomState(
      makeRoom({}, { drawerQueue: new Set(['a', 'b']) }),
      GUESSER,
    );

    expect(state).not.toHaveProperty('drawerQueue');
  });

  it('carries the live phase clock as a duration', () => {
    const state = toRoomState(
      makeRoom({ phaseEndsAt: Date.now() + 10_000 }),
      GUESSER,
    );

    expect(state.phaseEndsInMs).toBeGreaterThan(9000);
    expect(state.phaseEndsInMs).toBeLessThanOrEqual(10_000);
  });

  it('carries the drawer hold as a duration, and zero when there is none', () => {
    expect(toRoomState(makeRoom(), GUESSER).drawerHoldEndsInMs).toBe(0);

    const held = toRoomState(
      makeRoom({}, { drawerHoldEndsAt: Date.now() + 5000 }),
      GUESSER,
    );
    expect(held.drawerHoldEndsInMs).toBeGreaterThan(4000);
    expect(held.drawerHoldEndsInMs).toBeLessThanOrEqual(5000);
  });

  it('carries the last game until the next one replaces it', () => {
    expect(toRoomState(makeRoom(), GUESSER).lastGame).toBeNull();

    const lastGame = {
      endedEarly: false,
      rounds: 2,
      turns: 4,
      wordCategory: 'Animals' as const,
      standings: [{ playerId: DRAWER, username: 'Dee', points: 300 }],
    };
    expect(toRoomState(makeRoom({}, { lastGame }), GUESSER).lastGame).toEqual(
      lastGame,
    );
  });
});

describe('getRandomChoicesFromList', () => {
  it('returns the requested number of distinct entries', () => {
    const choices = getRandomChoicesFromList(['a', 'b', 'c', 'd', 'e'], 3);

    expect(choices).toHaveLength(3);
    expect(new Set(choices).size).toBe(3);
  });

  // Asking for more distinct choices than exist used to spin forever inside
  // a while loop, taking the whole single-threaded server with it.
  it('terminates when asked for more choices than the list holds', () => {
    expect(getRandomChoicesFromList(['a', 'b'], 5)).toHaveLength(2);
    expect(getRandomChoicesFromList([], 3)).toEqual([]);
  });
});

describe('buildWordHint', () => {
  it('hides every visible character but keeps the spacing', () => {
    expect(buildWordHint('ice cream')).toBe('___ _____');
  });

  it('fills in the positions the clock has given away', () => {
    expect(buildWordHint('ice cream', new Set([0, 4]))).toBe('i__ c____');
  });

  it('offers every position but the spaces for revealing', () => {
    expect(revealablePositions('ice cream')).toEqual([0, 1, 2, 4, 5, 6, 7, 8]);
  });
});
