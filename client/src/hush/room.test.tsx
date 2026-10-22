import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { HushRoomState } from '../../../shared/wire-types';
import { hushState, ME } from '../tests/fixtures';
import { renderSeated } from '../tests/seated';
import { renderApp } from '../tests/render-app';
import { FakeSocket } from '../tests/fake-socket';

/** Ryan (the viewer) and Maya, three cards each, on level 3 of 7. */
const playing: HushRoomState = hushState({
  isGameStarted: true,
  phase: 'playing',
  level: 3,
  lives: 2,
  hand: [41, 77],
  table: {
    p1: { held: 2, ready: true },
    p2: { held: 2, ready: true },
  },
  pile: [
    { card: 9, playerId: 'p2' },
    { card: 34, playerId: ME },
  ],
});

/** What the turn bar says. */
const turn = () => within(screen.getByRole('region', { name: 'Turn' }));
const scoreboard = () =>
  within(screen.getByRole('region', { name: /^Players/ }));
const chatBox = () => screen.getByRole('textbox', { name: 'Message' });

/** The celebration's canvas; the room has no other. */
const confetti = () => document.querySelector('canvas[aria-hidden]');

/** Both seats getting ready for the given level. */
function readyAt(level: number) {
  return hushState({
    isGameStarted: true,
    phase: 'ready',
    level,
    table: {
      p1: { held: 0, ready: false },
      p2: { held: 0, ready: false },
    },
  });
}

/** Two players getting ready for the given level, and the viewer watching. */
function watchingAt(level: number) {
  return {
    ...readyAt(level),
    table: {
      p2: { held: 0, ready: false },
      p3: { held: 0, ready: false },
    },
    playerList: {
      p2: { username: 'Maya', points: 0, isConnected: true },
      p3: { username: 'Sam', points: 0, isConnected: true },
    },
    spectators: { [ME]: { username: 'Ryan', isConnected: true } },
  };
}

