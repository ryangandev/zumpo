import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { drawAndGuessState, ME } from '../tests/fixtures';
import { onPhone } from '../tests/phone';
import { renderSeated } from '../tests/seated';
import { renderApp } from '../tests/render-app';
import { FakeSocket } from '../tests/fake-socket';
import { roomPath } from '../games/catalog';

/** The phone's Board tab. */
const board = () => within(screen.getByRole('tabpanel', { name: 'Board' }));

const turn = {
  isGameStarted: true,
  currentRound: 1,
  turn: 1,
  wordCategory: 'Animals' as const,
  phaseEndsInMs: 60_000,
};

describe('a Draw & Guess room', () => {
  it('translates the turn and chat in Chinese while keeping the word choices English', async () => {
    const user = userEvent.setup();
    const fake = new FakeSocket();
    fake.answer('room:sync', () => ({ ok: true as const }));
    await renderApp(roomPath('draw-and-guess', 'r1'), { locale: 'zh', fake });
    const state = drawAndGuessState({
      ...turn,
      phase: 'choosing',
      currentDrawer: ME,
      wordChoices: ['turtle', 'zebra', 'owl'],
    });
    act(() => fake.serverEmits('room:state', state));
    expect(screen.getByText('选一个词')).toBeInTheDocument();
    expect(screen.getByText('动物')).toBeInTheDocument();
    expect(screen.getByText('第 1 轮，共 2 轮')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /zebra/ }));
    expect(fake.sentArgs('dg:select-word')).toEqual([['r1', 'zebra']]);

    act(() =>
      fake.serverEmits('room:state', {
        ...state,
        phase: 'drawing',
        word: 'zebra',
        wordChoices: undefined,
        hint: '_ _ _ _ _',
      }),
    );
    expect(screen.getByText('zebra')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'placeholder',
      '你正在画画，回合结束后才能聊天。',
    );
    expect(screen.getByRole('img', { name: '绘画画布' })).toBeInTheDocument();
  });

  it('offers the drawer their words, and only the drawer', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(
      drawAndGuessState({
        ...turn,
        phase: 'choosing',
        currentDrawer: ME,
        wordChoices: ['turtle', 'zebra', 'owl'],
      }),
    );

    expect(screen.getByText('Pick a word')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /zebra/ }));
    expect(fake.sentArgs('dg:select-word')).toEqual([['r1', 'zebra']]);
  });

  it('tells a guesser who is choosing', async () => {
    await renderSeated(
      drawAndGuessState({ ...turn, phase: 'choosing', currentDrawer: 'p2' }),
    );
    expect(screen.getByText('Maya is choosing a word')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /turtle/ })).toBeNull();
  });

  it('keeps the drawer out of the chat while they draw', async () => {
    await renderSeated(
      drawAndGuessState({
        ...turn,
        phase: 'drawing',
        currentDrawer: ME,
        word: 'turtle',
        hint: '_ _ _ _ _ _',
      }),
    );
    expect(screen.getByText('turtle')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'placeholder',
      'You’re drawing. Chat opens after your turn.',
    );
  });

  it('puts the keyboard in the guess box as a guessing turn starts', async () => {
    const { update } = await renderSeated(
      drawAndGuessState({ ...turn, phase: 'choosing', currentDrawer: 'p2' }),
    );
    expect(screen.getByRole('textbox')).not.toHaveFocus();
    update(
      drawAndGuessState({
        ...turn,
        phase: 'drawing',
        currentDrawer: 'p2',
        hint: '_ _ _ _ _ _',
      }),
    );
    expect(screen.getByPlaceholderText('Type your guess…')).toHaveFocus();
  });

  it('sends a guess through the chat', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(
      drawAndGuessState({
        ...turn,
        phase: 'drawing',
        currentDrawer: 'p2',
        hint: '_ _ _ _ _ _',
      }),
    );
    const input = screen.getByPlaceholderText('Type your guess…');
    await user.type(input, 'turtle{Enter}');
    expect(fake.sentArgs('chat:send')).toEqual([['r1', 'turtle']]);
  });

  it('keeps a player who scored quiet through the review', async () => {
    await renderSeated(
      drawAndGuessState({
        ...turn,
        phase: 'reveal',
        currentDrawer: 'p2',
        word: 'turtle',
        scoredThisTurn: [ME],
        turnPoints: { [ME]: 120, p2: 48 },
      }),
    );
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'placeholder',
      'You got it. Chat opens next turn.',
    );
  });

  it('sums up the round that just ended under the drawing', async () => {
    await renderSeated(
      drawAndGuessState({
        ...turn,
        phase: 'reveal',
        turn: 2,
        currentDrawer: 'p2',
        word: 'turtle',
        playerList: {
          [ME]: { username: 'Ryan', points: 260, isConnected: true },
          p2: { username: 'Maya', points: 300, isConnected: true },
        },
        lastRound: {
          round: 1,
          standings: [
            { playerId: 'p2', username: 'Maya', points: 300 },
            { playerId: ME, username: 'Ryan', points: 260 },
            { playerId: 'p3', username: 'Gone', points: 40 },
          ],
        },
      }),
    );

    const results = screen.getByRole('region', { name: 'Round 1 results' });
    const rows = within(results).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Maya'),
      expect.stringContaining('Ryan'),
    ]);
    expect(within(rows[1]!).getByText('260 in all')).toBeInTheDocument();
  });

  it('shows no round results in the middle of a round', async () => {
    await renderSeated(
      drawAndGuessState({
        ...turn,
        phase: 'reveal',
        currentDrawer: 'p2',
        word: 'turtle',
      }),
    );
    expect(screen.queryByRole('region', { name: /results/ })).toBeNull();
  });

  it('shares first place in a tie', async () => {
    await renderSeated(
      drawAndGuessState({
        playerList: {
          p1: { username: 'Ryan', points: 414, isConnected: true },
          p2: { username: 'Maya', points: 414, isConnected: true },
          p3: { username: 'Sam', points: 90, isConnected: true },
        },
        lastGame: {
          endedEarly: false,
          standings: [
            { playerId: 'p1', username: 'Ryan', points: 414 },
            { playerId: 'p2', username: 'Maya', points: 414 },
            { playerId: 'p3', username: 'Sam', points: 90 },
          ],
          wordCategory: 'Food',
          rounds: 2,
          turns: 6,
        },
      }),
    );
    expect(
      screen.getByRole('heading', {
        name: 'You tie with Maya on 414 points.',
      }),
    ).toBeInTheDocument();
    const places = within(screen.getByRole('list', { name: 'Standings' }))
      .getAllByRole('listitem')
      .filter((item) => item.parentElement?.tagName === 'OL')
      .map((item) => item.textContent);
    expect(places).toEqual([
      expect.stringMatching(/^1.*Ryan.*Winner/),
      expect.stringMatching(/^1.*Maya.*Winner/),
      expect.stringMatching(/^3.*Sam.*3rd place/),
    ]);
  });

  describe('on a phone', () => {
    it('takes a guess under the board', async () => {
      onPhone();
      await renderSeated(
        drawAndGuessState({
          ...turn,
          phase: 'drawing',
          currentDrawer: 'p2',
          hint: '______',
        }),
      );
      expect(board().getByText('6 letters')).toBeInTheDocument();
      expect(board().getByRole('textbox', { name: 'Guess' })).toBeEnabled();
    });

    it('keeps the locked input under the board through the review', async () => {
      onPhone();
      await renderSeated(
        drawAndGuessState({
          ...turn,
          phase: 'reveal',
          currentDrawer: 'p2',
          word: 'turtle',
          scoredThisTurn: [ME],
          turnPoints: { [ME]: 120, p2: 48 },
        }),
      );
      expect(board().getByRole('textbox', { name: 'Message' })).toHaveAttribute(
        'placeholder',
        'You got it. Chat opens next turn.',
      );
    });

    it('shows the newest guesses under the board, the viewer’s own lit as it lands', async () => {
      onPhone();
      const { fake } = await renderSeated(
        drawAndGuessState({
          ...turn,
          phase: 'drawing',
          currentDrawer: 'p2',
          hint: '______',
        }),
      );
      act(() => {
        fake.serverEmits('chat:message', 'r1', {
          id: 1,
          kind: 'divider',
          notice: { type: 'dg:turn', round: 1, drawer: 'Maya' },
        });
        for (const [id, playerId, username, text] of [
          [2, 'p3', 'Sam', 'cat'],
          [3, 'p3', 'Sam', 'dog'],
          [4, ME, 'Ryan', 'turtl'],
        ] as const) {
          fake.serverEmits('chat:message', 'r1', {
            id,
            kind: 'player',
            playerId,
            username,
            text,
          });
        }
      });

      const lines = within(board().getByRole('log', { name: 'Chat' }))
        .getAllByRole('listitem')
        .map((line) => line.textContent);
      expect(lines).toEqual(['Samcat', 'Samdog', 'Ryan (you)turtl']);
      const mine = board().getByText('turtl').closest('li')!;
      expect(mine.className).toMatch(/flash/);
      expect(board().getByText('dog').closest('li')!.className).not.toMatch(
        /flash/,
      );
      // Read on the board, so the Chat tab has nothing new to mark.
      expect(screen.getByRole('tab', { name: 'Chat' })).toBeInTheDocument();
    });

    it('tells a spectator their chat stays in the stands while the word is drawn', async () => {
      onPhone();
      await renderSeated(
        drawAndGuessState({
          ...turn,
          phase: 'drawing',
          currentDrawer: 'p2',
          hint: '______',
          playerList: {
            p2: { username: 'Maya', points: 0, isConnected: true },
            p3: { username: 'Sam', points: 0, isConnected: true },
          },
          spectators: { [ME]: { username: 'Ryan', isConnected: true } },
        }),
      );
      expect(board().getByRole('textbox')).toHaveAttribute(
        'placeholder',
        'Only spectators see this…',
      );
    });

    it('gives the drawer no input under the board', async () => {
      onPhone();
      await renderSeated(
        drawAndGuessState({
          ...turn,
          phase: 'drawing',
          currentDrawer: ME,
          word: 'turtle',
          hint: '______',
        }),
      );
      expect(board().queryByRole('textbox')).toBeNull();
    });
  });
});
