import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  ChatMessage,
  DrawAndGuessRoomState,
} from '../../../shared/wire-types';
import { createReplayGuard } from '../audio';
import { AudioEngine } from '../audio/engine';
import type { PlayOptions, SoundSpec } from '../audio/types';
import { roomPath } from '../games/catalog';
import { roomSoundRules, type RoomSoundView } from '../room/sounds';
import { drawAndGuessState, ME } from '../tests/fixtures';
import { FakeSocket } from '../tests/fake-socket';
import { renderApp } from '../tests/render-app';
import {
  actingDeadline,
  deriveCloseGuessSounds,
  deriveDrawAndGuessSounds,
  DRAW_AND_GUESS_SOUNDS,
  isNewDrawAndGuessGame,
  sameChat,
  turnOf as nameOf,
} from './sounds';

const MAYA = 'p2';
const LEO = 'p3';
const WATCHER = 'p9';

const seat = (username: string, points = 0, isConnected = true) => ({
  username,
  points,
  isConnected,
});

/** Ryan, Maya and Leo at the table, and somebody watching. */
const table = {
  playerList: {
    [ME]: seat('Ryan'),
    [MAYA]: seat('Maya'),
    [LEO]: seat('Leo'),
  },
  spectators: { [WATCHER]: seat('Sam') },
};

/** Turn `turn` of round 1, drawn by `drawer`. */
const turnOf = (
  turn: number,
  drawer: string,
  overrides: Partial<DrawAndGuessRoomState> = {},
) =>
  drawAndGuessState({
    ...table,
    isGameStarted: true,
    currentRound: 1,
    turn,
    currentDrawer: drawer,
    wordCategory: 'Animals',
    phase: 'drawing',
    hint: '______',
    phaseEndsInMs: 60_000,
    ...overrides,
  });

/** What one change plays for `viewer`, guard aside: each sound and its key. */
const heard = (
  prev: DrawAndGuessRoomState,
  next: DrawAndGuessRoomState,
  viewer = ME,
) => deriveDrawAndGuessSounds(viewer)(prev, next);

const sounds = (
  prev: DrawAndGuessRoomState,
  next: DrawAndGuessRoomState,
  viewer = ME,
) => heard(prev, next, viewer).map((e) => e.sound);

/** A snapshot as `RoomLayout` hears it: whose go it is, on which connection. */
const viewOf = (
  state: DrawAndGuessRoomState,
  viewer = ME,
  connection = 1,
): RoomSoundView => ({
  state,
  // The drawer's go, as the room names it for them.
  turn:
    state.isGameStarted &&
    state.currentDrawer === viewer &&
    state.phase !== 'reveal'
      ? nameOf(state)
      : null,
  connection,
  readied: 0,
});

/**
 * The room's one guard with Draw & Guess's sounds in it, as `RoomLayout`
 * keeps it; `observe` takes a snapshot and its connection.
 */
const guard = (viewer = ME) => {
  const rules = roomSoundRules(viewer, DRAW_AND_GUESS_SOUNDS);
  const inner = createReplayGuard(rules.derive, rules);
  return {
    observe: (state: DrawAndGuessRoomState, connection = 1, resync = false) =>
      inner.observe(viewOf(state, viewer, connection), resync),
  };
};

