import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type {
  CodeBreakerBoard,
  CodeBreakerRoomState,
} from '../../../shared/wire-types';
import { codeBreakerState, ME } from '../tests/fixtures';
import { onPhone } from '../tests/phone';
import { renderSeated } from '../tests/seated';
import { renderApp } from '../tests/render-app';
import { FakeSocket } from '../tests/fake-socket';

const board = (
  playerId: string,
  username: string,
  overrides: Partial<CodeBreakerBoard> = {},
): CodeBreakerBoard => ({
  playerId,
  username,
  rows: [],
  status: 'guessing',
  points: 0,
  secondsLeft: 0,
  ...overrides,
});

const CRACKED = { right: 4, moved: 0 };

const guessing = (boards: CodeBreakerBoard[]): CodeBreakerRoomState =>
  codeBreakerState({
    isGameStarted: true,
    phase: 'guessing',
    round: 1,
    phaseEndsInMs: 100_000,
    boards,
  });

const start = guessing([
  board(ME, 'Ryan'),
  board('p2', 'Maya', {
    rows: [{ guess: null, mark: { right: 1, moved: 0 } }],
  }),
]);

/** The codes the app asked the server to take. */
const guesses = (fake: { requests: { event: string; args: unknown[] }[] }) =>
  fake.requests
    .filter((request) => request.event === 'cb:guess')
    .map((request) => request.args);

const turn = () => within(screen.getByRole('region', { name: 'Turn' }));
const mine = () => screen.getByRole('group', { name: 'Your guesses' });
const rows = () =>
  within(mine())
    .queryAllByRole('img')
    .map((row) => row.getAttribute('aria-label'));

