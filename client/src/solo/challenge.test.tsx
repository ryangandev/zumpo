import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from '../i18n';
import { ChallengeCard } from './challenge';

const link = 'https://zumpo.test/games/pairs/solo?seed=123';

beforeEach(() => {
  localStorage.setItem('zumpo:locale', 'zh');
});

describe('a solo challenge in Chinese', () => {
  it('labels the challenge card and copy action in Chinese', () => {
    render(
      <LocaleProvider>
        <ChallengeCard description="朋友会拿到相同的棋盘。" text={link} />
      </LocaleProvider>,
    );
    const card = screen.getByRole('region', { name: '挑战朋友' });
    expect(
      within(card).getByText('朋友会拿到相同的棋盘。'),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole('button', { name: '复制挑战链接' }),
    ).toBeInTheDocument();
  });

  it('copies the challenge and confirms it in the player’s language', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <ChallengeCard description="朋友会拿到相同的棋盘。" text={link} />
      </LocaleProvider>,
    );
    await user.click(screen.getByRole('button', { name: '复制挑战链接' }));
    expect(await navigator.clipboard.readText()).toBe(link);
    expect(
      screen.getByRole('button', { name: '链接已复制' }),
    ).toBeInTheDocument();
  });
});