describe('the Draw & Guess sounds', () => {
  const choosing = turnOf(1, ME, { phase: 'choosing', hint: '' });

  it('stamps the drawer’s word, and says when the clock picked it', () => {
    const drawing = turnOf(1, ME, { word: 'Turtle' });
    expect(heard(choosing, drawing)).toEqual([
      { sound: 'room-stamp', key: 'chose:1.1' },
    ]);
    expect(heard(choosing, { ...drawing, wordAutoPicked: true })).toEqual([
      { sound: 'room-time-up', key: 'time-up:1.1:choosing' },
    ]);
    // Only the drawer hears their word chosen.
    expect(heard(choosing, drawing, MAYA)).toEqual([]);
    expect(heard(choosing, drawing, WATCHER)).toEqual([]);
  });

  it('dings the guesser’s own guess and steps up for everybody else’s', () => {
    const drawing = turnOf(1, ME);
    const maya = turnOf(1, ME, { scoredThisTurn: [MAYA] });
    expect(heard(drawing, maya, MAYA)).toEqual([
      { sound: 'draw-and-guess-correct', key: 'correct:1.1' },
    ]);
    for (const viewer of [ME, LEO, WATCHER]) {
      expect(heard(drawing, maya, viewer)).toEqual([
        {
          sound: 'room-someone-scored',
          key: `scored:1.1:${MAYA}`,
          other: true,
          variant: 1,
        },
      ]);
    }
    // A second guesser is a step higher.
    const four = drawAndGuessState({
      ...maya,
      playerList: { ...table.playerList, p4: seat('Ana') },
    });
    expect(heard(four, { ...four, scoredThisTurn: [MAYA, LEO] }, 'p4')).toEqual(
      [
        {
          sound: 'room-someone-scored',
          key: `scored:1.1:${LEO}`,
          other: true,
          variant: 2,
        },
      ],
    );
  });

  it('hears the last guess and the end of the turn as one sound', () => {
    const maya = turnOf(1, ME, { scoredThisTurn: [MAYA] });
    const all = turnOf(1, ME, {
      phase: 'reveal',
      word: 'Turtle',
      scoredThisTurn: [MAYA, LEO],
    });
    expect(sounds(maya, all, LEO)).toEqual(['draw-and-guess-correct']);
    for (const viewer of [ME, MAYA, WATCHER]) {
      expect(heard(maya, all, viewer)).toEqual([
        { sound: 'draw-and-guess-all-guessed', key: 'end:1.1' },
      ]);
    }
  });

  it('ends a turn the clock ran out on by who is still guessing', () => {
    const drawing = turnOf(1, ME, { scoredThisTurn: [MAYA] });
    const reveal = { ...drawing, phase: 'reveal' as const, word: 'Turtle' };
    expect(sounds(drawing, reveal, LEO)).toEqual(['room-time-up']);
    expect(sounds(drawing, reveal, ME)).toEqual(['room-reveal']);
    expect(sounds(drawing, reveal, MAYA)).toEqual(['room-reveal']);
    expect(sounds(drawing, reveal, WATCHER)).toEqual(['room-reveal']);

    // Nobody got it: the same kind cadence for everybody.
    const empty = turnOf(1, ME);
    for (const viewer of [ME, MAYA, LEO, WATCHER]) {
      expect(heard(empty, { ...empty, phase: 'reveal' }, viewer)).toEqual([
        { sound: 'draw-and-guess-nobody-guessed', key: 'end:1.1' },
      ]);
    }

    // A guesser away does not keep everybody else from having guessed.
    const away = turnOf(1, ME, {
      playerList: { ...table.playerList, [LEO]: seat('Leo', 0, false) },
      scoredThisTurn: [MAYA],
    });
    expect(sounds(away, { ...away, phase: 'reveal' }, ME)).toEqual([
      'draw-and-guess-all-guessed',
    ]);
  });

  it('plays nothing as a turn starts, or a turn skipped for a drawer gone', () => {
    const reveal = turnOf(1, ME, { phase: 'reveal' });
    const next = turnOf(2, MAYA, { phase: 'choosing', hint: '' });
    for (const viewer of [ME, MAYA, LEO, WATCHER]) {
      expect(heard(reveal, next, viewer)).toEqual([]);
      expect(heard(turnOf(1, ME), next, viewer)).toEqual([]);
    }
  });

  it('names every key by its turn, so the next turn plays again', () => {
    const one = heard(turnOf(1, ME), turnOf(1, ME, { scoredThisTurn: [MAYA] }));
    const two = heard(
      turnOf(2, LEO),
      turnOf(2, LEO, { scoredThisTurn: [MAYA] }),
    );
    expect(one[0]!.key).not.toBe(two[0]!.key);
    expect(heard(turnOf(1, ME), { ...turnOf(1, ME) })).toEqual([]);
  });

  it('is silent between games: the room layer has the start and the end', () => {
    expect(heard(drawAndGuessState(table), choosing)).toEqual([]);
    expect(
      heard(turnOf(1, ME, { phase: 'reveal' }), drawAndGuessState(table)),
    ).toEqual([]);
  });
});