describe('a Code Breaker room', () => {
  it('shows each player’s guesses in a phone’s standings strip, not their 0 points', async () => {
    onPhone();
    const row = { guess: null, mark: { right: 1, moved: 0 } };
    await renderSeated(
      guessing([
        board(ME, 'Ryan', { rows: [row, row, row] }),
        board('p2', 'Maya', {
          rows: Array.from({ length: 10 }, () => row),
          status: 'out',
        }),
      ]),
    );
    expect(
      await screen.findByRole('button', { name: /^Standings:/ }),
    ).toHaveAccessibleName(
      'Standings: You 3/10, Maya missed 10/10. Show the players',
    );
  });

  it('lets the host start once two players are in', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(codeBreakerState());
    fake.answer('game:start', () => ({ ok: true as const }));

    expect(
      await screen.findByText(/^2 players, 3 codes\. Everyone cracks/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start game' }));
    expect(fake.requests.at(-1)).toEqual({ event: 'game:start', args: ['r1'] });
  });

  it('starts with the focus on the board, not on a key Enter would press', async () => {
    const user = userEvent.setup();
    const { update } = await renderSeated(codeBreakerState());

    update(start);
    expect(
      await screen.findByRole('group', { name: 'Your guesses' }),
    ).toHaveFocus();
    await user.keyboard(' {Enter}');
    expect(screen.getByRole('button', { name: 'Notes' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await user.keyboard('1');
    expect(rows()).toEqual(['1']);
  });

  it('types from the keyboard and sends a guess only once it can count', async () => {
    const user = userEvent.setup();
    const { fake } = await renderSeated(start);
    fake.answer('cb:guess', () => ({ ok: true as const }));
    await screen.findByRole('group', { name: 'Your guesses' });
    expect(turn().getByText('Crack the code')).toBeInTheDocument();

    // A digit already in the row is not typed again.
    await user.keyboard('122');
    expect(rows()).toEqual(['1 2']);
    await user.keyboard('{Enter}');
    expect(screen.getByText('Four digits, please')).toBeInTheDocument();
    expect(guesses(fake)).toEqual([]);

    await user.keyboard('34{Enter}');
    expect(guesses(fake)).toEqual([['r1', '1234']]);
    // Taken: the row is clear for the next guess.
    expect(rows()).toEqual([]);
  });

  it('shows the others’ pegs, never their digits', async () => {
    await renderSeated(start);
    const hers = await screen.findByRole('group', { name: 'Maya’s board' });
    expect(
      within(hers)
        .getAllByRole('img')
        .map((row) => row.getAttribute('aria-label')),
    ).toEqual(['1 in place, 0 elsewhere']);
    expect(screen.getByText('1 guess')).toBeInTheDocument();
  });

  it('says how to read the pegs beside the board', async () => {
    await renderSeated(start);
    const legend = await screen.findByRole('region', {
      name: 'How to read it',
    });
    expect(
      within(legend).getByText('Right digit, right place'),
    ).toBeInTheDocument();
    expect(within(legend).getByText('Not in the code')).toBeInTheDocument();
    expect(turn().getByText('Fewer guesses score more')).toBeInTheDocument();
  });

  it('says how to read the pegs in a phone’s turn bar until your board is done', async () => {
    onPhone();
    const { update } = await renderSeated(start);
    await screen.findByRole('group', { name: 'Your guesses' });
    expect(
      turn().getByText('Green: in place. Coral: somewhere else.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'How to read it' })).toBeNull();

    update(
      guessing([
        board(ME, 'Ryan'),
        board('p2', 'Maya', {
          rows: [{ guess: null, mark: CRACKED }],
          status: 'cracked',
        }),
      ]),
    );
    // Somebody else cracking it does not take the legend away.
    expect(
      turn().getByText('Green: in place. Coral: somewhere else.'),
    ).toBeInTheDocument();

    update(
      guessing([
        board(ME, 'Ryan', {
          rows: [{ guess: '4071', mark: CRACKED }],
          status: 'cracked',
          points: 1018,
        }),
        board('p2', 'Maya'),
      ]),
    );
    expect(
      turn().queryByText('Green: in place. Coral: somewhere else.'),
    ).toBeNull();
  });

  it('says how to read the pegs in a phone spectator’s turn bar too', async () => {
    onPhone();
    await renderSeated({
      ...guessing([
        board('p2', 'Maya', {
          rows: [{ guess: null, mark: CRACKED }],
          status: 'cracked',
        }),
        board('p3', 'Leo'),
      ]),
      playerList: {
        p2: { username: 'Maya', points: 0, isConnected: true },
        p3: { username: 'Leo', points: 0, isConnected: true },
      },
      spectators: { [ME]: { username: 'Ryan', isConnected: true } },
    });
    await screen.findByRole('region', { name: 'Turn' });
    // A spectator reads boards of marks alone too, even once one is cracked.
    expect(
      turn().getByText('Green: in place. Coral: somewhere else.'),
    ).toBeInTheDocument();
  });

  it('quiets a cracker’s chat until the reveal', async () => {
    await renderSeated(
      guessing([
        board(ME, 'Ryan', {
          rows: [
            { guess: '1234', mark: { right: 0, moved: 2 } },
            { guess: '4071', mark: CRACKED },
          ],
          status: 'cracked',
          points: 1018,
        }),
        board('p2', 'Maya'),
      ]),
    );
    expect(
      await screen.findByText('Cracked it in 2! +1018', { exact: false }),
    ).toBeInTheDocument();
    expect(turn().getByText('Waiting for Maya')).toBeInTheDocument();
    expect(
      screen.getByText('You cracked it. Watch the others until the reveal.'),
    ).toBeInTheDocument();
    const message = screen.getByRole('textbox', { name: 'Message' });
    expect(message).toBeDisabled();
    expect(message).toHaveAttribute(
      'placeholder',
      'You cracked it. Chat opens after the reveal.',
    );
    expect(
      screen.queryByRole('group', { name: 'Digit pad' }),
    ).not.toBeInTheDocument();
  });

  it('reveals the code and everybody’s digits', async () => {
    await renderSeated(
      codeBreakerState({
        isGameStarted: true,
        phase: 'reveal',
        round: 1,
        phaseEndsInMs: 8_000,
        lastRound: {
          code: '4071',
          boards: [
            board('p2', 'Maya', {
              rows: [{ guess: '4071', mark: CRACKED }],
              status: 'cracked',
              points: 1050,
            }),
            board(ME, 'Ryan', { status: 'out' }),
          ],
        },
      }),
    );
    expect(await turn().findByText('4071')).toBeInTheDocument();
    expect(
      turn().getByText('You did not crack it this time'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Code 1 results' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Cracked in 1 · +1050')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Maya’s board' })).getByRole(
        'img',
        { name: '4 0 7 1: 4 in place, 0 elsewhere' },
      ),
    ).toBeInTheDocument();
    // A finished board draws only the rows played, or one empty row.
    expect(
      screen.getByRole('group', { name: 'Maya’s board' }).children,
    ).toHaveLength(1);
  });

  it('counts the codes each player cracked at the end', async () => {
    await renderSeated(
      codeBreakerState({
        lastGame: {
          endedEarly: false,
          rounds: 3,
          cracked: { p2: 3, [ME]: 1 },
          standings: [
            { playerId: 'p2', username: 'Maya', points: 1683 },
            { playerId: ME, username: 'Ryan', points: 518 },
          ],
        },
        lastRound: { code: '5869', boards: [] },
      }),
    );
    const standings = await screen.findByRole('list', { name: 'Standings' });
    expect(within(standings).getByText(/3 codes cracked/)).toBeInTheDocument();
    expect(within(standings).getByText(/1 code cracked/)).toBeInTheDocument();
    expect(screen.getByText('The code was 5869.')).toBeInTheDocument();
  });

  it('keeps a typed row and the notes while a phone player checks the race', async () => {
    onPhone();
    const user = userEvent.setup();
    await renderSeated(start);
    await screen.findByRole('group', { name: 'Your guesses' });

    await user.keyboard('407');
    await user.click(screen.getByRole('button', { name: 'Notes' }));
    await user.click(screen.getByRole('button', { name: '9' }));
    await user.click(screen.getByRole('tab', { name: /Players/ }));
    expect(
      screen.getByRole('group', { name: 'Maya’s board' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Game' }));
    expect(
      screen.getByRole('button', { name: '9, noted out of the code' }),
    ).toBeInTheDocument();
    // Notes is off again on a fresh board, so the digit typed after the tab
    // goes into the row.
    await user.keyboard('1');
    expect(rows()).toEqual(['4 0 7 1']);
  });
});

describe('a Code Breaker room in Chinese', () => {
  it('translates validation and rejection without showing server diagnostics', async () => {
    const user = userEvent.setup();
    const fake = new FakeSocket();
    fake.answer('room:sync', () => ({ ok: true as const }));
    fake.answer('cb:guess', () => ({
      ok: false as const,
      error: {
        type: 'invalidRequest' as const,
        message: 'An English server diagnostic.',
      },
    }));
    await renderApp('/games/code-breaker/rooms/r1', { locale: 'zh', fake });
    act(() => fake.serverEmits('room:state', start));
    expect(screen.getByRole('heading', { name: '其他玩家' })).toBeVisible();
    await user.keyboard('123{Enter}');
    expect(screen.getByText('请输入四个数字')).toBeVisible();
    expect(guesses(fake)).toEqual([]);
    await user.keyboard('4{Enter}');
    expect(
      await screen.findByText('这次猜测没能送达房间，请再试一次。'),
    ).toBeVisible();
    expect(screen.queryByText('An English server diagnostic.')).toBeNull();
    expect(guesses(fake)).toEqual([['r1', '1234']]);
  });
});
