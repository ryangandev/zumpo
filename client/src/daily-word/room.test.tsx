import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type {
  DailyWordBoard,
  DailyWordRoomState,
} from '../../../shared/wire-types';
import { dailyWordState, ME } from '../tests/fixtures';
import { onPhone } from '../tests/phone';
import { renderSeated } from '../tests/seated';
import { renderApp } from '../tests/render-app';
import { FakeSocket } from '../tests/fake-socket';

const board = (
  playerId: string,
  username: string,
  overrides: Partial<DailyWordBoard> = {},
): DailyWordBoard => ({
  playerId,
  username,
  rows: [],
  status: 'guessing',
  points: 0,
  secondsLeft: 0,
  ...overrides,
});

const SLATE = {
  word: 'slate',
  marks: ['correct', 'absent', 'absent', 'correct', 'absent'] as const,
};

const guessing = (boards: DailyWordBoard[]): DailyWordRoomState =>
  dailyWordState({
    isGameStarted: true,
    phase: 'guessing',
    round: 1,
    phaseEndsInMs: 100_000,
    boards,
  });

const start = guessing([
  board(ME, 'Ryan'),
  board('p2', 'Maya', {
    rows: [{ word: null, marks: [...SLATE.marks] }],
  }),
]);

/** The words the app asked the server to take. */
const guesses = (fake: { requests: { event: string; args: unknown[] }[] }) =>
  fake.requests
    .filter((request) => request.event === 'dw:guess')
    .map((request) => request.args);

const turn = () => within(screen.getByRole('region', { name: 'Turn' }));
const mine = () => screen.getByRole('group', { name: 'Your guesses' });

