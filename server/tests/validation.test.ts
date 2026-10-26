import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  chatRequest,
  gameTypeOnly,
  joinRoomRequest,
  identityClaim,
  roomCreateRequest,
  roomIdOnly,
} from '../libs/validation.js';
import { drawAndGuessSettings } from '../socket/draw-and-guess/validation.js';
import { WORD_CATEGORIES } from '../../shared/draw-and-guess.js';
import { startDrawingRequest } from '../libs/drawing/validation.js';

const validRoomId = randomUUID();

const validCreateRequest = {
  gameType: 'draw-and-guess',
  roomName: 'A Room',
  username: 'Owner',
  maxPlayers: 4,
  password: '',
  settings: { rounds: 2, categories: ['Animals'] },
};

describe('roomCreateRequest', () => {
  it('accepts a request the UI could actually produce', () => {
    expect(roomCreateRequest.safeParse(validCreateRequest).success).toBe(true);
  });

  it('treats an absent password as an unlocked room', () => {
    const result = roomCreateRequest.safeParse({
      gameType: 'draw-and-guess',
      roomName: 'A Room',
      username: 'Owner',
      maxPlayers: 4,
      settings: { rounds: 2, categories: ['Animals'] },
    });

    expect(result.success).toBe(true);
    expect(result.data?.password).toBe('');
  });

  it('rejects a game the server does not run', () => {
    for (const gameType of ['chess', '', null, 42]) {
      expect(
        roomCreateRequest.safeParse({ ...validCreateRequest, gameType })
          .success,
      ).toBe(false);
    }
  });

  /*
   * The envelope deliberately does not look inside `settings`: only the game's
   * own module knows what belongs there, and it is handed the raw value to
   * accept or reject. A room whose settings are refused is never created.
   */
  it('passes settings through untouched, whatever they are', () => {
    const result = roomCreateRequest.safeParse({
      ...validCreateRequest,
      settings: { anything: ['at', 'all'] },
    });

    expect(result.success).toBe(true);
    expect(result.data?.settings).toEqual({ anything: ['at', 'all'] });
  });

  /*
   * The distinction this pins down is `.optional().default('')` versus
   * `.catch('')`. Both tolerate a missing password, but `.catch` also
   * substitutes the default when the value is *present and invalid*, which
   * silently turned a rejected 10KB password into an unlocked room that the
   * person creating it believed was locked.
   */
  it('rejects an over-long password rather than defaulting it to unlocked', () => {
    const result = roomCreateRequest.safeParse({
      ...validCreateRequest,
      password: 'x'.repeat(10_000),
    });

    expect(result.success).toBe(false);
    expect(result.data?.password).not.toBe('');
  });

  it('bounds the seat count so a room cannot be created with a billion seats', () => {
    for (const maxPlayers of [0, 1, 9, 1_000_000_000, 2.5, NaN]) {
      expect(
        roomCreateRequest.safeParse({ ...validCreateRequest, maxPlayers })
          .success,
      ).toBe(false);
    }
  });

  it('rejects a room name longer than the input allows', () => {
    expect(
      roomCreateRequest.safeParse({
        ...validCreateRequest,
        roomName: 'x'.repeat(41),
      }).success,
    ).toBe(false);
  });

  it('takes no name for a room named after its host', () => {
    expect(
      roomCreateRequest.safeParse({ ...validCreateRequest, roomName: '' })
        .success,
    ).toBe(true);
  });

  it('rejects a name that is only whitespace', () => {
    expect(
      roomCreateRequest.safeParse({
        ...validCreateRequest,
        roomName: '     ',
      }).success,
    ).toBe(false);
  });

  it('rejects the wrong types outright', () => {
    expect(
      roomCreateRequest.safeParse({
        ...validCreateRequest,
        maxPlayers: '4',
      }).success,
    ).toBe(false);
    expect(roomCreateRequest.safeParse(null).success).toBe(false);
    expect(roomCreateRequest.safeParse('a string').success).toBe(false);
  });
});

const accepts = (rounds: unknown, categories: unknown) =>
  drawAndGuessSettings.safeParse({ rounds, categories }).success;

describe('drawAndGuessSettings', () => {
  it('bounds the round count', () => {
    expect(accepts(2, ['Animals'])).toBe(true);
    expect(accepts(0, ['Animals'])).toBe(false);
    expect(accepts(99, ['Animals'])).toBe(false);
    expect(accepts(undefined, ['Animals'])).toBe(false);
    expect(accepts('2', ['Animals'])).toBe(false);
  });

  it('takes at least one known category, each once', () => {
    expect(accepts(2, ['Sea Life'])).toBe(true);
    expect(accepts(2, [...WORD_CATEGORIES])).toBe(true);
    for (const refused of [
      [],
      undefined,
      'Animals',
      ['Animals', 'Animals'],
      ['Dinosaurs'],
      ['animals'],
      ['toString'],
      [42],
    ]) {
      expect(accepts(2, refused)).toBe(false);
    }
  });

  it('keeps the categories in the picker’s order, however they arrive', () => {
    expect(
      drawAndGuessSettings.parse({
        rounds: 2,
        categories: ['Vehicles', 'Animals', 'Music'],
      }).categories,
    ).toEqual(['Animals', 'Music', 'Vehicles']);
  });
});