describe('the Draw & Guess sounds through the replay guard', () => {
  it('plays nothing on arrival, for a repeat, or for a snapshot from earlier', () => {
    const drawing = turnOf(1, ME);
    const scored = turnOf(1, ME, { scoredThisTurn: [MAYA] });
    const reveal = turnOf(1, ME, { phase: 'reveal', scoredThisTurn: [MAYA] });
    const room = guard();
    expect(room.observe(drawing)).toEqual([]);
    expect(room.observe({ ...drawing })).toEqual([]);
    expect(room.observe(scored).map((e) => e.sound)).toEqual([
      'room-someone-scored',
    ]);
    expect(room.observe({ ...scored })).toEqual([]);
    expect(room.observe(reveal).map((e) => e.sound)).toEqual(['room-reveal']);
    // Older snapshots, then the newer ones again.
    expect(room.observe(scored)).toEqual([]);
    expect(room.observe(drawing)).toEqual([]);
    expect(room.observe(scored)).toEqual([]);
    expect(room.observe(reveal)).toEqual([]);
  });

  it('never takes a snapshot from an earlier turn for a new game', () => {
    const room = guard(MAYA);
    room.observe(turnOf(4, LEO));
    room.observe(turnOf(5, LEO));
    expect(room.observe(turnOf(5, LEO, { scoredThisTurn: [MAYA] }))).toEqual([
      { sound: 'draw-and-guess-correct', key: 'game:correct:1.5' },
    ]);
    // Turn 4 again on the same connection, then turn 5 where it was.
    expect(room.observe(turnOf(4, LEO))).toEqual([]);
    expect(room.observe(turnOf(5, LEO, { scoredThisTurn: [MAYA] }))).toEqual(
      [],
    );
  });

  it('lets the drawer’s go stand alone over the word on its snapshot', () => {
    const room = guard(ME);
    room.observe(turnOf(1, MAYA, { phase: 'reveal' }));
    // The choosing snapshot never came: the turn is the drawer's, and drawn.
    expect(room.observe(turnOf(2, ME, { word: 'Owl' }))).toEqual([
      { sound: 'room-your-turn', key: 'turn:1.2' },
    ]);
  });

  it('hears two guesses in one snapshot once, at the higher step', () => {
    const room = guard(ME);
    room.observe(turnOf(1, ME));
    expect(
      room.observe(turnOf(1, ME, { scoredThisTurn: [MAYA, LEO] })),
    ).toEqual([
      {
        sound: 'room-someone-scored',
        key: `game:scored:1.1:${MAYA}`,
        other: true,
        variant: 2,
      },
    ]);
  });

  it('takes a reconnection as a baseline, and the next game anew', () => {
    const room = guard(MAYA);
    room.observe(turnOf(1, ME));
    expect(room.observe(turnOf(1, ME, { scoredThisTurn: [MAYA] }))).toEqual([
      { sound: 'draw-and-guess-correct', key: 'game:correct:1.1' },
    ]);
    // Back mid-turn 2 after a drop: only a baseline.
    expect(
      room.observe(turnOf(2, LEO, { scoredThisTurn: [MAYA] }), 2, true),
    ).toEqual([]);
    // Back again in the next game, at its first turn, after a game unseen.
    room.observe(turnOf(1, ME), 3, true);
    expect(
      room
        .observe(turnOf(1, ME, { scoredThisTurn: [MAYA] }), 3)
        .map((e) => e.sound),
    ).toEqual(['draw-and-guess-correct']);
  });

  it('tells a later game across a reconnection from what both are showing', () => {
    const late = turnOf(5, ME);
    expect(isNewDrawAndGuessGame(late, turnOf(2, LEO))).toBe(true);
    expect(isNewDrawAndGuessGame(late, { ...late, wordCategory: 'Food' })).toBe(
      true,
    );
    expect(isNewDrawAndGuessGame(late, turnOf(6, LEO))).toBe(false);
  });
});

describe('the Draw & Guess deadline', () => {
  it('is the drawer’s word to choose, and a seated guesser’s guess', () => {
    const choosing = turnOf(3, ME, { phase: 'choosing' });
    expect(actingDeadline(choosing, ME)).toBe('1.3:choosing');
    expect(actingDeadline(choosing, MAYA)).toBeNull();

    const drawing = turnOf(3, ME, { scoredThisTurn: [LEO] });
    expect(actingDeadline(drawing, MAYA)).toBe('1.3:drawing');
    expect(actingDeadline(drawing, ME)).toBeNull();
    expect(actingDeadline(drawing, LEO)).toBeNull();
    expect(actingDeadline(drawing, WATCHER)).toBeNull();

    expect(actingDeadline(turnOf(3, ME, { phase: 'reveal' }), MAYA)).toBeNull();
    expect(actingDeadline(drawAndGuessState(table), MAYA)).toBeNull();
  });
});

const line = (id: number, playerId: string, close?: true): ChatMessage => ({
  id,
  kind: 'player',
  playerId,
  username: playerId,
  text: 'turtel',
  ...(close ? { audience: 'sender' as const, close } : {}),
});

describe('a close guess', () => {
  it('is heard by its guesser alone, once, and never from a history', () => {
    const derive = deriveCloseGuessSounds(MAYA);
    expect(derive([line(1, LEO)], [line(1, LEO), line(2, MAYA, true)])).toEqual(
      [{ sound: 'draw-and-guess-close', key: 'close:2' }],
    );
    // Somebody else's line, or a guess that is just chat.
    expect(derive([], [line(3, MAYA), line(4, LEO, true)])).toEqual([]);

    const chat = createReplayGuard(derive, { isNewGame: sameChat });
    chat.observe([]);
    // The history a page is given on arrival or a reconnection.
    expect(chat.observe([line(2, MAYA, true)], true)).toEqual([]);
    expect(chat.observe([line(2, MAYA, true), line(5, MAYA, true)])).toEqual([
      { sound: 'draw-and-guess-close', key: 'close:5' },
    ]);
  });
});

