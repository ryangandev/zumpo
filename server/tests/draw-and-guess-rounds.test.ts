import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DrawAndGuessRoomState } from '../models/types.js';
import {
  joinRoom,
  seatTwoPlayers,
  startGame,
  startTestServer,
  waitForDrawState,
  type TestClient,
  type TestServer,
} from './helpers/test-server.js';

/** Long enough to guess inside a drawing; short enough for four turns. */
const ROUND_PHASES = { wordSelecting: 0.3, drawing: 5, reviewing: 0.4 };

/** Plays turn `turn` to its reveal, every guesser getting the word. */
const guessTurn = async (
  players: TestClient[],
  roomId: string,
  turn: number,
): Promise<DrawAndGuessRoomState> => {
  const views = await Promise.all(
    players.map((player) =>
      waitForDrawState(
        player,
        (s) => s.turn === turn && s.phase === 'drawing',
        5000,
      ),
    ),
  );
  const drawerIndex = players.findIndex(
    (player) => player.playerId === views[0]!.currentDrawer,
  );
  const reveal = waitForDrawState(
    players[0]!,
    (s) => s.turn === turn && s.phase === 'reveal',
  );
  players
    .filter((_, index) => index !== drawerIndex)
    .forEach((guesser) =>
      guesser.emit('chat:send', roomId, views[drawerIndex]!.word!),
    );
  return reveal;
};

/** Every player's score, added up. */
const total = (state: DrawAndGuessRoomState) =>
  Object.values(state.playerList).reduce((sum, p) => sum + p.points, 0);

/*
 * The round summary: what each player made in a round, shown from the reveal
 * of its last turn until the next round's first word is chosen.
 */
describe('Draw & Guess round summary', () => {
  let harness: TestServer;

  beforeEach(async () => {
    harness = await startTestServer(ROUND_PHASES);
  });

  afterEach(async () => {
    await harness.teardown();
  });

  it('sums each round at its last reveal and keeps it up until the next round draws', async () => {
    const { alice, bob, roomId } = await seatTwoPlayers(harness, 2);
    const players = [alice, bob];
    await startGame(alice, roomId);

    const first = await guessTurn(players, roomId, 1);
    expect(first.lastRound).toBeNull();

    const second = await guessTurn(players, roomId, 2);
    expect(second.lastRound?.round).toBe(1);
    const standings = second.lastRound!.standings;
    expect(standings.map((s) => s.playerId).toSorted()).toEqual(
      [alice.playerId, bob.playerId].toSorted(),
    );
    // Round one is the whole game so far, best first.
    for (const standing of standings) {
      expect(standing.points).toBe(
        second.playerList[standing.playerId]!.points,
      );
    }
    expect(standings[0]!.points).toBeGreaterThanOrEqual(standings[1]!.points);

    const choosing = await waitForDrawState(
      alice,
      (s) => s.turn === 3 && s.phase === 'choosing',
    );
    expect(choosing.currentRound).toBe(2);
    expect(choosing.lastRound).toEqual(second.lastRound);

    const drawing = waitForDrawState(
      alice,
      (s) => s.turn === 3 && s.phase === 'drawing',
    );
    await guessTurn(players, roomId, 3);
    expect((await drawing).lastRound).toBeNull();

    // Round two counts from nothing, and the game's end clears it.
    const fourth = await guessTurn(players, roomId, 4);
    expect(fourth.lastRound?.round).toBe(2);
    const roundTwo = fourth.lastRound!.standings;
    expect(roundTwo.reduce((sum, s) => sum + s.points, 0)).toBe(
      total(fourth) - total(second),
    );

    const ended = await waitForDrawState(alice, (s) => !s.isGameStarted);
    expect(ended.lastRound).toBeNull();
    expect(ended.lastGame?.endedEarly).toBe(false);
  });

  it('sums a round whose last turn was skipped before its reveal', async () => {
    const { alice, bob, roomId } = await seatTwoPlayers(harness, 2);
    const carol = await harness.connect();
    await joinRoom(carol, roomId, 'Carol');
    const players = [alice, bob, carol];
    await startGame(alice, roomId);
    await guessTurn(players, roomId, 1);
    await guessTurn(players, roomId, 2);

    // The round's last drawer leaves mid-drawing, so it has no reveal.
    const last = await waitForDrawState(
      alice,
      (s) => s.turn === 3 && s.phase === 'drawing',
    );
    const drawer = players.find(
      (player) => player.playerId === last.currentDrawer,
    )!;
    const watcher = drawer === alice ? bob : alice;
    const next = waitForDrawState(watcher, (s) => s.turn === 4, 5000);
    drawer.emit('room:leave', roomId);

    const summed = await next;
    expect(summed.currentRound).toBe(2);
    expect(summed.lastRound?.round).toBe(1);
    expect(summed.lastRound?.standings.map((s) => s.playerId)).not.toContain(
      drawer.playerId,
    );
  });
});
