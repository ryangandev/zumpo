import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANSWERS,
  dailyAnswer,
  msUntilNextPuzzle,
  practiceAnswer,
  puzzleNumber,
} from '../../../../shared/daily-word';
import { onPhone } from '../../tests/phone';
import { renderApp } from '../../tests/render-app';
import { formatWait } from './solo-page';

// 9:00 on the first day of the calendar: Word #1.
const NOW = new Date(2026, 9, 5, 9, 0, 0);
const TODAY = dailyAnswer(puzzleNumber(NOW));
const SEED = 'k3f9x2';

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

/** Answers that are not `answer`, to miss it with. */
const misses = (answer: string, count: number) =>
  ANSWERS.filter((word) => word !== answer).slice(0, count);

async function guess(word: string) {
  await user.keyboard(`${word}{Enter}`);
}

describe('Daily Word on your own', () => {
  it('is today’s word, found and counted on this device', async () => {
    await renderApp('/games/daily-word/solo');
    expect(await turn().findByText('Find the word')).toBeInTheDocument();
    expect(screen.getByText('Word #1')).toBeInTheDocument();

    const [first] = misses(TODAY, 1);
    await guess(first!);
    expect(turn().getByText('Guess 2 of 6')).toBeInTheDocument();
    await guess(TODAY);

    expect(
      screen.getByRole('heading', { name: 'Found in 2.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `The word was ${TODAY.toUpperCase()}. That starts a streak.`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(formatWait(msUntilNextPuzzle(NOW))),
    ).toBeInTheDocument();
    const device = screen.getByRole('heading', { name: 'On this device' })
      .parentElement!.parentElement!;
    expect(within(device).getByText('100%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('turns away a word it does not know, without spending a guess', async () => {
    await renderApp('/games/daily-word/solo');
    await turn().findByText('Find the word');
    await guess('xxxxx');
    expect(screen.getByText('Not in the word list')).toBeInTheDocument();
    expect(turn().getByText('Find the word')).toBeInTheDocument();
  });

  it('remembers a finished day, and moves on at midnight', async () => {
    const view = await renderApp('/games/daily-word/solo');
    await turn().findByText('Find the word');
    for (const word of misses(TODAY, 6)) await guess(word);
    expect(
      screen.getByRole('heading', { name: 'Not this time.' }),
    ).toBeInTheDocument();
    view.unmount();

    await renderApp('/games/daily-word/solo');
    expect(
      await screen.findByRole('heading', { name: 'Not this time.' }),
    ).toBeInTheDocument();

    await act(() => vi.advanceTimersByTime(msUntilNextPuzzle(NOW) + 2_000));
    expect(await turn().findByText('Find the word')).toBeInTheDocument();
    expect(screen.getByText('Word #2')).toBeInTheDocument();
  });

  it('plays a challenge link’s word, then offers today’s', async () => {
    const answer = practiceAnswer(SEED);
    await renderApp(`/games/daily-word/solo?seed=${SEED}`);
    expect(await screen.findByText('A friend’s word')).toBeInTheDocument();
    await guess(answer);

    expect(
      screen.getByRole('heading', { name: 'Found in 1.' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `The word was ${answer.toUpperCase()}. Practice words keep no stats.`,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Today’s word' }));
    expect(await turn().findByText('Find the word')).toBeInTheDocument();
    expect(screen.getByText('Word #1')).toBeInTheDocument();
  });

  it('puts the cards under the board on a phone', async () => {
    onPhone();
    await renderApp('/games/daily-word/solo');
    await turn().findByText('Find the word');
    await guess(TODAY);
    const board = screen.getByRole('group', { name: 'Your guesses' });
    const device = screen.getByRole('heading', { name: 'On this device' });
    expect(
      board.compareDocumentPosition(device) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('formatWait', () => {
  it('reads as hours, minutes and seconds, rounded up', () => {
    expect(formatWait(0)).toBe('0:00:00');
    expect(formatWait(1)).toBe('0:00:01');
    expect(formatWait((9 * 3600 + 41 * 60 + 18) * 1000)).toBe('9:41:18');
  });
});

describe('Daily Word on your own in Chinese', () => {
  it('translates errors, results, statistics and copied shares while keeping the word English', async () => {
    await renderApp('/games/daily-word/solo', { locale: 'zh' });
    const bar = within(screen.getByRole('region', { name: '当前回合' }));
    expect(await bar.findByText('猜出单词')).toBeVisible();
    expect(screen.getByText('单词 #1')).toBeVisible();
    expect(screen.getByRole('heading', { name: '怎么看标记' })).toBeVisible();
    expect(screen.getByRole('group', { name: '你的猜词' })).toBeVisible();
    await guess('xxxxx');
    expect(screen.getByText('词库里没有这个词')).toBeVisible();
    await user.keyboard(
      '{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}',
    );
    await guess(TODAY);
    expect(screen.getByRole('heading', { name: '1 次猜中。' })).toBeVisible();
    expect(
      screen.getByText(`答案是 ${TODAY.toUpperCase()}。连胜开始了。`),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: '本机记录' })).toBeVisible();
    expect(screen.getByText('猜中率')).toBeVisible();
    expect(screen.getByText('当前连胜')).toBeVisible();
    expect(screen.getByText('距下一个单词')).toBeVisible();
    expect(screen.getByLabelText('1 个单词用 1 次猜中')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '分享' }));
    expect(await screen.findByRole('button', { name: '已复制' })).toBeVisible();
    expect(await navigator.clipboard.readText()).toContain('每日单词 #1 1/6');
  });
});