describe('a Hush room', () => {
  it('lets the host start, and says how long the game is', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(hushState());
    fake.answer('game:start', () => ({ ok: true as const }));

    expect(screen.getByText(/^2 players, 7 levels\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(fake.requests.at(-1)).toEqual({ event: 'game:start', args: ['r1'] });
  });

  it('asks everybody to get ready, with the chat open', async () => {
    const user = userEvent.setup();
    const { fake, update } = await renderSeated(
      hushState({
        isGameStarted: true,
        phase: 'ready',
        level: 3,
        lives: 2,
        table: {
          p1: { held: 0, ready: false },
          p2: { held: 0, ready: true },
        },
      }),
    );

    expect(turn().getByText('Level 3 of 7')).toBeInTheDocument();
    expect(turn().getByText('Get ready')).toBeInTheDocument();
    expect(turn().getByText('1 player is ready.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '2 lives' })).toBeInTheDocument();
    expect(scoreboard().getByText('Ready')).toBeInTheDocument();
    expect(scoreboard().getByText('Getting ready')).toBeInTheDocument();
    expect(chatBox()).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'I’m ready' }));
    expect(fake.sentArgs('hush:ready')).toEqual([['r1']]);

    update(
      hushState({
        isGameStarted: true,
        phase: 'ready',
        level: 3,
        lives: 2,
        table: {
          p1: { held: 0, ready: true },
          p2: { held: 0, ready: false },
        },
      }),
    );
    expect(turn().getByText('Waiting for 1 player.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'I’m ready' })).toBeNull();
  });

  it('says the rule before the first deal, and only then', async () => {
    const { update } = await renderSeated(readyAt(1));
    expect(
      screen.getByText(/^No turns, no talking: play your lowest card/),
    ).toBeInTheDocument();

    update(readyAt(2));
    expect(screen.queryByText(/^No turns, no talking/)).toBeNull();
    expect(
      screen.getByText(
        'The chat locks when the level starts, and opens when it ends.',
      ),
    ).toBeInTheDocument();
  });

  it('says the rule to a spectator before the first deal too', async () => {
    const { update } = await renderSeated(watchingAt(1));
    expect(
      screen.getByText(/^No turns, no talking: play your lowest card/),
    ).toBeInTheDocument();

    update(watchingAt(2));
    expect(
      screen.getByText('You’re watching. The team plays without a word.'),
    ).toBeInTheDocument();
  });

  it('counts down with the hands dealt and the chat locked', async () => {
    await renderSeated({
      ...playing,
      phase: 'countdown',
      phaseEndsInMs: 3_000,
      pile: [],
      hand: [14, 41, 77],
      table: {
        p1: { held: 3, ready: true },
        p2: { held: 3, ready: true },
      },
    });

    expect(turn().getByText('Hush')).toBeInTheDocument();
    expect(turn().getByText('Everybody holds 3 cards.')).toBeInTheDocument();
    expect(turn().getByText('to start')).toBeInTheDocument();
    expect(screen.getByText('Play opens in a moment.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Play/ })).toBeNull();
    expect(chatBox()).toBeDisabled();
    expect(chatBox()).toHaveAttribute(
      'placeholder',
      'Hush. Chat opens when the level ends.',
    );
  });

  it('plays your lowest card, and only that, with no clock', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(playing);

    expect(screen.queryByRole('timer')).toBeNull();
    expect(
      turn().getByText('Play your lowest card when it feels right.'),
    ).toBeInTheDocument();
    const hand = within(screen.getByRole('region', { name: 'Your hand' }));
    expect(hand.getAllByRole('img').map((card) => card.textContent)).toEqual([
      '41',
      '77',
    ]);
    // The pile shows its top card, and the cards under it.
    const pile = within(screen.getByRole('region', { name: 'The pile' }));
    expect(pile.getByRole('img', { name: '34' })).toBeInTheDocument();
    expect(pile.getByRole('img', { name: '9' })).toBeInTheDocument();
    expect(screen.getByText('4 cards to go')).toBeInTheDocument();
    expect(scoreboard().getAllByText('2 cards')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Play 41' }));
    expect(fake.sentArgs('hush:play')).toEqual([['r1', 41]]);
    expect(chatBox()).toBeDisabled();
  });

  it('shows a mistake: who played what, and what was lost', async () => {
    await renderSeated({
      ...playing,
      phase: 'mistake',
      phaseEndsInMs: 3_000,
      lives: 1,
      hand: [77],
      table: {
        p1: { held: 1, ready: true },
        p2: { held: 1, ready: true },
      },
      pile: [...playing.pile, { card: 52, playerId: 'p2' }],
      discards: [{ card: 47, playerId: ME, reason: 'mistake' }],
      lastMistake: {
        playerId: 'p2',
        card: 52,
        discarded: [{ card: 47, playerId: ME, reason: 'mistake' }],
      },
    });

    expect(turn().getByText('Maya played 52')).toBeInTheDocument();
    expect(
      turn().getByText('A lower card was still held. One life lost.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '47, discarded' }),
    ).toBeInTheDocument();
    expect(scoreboard().getByText('Lost 47, 1 card left')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '1 life' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Play/ })).toBeNull();
  });

  it('pauses for a player who dropped holding cards', async () => {
    await renderSeated({
      ...playing,
      phase: 'paused',
      phaseEndsInMs: 24_000,
      playerList: {
        ...playing.playerList,
        p2: { username: 'Maya', points: 2, isConnected: false },
      },
    });

    expect(turn().getByText('Paused')).toBeInTheDocument();
    expect(
      turn().getByText('Waiting for Maya, who still holds 2 cards.'),
    ).toBeInTheDocument();
    expect(turn().getByText('seat held')).toBeInTheDocument();
    expect(scoreboard().getByText('Away, 2 cards')).toBeInTheDocument();
    expect(
      screen.getByText('Play goes on with a countdown when Maya is back.'),
    ).toBeInTheDocument();
  });

  it('shows a clean level and the life it won back, with the chat open', async () => {
    await renderSeated({
      ...playing,
      phase: 'cleared',
      phaseEndsInMs: 4_000,
      lives: 3,
      hand: [],
      table: {
        p1: { held: 0, ready: true },
        p2: { held: 0, ready: true },
      },
      lastLevel: { level: 3, livesLost: 0, lifeBack: true, cleared: true },
    });

    expect(turn().getByText('Level cleared!')).toBeInTheDocument();
    expect(turn().getByText('Not one slip: a life back.')).toBeInTheDocument();
    expect(turn().getByText('to level 4')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Level 4 deals 4 cards each. Everyone presses Ready again.',
      ),
    ).toBeInTheDocument();
    expect(chatBox()).toBeEnabled();
    // Ready keeps its room out of sight until the next level, not pressable.
    expect(screen.queryByRole('button', { name: 'I’m ready' })).toBeNull();
  });

  it('keeps the room of the cards already played, out of sight', async () => {
    await renderSeated({ ...playing, hand: [77] });
    const hand = within(screen.getByRole('region', { name: 'Your hand' }));
    expect(hand.getAllByRole('img').map((card) => card.ariaLabel)).toEqual([
      '77',
    ]);
    // Level 3 dealt three: two kept as hidden room on a phone.
    expect(
      screen
        .getByRole('region', { name: 'Your hand' })
        .querySelectorAll('li[aria-hidden]'),
    ).toHaveLength(2);
  });

  it('never shows a score: the team scores together', async () => {
    await renderSeated(playing);
    for (const row of scoreboard().getAllByRole('listitem')) {
      expect(row.textContent).not.toMatch(/\d$/);
    }
  });

  it('shows a won game level by level, without ranking anybody', async () => {
    await renderSeated(
      hushState({
        levels: 7,
        pile: [
          { card: 12, playerId: ME },
          { card: 58, playerId: 'p2' },
        ],
        lastGame: {
          endedEarly: false,
          standings: [
            { playerId: ME, username: 'Ryan', points: 2 },
            { playerId: 'p2', username: 'Maya', points: 2 },
          ],
          levels: 2,
          levelsCleared: 2,
          won: true,
          lives: 2,
          history: [
            { level: 1, livesLost: 1, lifeBack: false, cleared: true },
            { level: 2, livesLost: 0, lifeBack: true, cleared: true },
          ],
          held: [],
        },
      }),
    );

    expect(
      within(screen.getByRole('region', { name: 'Turn' })).getByText(
        'All 2 levels cleared.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Together, with 2 lives to spare.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Level 1: a life lost')).toBeInTheDocument();
    expect(screen.getByText('Level 2: clean, a life back')).toBeInTheDocument();
    expect(screen.queryByText('Winner')).toBeNull();
    expect(screen.getByRole('img', { name: '58' })).toBeInTheDocument();
    // The result heads the stage at level 2, and the team's result under the
    // pile is named by it, its blocks at level 3.
    const stage = screen.getByRole('main');
    const headings = within(stage)
      .getAllByRole('heading')
      .map((h) => [
        h.getAttribute('aria-level') ?? h.tagName.slice(1),
        h.textContent,
      ]);
    expect(headings.slice(0, 1)).toEqual([['2', 'All 2 levels cleared.']]);
    expect(headings).toContainEqual(['3', 'Level by level']);
    expect(headings).toContainEqual(['3', 'Played by']);
    expect(
      screen.getByRole('region', { name: 'All 2 levels cleared.' }),
    ).toHaveTextContent('Level 1: a life lost');
  });

  it('celebrates a win together, but not a loss', async () => {
    const summary = {
      endedEarly: false,
      standings: [
        { playerId: ME, username: 'Ryan', points: 0 },
        { playerId: 'p2', username: 'Maya', points: 0 },
      ],
      levels: 7,
      levelsCleared: 0,
      won: false,
      lives: 0,
      history: [{ level: 1, livesLost: 3, lifeBack: false, cleared: false }],
      held: [],
    };
    const { update } = await renderSeated(playing);
    update(hushState({ lastGame: summary }));
    expect(
      within(screen.getByRole('region', { name: 'Turn' })).getByText(
        'Out of lives on level 1.',
      ),
    ).toBeInTheDocument();
    expect(confetti()).toBeNull();

    update(playing);
    update(
      hushState({
        lastGame: {
          ...summary,
          won: true,
          lives: 1,
          levels: 1,
          levelsCleared: 1,
        },
      }),
    );
    expect(
      within(screen.getByRole('region', { name: 'Turn' })).getByText(
        'All 1 level cleared.',
      ),
    ).toBeInTheDocument();
    expect(confetti()).not.toBeNull();
  });

  it('shows every card still held when the lives run out', async () => {
    await renderSeated(
      hushState({
        lastGame: {
          endedEarly: false,
          standings: [
            { playerId: ME, username: 'Ryan', points: 0 },
            { playerId: 'p2', username: 'Maya', points: 0 },
          ],
          levels: 7,
          levelsCleared: 0,
          won: false,
          lives: 0,
          history: [
            { level: 1, livesLost: 3, lifeBack: false, cleared: false },
          ],
          held: [{ playerId: 'p2', cards: [79, 93] }],
        },
      }),
    );

    expect(
      within(screen.getByRole('region', { name: 'Turn' })).getByText(
        'Out of lives on level 1.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('0 of 7 levels cleared, together.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Level 1: the last life lost')).toBeInTheDocument();
    const held = within(screen.getByRole('list', { name: 'Maya held' }));
    expect(held.getAllByRole('img').map((card) => card.textContent)).toEqual([
      '79',
      '93',
    ]);
    expect(screen.getByText('Nothing left')).toBeInTheDocument();
  });
});

describe('a Hush room in Chinese', () => {
  it('translates ready, the hand, and the quiet chat while preserving actions', async () => {
    const user = userEvent.setup();
    const fake = new FakeSocket();
    fake.answer('room:sync', () => ({ ok: true as const }));
    await renderApp('/games/hush/rooms/r1', { locale: 'zh', fake });
    act(() =>
      fake.serverEmits(
        'room:state',
        hushState({
          isGameStarted: true,
          phase: 'ready',
          level: 3,
          lives: 2,
          table: {
            p1: { held: 0, ready: false },
            p2: { held: 0, ready: true },
          },
        }),
      ),
    );
    const bar = within(screen.getByRole('region', { name: '当前回合' }));
    expect(bar.getByText('第 3 / 7 关')).toBeVisible();
    expect(bar.getByText('准备开始')).toBeVisible();
    expect(bar.getByText('1 人准备好了。')).toBeVisible();
    expect(screen.getByRole('img', { name: '2 条命' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '我准备好了' }));
    expect(fake.sentArgs('hush:ready')).toEqual([['r1']]);

    act(() => fake.serverEmits('room:state', playing));
    expect(screen.getByRole('region', { name: '你的手牌' })).toBeVisible();
    expect(screen.getByText('只能打出你最小的牌。')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '出 41' }));
    expect(fake.sentArgs('hush:play')).toEqual([['r1', 41]]);
    expect(screen.getByRole('textbox', { name: '消息' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: '消息' })).toHaveAttribute(
      'placeholder',
      '嘘。关卡结束后才能聊天。',
    );
  });
});