describe('a Daily Word room', () => {
  it('lets the host start once two players are in', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(dailyWordState());
    fake.answer('game:start', () => ({ ok: true as const }));

    expect(
      await screen.findByText(/^2 players, 3 words\. Everyone guesses/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(fake.requests.at(-1)).toEqual({ event: 'game:start', args: ['r1'] });
  });

  it('types from the keyboard and sends a word only once it can count', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(start);
    fake.answer('dw:guess', () => ({ ok: true as const }));
    await screen.findByRole('group', { name: 'Your guesses' });
    expect(turn().getByText('Find the word')).toBeInTheDocument();

    await user.keyboard('sla');
    expect(
      within(mine())
        .getAllByRole('img')
        .map((tile) => tile.getAttribute('aria-label')),
    ).toEqual(['S', 'L', 'A']);
    await user.keyboard('{Enter}');
    expect(screen.getByText('Not enough letters')).toBeInTheDocument();

    await user.keyboard('xx{Enter}');
    expect(screen.getByText('Not in the word list')).toBeInTheDocument();
    expect(guesses(fake)).toEqual([]);

    await user.keyboard('{Backspace}{Backspace}te{Enter}');
    expect(guesses(fake)).toEqual([['r1', 'slate']]);
    // Taken: the row is clear for the next word.
    expect(within(mine()).queryAllByRole('img')).toEqual([]);
  });

  it('shows the others’ marks, never their letters', async () => {
    await renderSeated(start);
    const hers = await screen.findByRole('group', { name: 'Maya’s board' });
    expect(
      within(hers)
        .getAllByRole('img')
        .map((tile) => tile.getAttribute('aria-label')),
    ).toEqual([
      'right place',
      'not in the word',
      'not in the word',
      'right place',
      'not in the word',
    ]);
    expect(screen.getByText('1 guess')).toBeInTheDocument();
  });

  it('quiets a finder’s chat until the reveal', async () => {
    await renderSeated(
      guessing([
        board(ME, 'Ryan', {
          rows: [
            { ...SLATE, marks: [...SLATE.marks] },
            { word: 'south', marks: Array(5).fill('correct') },
          ],
          status: 'found',
          points: 540,
        }),
        board('p2', 'Maya'),
      ]),
    );
    expect(
      await screen.findByText('Got it in 2! +540', { exact: false }),
    ).toBeInTheDocument();
    expect(turn().getByText('Waiting for Maya')).toBeInTheDocument();
    const message = screen.getByRole('textbox', { name: 'Message' });
    expect(message).toBeDisabled();
    expect(message).toHaveAttribute(
      'placeholder',
      'You got it. Chat opens after the reveal.',
    );
    expect(
      screen.queryByRole('group', { name: 'Keyboard' }),
    ).not.toBeInTheDocument();
  });

  it('reveals the word and everybody’s letters', async () => {
    await renderSeated(
      dailyWordState({
        isGameStarted: true,
        phase: 'reveal',
        round: 1,
        phaseEndsInMs: 8_000,
        lastRound: {
          word: 'south',
          boards: [
            board('p2', 'Maya', {
              rows: [{ word: 'south', marks: Array(5).fill('correct') }],
              status: 'found',
              points: 600,
            }),
            board(ME, 'Ryan', { status: 'out' }),
          ],
        },
      }),
    );
    expect(await turn().findByText('SOUTH')).toBeInTheDocument();
    expect(
      turn().getByText('You did not find it this time'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Word 1 results' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Found in 1 · +600')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Maya’s board' })).getByRole(
        'img',
        { name: 'S, right place' },
      ),
    ).toBeInTheDocument();
    // A finished board draws only the rows played, or one empty row.
    expect(
      screen.getByRole('group', { name: 'Maya’s board' }).children,
    ).toHaveLength(1);
    expect(
      screen.getByRole('group', { name: 'Ryan’s board' }).children,
    ).toHaveLength(1);
  });

  it('counts the words each player found at the end', async () => {
    await renderSeated(
      dailyWordState({
        lastGame: {
          endedEarly: false,
          rounds: 3,
          found: { p2: 3, [ME]: 1 },
          standings: [
            { playerId: 'p2', username: 'Maya', points: 1500 },
            { playerId: ME, username: 'Ryan', points: 420 },
          ],
        },
        lastRound: { word: 'south', boards: [] },
      }),
    );
    const standings = await screen.findByRole('list', { name: 'Standings' });
    expect(within(standings).getByText(/3 words found/)).toBeInTheDocument();
    expect(within(standings).getByText(/1 word found/)).toBeInTheDocument();
    expect(screen.getByText('The word was SOUTH.')).toBeInTheDocument();
  });

  it('keeps a typed row while a phone player checks the race', async () => {
    onPhone();
    const user = userEvent.setup();
    await renderSeated(start);
    await screen.findByRole('group', { name: 'Your guesses' });

    await user.keyboard('sla');
    await user.click(screen.getByRole('tab', { name: /Players/ }));
    expect(
      screen.getByRole('group', { name: 'Maya’s board' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Board' }));
    // The tab keeps the focus; the word typed after it is still the word.
    await user.keyboard('te{Enter}');
    expect(
      within(mine())
        .getAllByRole('img')
        .map((tile) => tile.getAttribute('aria-label')),
    ).toEqual(['S', 'L', 'A', 'T', 'E']);
  });
});

describe('a Daily Word room in Chinese', () => {
  it('translates validation and rejection without showing server diagnostics', async () => {
    const user = userEvent.setup();
    const fake = new FakeSocket();
    fake.answer('room:sync', () => ({ ok: true as const }));
    fake.answer('dw:guess', () => ({
      ok: false as const,
      error: {
        type: 'invalidRequest' as const,
        message: 'An English server diagnostic.',
      },
    }));
    await renderApp('/games/daily-word/rooms/r1', { locale: 'zh', fake });
    act(() => fake.serverEmits('room:state', start));
    expect(screen.getByRole('group', { name: 'Maya 的猜词板' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '其他玩家' })).toBeVisible();
    await user.keyboard('sla{Enter}');
    expect(screen.getByText('字母不够')).toBeVisible();
    expect(guesses(fake)).toEqual([]);
    await user.keyboard('te{Enter}');
    expect(
      await screen.findByText('猜词没能送达房间，请再试一次。'),
    ).toBeVisible();
    expect(screen.queryByText('An English server diagnostic.')).toBeNull();
    expect(guesses(fake)).toEqual([['r1', 'slate']]);
  });
});