/** The app in a room, with every sound it plays recorded by id. */
async function playRoom() {
  const engine = new AudioEngine({});
  const play = vi
    .spyOn(engine, 'play')
    .mockImplementation(() => Promise.resolve(true));
  const fake = new FakeSocket();
  fake.answer('room:sync', () => ({ ok: true as const }));
  const view = await renderApp(roomPath('draw-and-guess', 'r1'), {
    fake,
    engine,
  });
  const played = () =>
    play.mock.calls.map(([spec, options]: [SoundSpec, PlayOptions?]) =>
      [
        spec.id,
        options?.other ? 'other' : '',
        options?.variant ? `step ${options.variant}` : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  const send = (state: DrawAndGuessRoomState) =>
    act(() => fake.serverEmits('room:state', state));
  return { ...view, fake, play, played, send };
}

const lobby = drawAndGuessState({
  playerList: { [ME]: seat('Ryan'), [MAYA]: seat('Maya') },
});

describe('a Draw & Guess room, heard in the app', () => {
  it('plays a turn for each player at the right moments, once', async () => {
    const user = userEvent.setup();
    const { fake, played, send } = await playRoom();
    send(lobby);
    act(() => fake.serverEmits('chat:history', 'r1', []));
    expect(played()).toEqual([]);

    // Leo sits down and Sam comes to watch, together: one join.
    send({ ...lobby, ...table });
    send(turnOf(1, MAYA, { phase: 'choosing', hint: '' }));
    send(turnOf(1, MAYA));
    send(turnOf(1, MAYA, { scoredThisTurn: [LEO] }));
    act(() =>
      fake.serverEmits('chat:message', 'r1', {
        id: 7,
        kind: 'player',
        playerId: ME,
        username: 'Ryan',
        text: 'turtel',
        audience: 'sender',
        close: true,
      }),
    );
    send(turnOf(1, MAYA, { phase: 'reveal', scoredThisTurn: [LEO] }));
    send(turnOf(2, ME, { phase: 'choosing', hint: '', wordChoices: ['Owl'] }));
    send(turnOf(2, ME, { word: 'Owl' }));
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    send(
      turnOf(2, ME, {
        word: 'Owl',
        scoredThisTurn: [MAYA, LEO],
        phase: 'reveal',
      }),
    );
    send(
      drawAndGuessState({
        ...table,
        lastGame: {
          endedEarly: false,
          standings: [
            { playerId: ME, username: 'Ryan', points: 140 },
            { playerId: LEO, username: 'Leo', points: 90 },
            { playerId: MAYA, username: 'Maya', points: 60 },
          ],
          wordCategory: 'Animals',
          rounds: 1,
          turns: 2,
        },
      }),
    );
    expect(played()).toEqual([
      'room-join other',
      'stinger-game-start',
      'room-someone-scored other step 1',
      'draw-and-guess-close',
      'room-time-up',
      'room-your-turn',
      'room-stamp',
      'ui-undo',
      'draw-and-guess-clear',
      'draw-and-guess-all-guessed',
      'stinger-win',
    ]);
  });

  it('plays nothing it played before when the page comes back', async () => {
    const { fake, played, send, unmount } = await playRoom();
    send(turnOf(1, MAYA));
    act(() => fake.serverEmits('chat:history', 'r1', []));
    send(turnOf(1, MAYA, { scoredThisTurn: [LEO] }));
    expect(played()).toEqual(['room-someone-scored other step 1']);

    // The connection drops, and comes back to a room that moved on.
    act(() => fake.drop());
    expect(played()).toEqual([
      'room-someone-scored other step 1',
      'ui-connection-lost',
    ]);
    act(() => fake.open());
    send(turnOf(2, ME, { phase: 'choosing', hint: '', wordChoices: ['Owl'] }));
    act(() =>
      fake.serverEmits('chat:history', 'r1', [
        {
          id: 3,
          kind: 'player',
          playerId: ME,
          username: 'Ryan',
          text: 'turtel',
          audience: 'sender',
          close: true,
        },
      ]),
    );
    expect(played()).toHaveLength(2);
    unmount();

    // A refresh into the next turn's drawing, and its history.
    const again = await playRoom();
    again.send(turnOf(2, ME, { word: 'Owl', scoredThisTurn: [MAYA] }));
    act(() =>
      again.fake.serverEmits('chat:history', 'r1', [
        {
          id: 3,
          kind: 'player',
          playerId: ME,
          username: 'Ryan',
          text: 'turtel',
          audience: 'sender',
          close: true,
        },
      ]),
    );
    again.send({ ...turnOf(2, ME, { word: 'Owl', scoredThisTurn: [MAYA] }) });
    expect(again.played()).toEqual([]);
  });
});
