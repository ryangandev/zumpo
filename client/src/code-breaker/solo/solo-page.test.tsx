import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALL_CODES,
  dailyCode,
  practiceCode,
  puzzleNumber,
} from '../../../../shared/code-breaker';
import { onPhone } from '../../tests/phone';
import { renderApp } from '../../tests/render-app';

// 9:00 on the first day of the calendar: Code #1.
const NOW = new Date(2026, 9, 21, 9, 0, 0);
const TODAY = dailyCode(puzzleNumber(NOW));
const SEED = 'k3f9x2';
const PAGE = '/games/code-breaker/solo';

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
});

afterEach(() => {
  vi.useRealTimers();
});

const turn = () => within(screen.getByRole('region', { name: 'Turn' }));
const mine = () => screen.getByRole('group', { name: 'Your guesses' });
const rows = () =>
  within(mine())
    .queryAllByRole('img')
    .map((row) => row.getAttribute('aria-label'));

/** Codes that share no digit with `code`, to miss it with. */
const strangers = (code: string) =>
  ALL_CODES.filter((other) => [...other].every((d) => !code.includes(d)));

async function guess(code: string) {
  await user.keyboard(`${code}{Enter}`);
}

describe('Code Breaker on your own', () => {
  it('is today’s code, cracked and counted on this device', async () => {
    const first = await renderApp(PAGE);
    expect(await turn().findByText('Crack the code')).toBeInTheDocument();
    expect(screen.getByText('Code #1')).toBeInTheDocument();
    expect(
      screen.getByText('Type four different digits, then press Enter.'),
    ).toBeInTheDocument();

    const [miss] = strangers(TODAY);
    await guess(miss!);
    expect(rows()).toEqual([
      `${[...miss!].join(' ')}: 0 in place, 0 elsewhere`,
    ]);
    // What the marks settle on their face, and no more.
    expect(
      turn().getByText(
        `One guess in. ${[...miss!].join(', ').replace(/, (?=\d$)/, ' and ')} are out.`,
      ),
    ).toBeInTheDocument();
    // The pad dims them, and they still type.
    for (const digit of miss!) {
      expect(
        screen.getByRole('button', { name: `${digit}, not in the code` }),
      ).toBeInTheDocument();
    }
    const kept = [...'0123456789'].find((digit) => !miss!.includes(digit))!;
    expect(screen.getByRole('button', { name: kept })).toBeInTheDocument();

    // A refresh keeps the guesses.
    first.unmount();
    await renderApp(PAGE);
    expect(await turn().findByText('Guess 2 of 10')).toBeInTheDocument();
    await guess(TODAY);
    expect(
      screen.getByRole('heading', { name: 'Cracked in 2.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`The code was ${TODAY}. That starts a streak.`),
    ).toBeInTheDocument();
    const device = screen.getByRole('heading', { name: 'On this device' })
      .parentElement!.parentElement!;
    expect(within(device).getByText('100%')).toBeInTheDocument();
    expect(screen.getByLabelText('1 cracked in 1–4')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('keeps the board it was played on, and its panel, through the last guess', async () => {
    await renderApp(PAGE);
    await turn().findByText('Crack the code');
    const board = mine();
    const panel =
      board.closest('[data-play-board]')!.parentElement!.parentElement!;
    const [miss] = strangers(TODAY);
    await guess(miss!);
    expect(
      screen.getByRole('group', { name: 'Digit pad' }),
    ).toBeInTheDocument();
    await guess(TODAY);

    expect(
      screen.getByRole('heading', { name: 'Cracked in 2.' }),
    ).toBeInTheDocument();
    // The same nodes, not a finished copy: nothing moves or resizes.
    expect(mine()).toBe(board);
    expect(panel.isConnected).toBe(true);
    expect(panel.contains(board)).toBe(true);
    expect(screen.queryByRole('group', { name: 'Digit pad' })).toBeNull();
  });

  it('never types a digit twice, and turns back a row it cannot use', async () => {
    await renderApp(PAGE);
    await turn().findByText('Crack the code');
    await user.keyboard('11');
    expect(rows()).toEqual(['1']);
    await user.keyboard('2{Enter}');
    expect(screen.getByText('Four digits, please')).toBeInTheDocument();
    expect(turn().getByText('Fix the row and try again')).toBeInTheDocument();

    const [miss] = strangers(TODAY);
    await user.keyboard('{Backspace}{Backspace}{Backspace}');
    await guess(miss!);
    await guess(miss!);
    expect(screen.getByText('Already guessed')).toBeInTheDocument();
    expect(turn().getByText('Guess 2 of 10')).toBeInTheDocument();
  });

  it('keeps notes on the pad, and today’s across a refresh', async () => {
    const first = await renderApp(PAGE);
    await turn().findByText('Crack the code');
    await user.click(screen.getByRole('button', { name: 'Notes' }));
    expect(
      screen.getByText(
        'Notes on: a digit key marks it out, then in, then clears it.',
      ),
    ).toBeInTheDocument();
    await user.keyboard('5');
    expect(
      screen.getByRole('button', { name: '5, noted out of the code' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '6' }));
    await user.click(
      screen.getByRole('button', { name: '6, noted out of the code' }),
    );
    // Noted, not typed.
    expect(rows()).toEqual([]);

    first.unmount();
    await renderApp(PAGE);
    await turn().findByText('Crack the code');
    expect(
      screen.getByRole('button', { name: '5, noted out of the code' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '6, noted in the code' }),
    ).toBeInTheDocument();
    // With Notes off, a noted digit still types.
    await user.keyboard('5');
    expect(rows()).toEqual(['5']);
  });

  it('plays a challenge link’s code, then offers today’s', async () => {
    const code = practiceCode(SEED);
    await renderApp(`${PAGE}?seed=${SEED}`);
    expect(await screen.findByText('A friend’s code')).toBeInTheDocument();
    await guess(code);

    expect(
      screen.getByRole('heading', { name: 'Cracked in 1.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`The code was ${code}. Practice codes keep no stats.`),
    ).toBeInTheDocument();
    expect(turn().getByText(`You cracked ${code}`)).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Your pegs' }),
    ).toBeInTheDocument();
    // One way to challenge a friend.
    expect(screen.getAllByRole('button', { name: /challenge/i })).toHaveLength(
      1,
    );
    await user.click(
      screen.getByRole('button', { name: 'Copy challenge link' }),
    );
    expect(await navigator.clipboard.readText()).toContain(`?seed=${SEED}`);
    await user.click(screen.getByRole('button', { name: 'Today’s code' }));
    expect(await turn().findByText('Crack the code')).toBeInTheDocument();
    expect(screen.getByText('Code #1')).toBeInTheDocument();
  });

  it('reads the pegs in the bar, and puts the cards under the board, on a phone', async () => {
    onPhone();
    await renderApp(PAGE);
    expect(
      await turn().findByText('Green: in place. Coral: somewhere else.'),
    ).toBeInTheDocument();
    await guess(TODAY);
    expect(turn().getByText(`You cracked ${TODAY}`)).toBeInTheDocument();
    const board = screen.getByRole('group', { name: 'Your guesses' });
    const device = screen.getByRole('heading', { name: 'On this device' });
    expect(
      board.compareDocumentPosition(device) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