describe('gameTypeOnly', () => {
  it('accepts each game the server runs', () => {
    expect(gameTypeOnly.safeParse(['draw-and-guess']).success).toBe(true);
  });

  it('rejects a lobby subscription for a game that does not exist', () => {
    for (const candidate of ['', 'DrawAndGuess', 'chess', null]) {
      expect(gameTypeOnly.safeParse([candidate]).success).toBe(false);
    }
  });
});

describe('roomIdOnly', () => {
  it('accepts a generated room id', () => {
    expect(roomIdOnly.safeParse([validRoomId]).success).toBe(true);
  });

  it('rejects anything that is not a uuid, since no room could match it', () => {
    for (const candidate of ['', '../../etc/passwd', 'room-1', 42, null]) {
      expect(roomIdOnly.safeParse([candidate]).success).toBe(false);
    }
  });
});

describe('joinRoomRequest', () => {
  it('accepts a join with a password', () => {
    expect(
      joinRoomRequest.safeParse([validRoomId, 'Alice', 'secret', null]).success,
    ).toBe(true);
  });

  it('accepts a join that asks for either kind of seat', () => {
    for (const seat of ['player', 'spectator']) {
      expect(
        joinRoomRequest.safeParse([validRoomId, 'Alice', '', seat]).success,
      ).toBe(true);
    }
  });

  it('rejects a seat that is neither', () => {
    expect(
      joinRoomRequest.safeParse([validRoomId, 'Alice', '', 'referee']).success,
    ).toBe(false);
  });

  it('rejects a username longer than the landing page allows', () => {
    expect(
      joinRoomRequest.safeParse([validRoomId, 'x'.repeat(19), '', null])
        .success,
    ).toBe(false);
  });

  it('rejects extra positional arguments', () => {
    expect(
      joinRoomRequest.safeParse([validRoomId, 'Alice', '', null, 'extra'])
        .success,
    ).toBe(false);
  });
});

describe('chatRequest', () => {
  it('bounds the message at the length of the chat input', () => {
    expect(chatRequest.safeParse([validRoomId, 'x'.repeat(40)]).success).toBe(
      true,
    );
    expect(chatRequest.safeParse([validRoomId, 'x'.repeat(41)]).success).toBe(
      false,
    );
  });

  it('rejects an empty message', () => {
    expect(chatRequest.safeParse([validRoomId, '   ']).success).toBe(false);
  });

  /*
   * The speaker is whoever holds the seat. A name in the payload was what
   * once let a client post as anybody.
   */
  it('takes no name from the client', () => {
    expect(chatRequest.safeParse([validRoomId, 'Alice', 'hello']).success).toBe(
      false,
    );
  });
});

describe('identityClaim', () => {
  const claim = { playerId: randomUUID(), token: 'a'.repeat(64) };

  it('accepts exactly the shape the server issues', () => {
    expect(identityClaim.safeParse(claim).success).toBe(true);
  });

  it('rejects anything else, before it reaches the token comparison', () => {
    for (const candidate of [
      { ...claim, playerId: 'player-1' },
      { ...claim, token: 'A'.repeat(64) },
      { ...claim, token: 'a'.repeat(63) },
      { playerId: claim.playerId },
      null,
      'a string',
    ]) {
      expect(identityClaim.safeParse(candidate).success).toBe(false);
    }
  });
});

describe('startDrawingRequest', () => {
  const point = { x: 100, y: 100 };

  it('accepts a stroke the canvas could have produced', () => {
    expect(
      startDrawingRequest.safeParse([validRoomId, point, '#ff0000', 12])
        .success,
    ).toBe(true);
  });

  it('rejects a colour that is not a hex value', () => {
    for (const color of [
      'red',
      'javascript:alert(1)',
      '#',
      '#gggggg',
      'url(x)',
    ]) {
      expect(
        startDrawingRequest.safeParse([validRoomId, point, color, 12]).success,
      ).toBe(false);
    }
  });

  it('rejects coordinates far outside the canvas', () => {
    for (const coords of [
      { x: 1e9, y: 0 },
      { x: 0, y: -1000 },
      { x: Infinity, y: 0 },
      { x: NaN, y: 0 },
    ]) {
      expect(
        startDrawingRequest.safeParse([validRoomId, coords, '#000000', 12])
          .success,
      ).toBe(false);
    }
  });

  it('bounds the brush size', () => {
    expect(
      startDrawingRequest.safeParse([validRoomId, point, '#000000', 0]).success,
    ).toBe(false);
    expect(
      startDrawingRequest.safeParse([validRoomId, point, '#000000', 100_000])
        .success,
    ).toBe(false);
  });
});
