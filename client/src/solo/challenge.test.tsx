import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from '../i18n';
import { ChallengeButton, ChallengeCard } from './challenge';

const link = 'https://zumpo.test/games/pairs/solo?seed=123';

beforeEach(() => {
  localStorage.setItem('zumpo:locale', 'zh');
});

describe('a solo challenge in Chinese', () => {
  it('copies the challenge link and confirms it in the player’s language', async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <ChallengeButton link={link} />
      </LocaleProvider>,
    );
    await user.click(screen.getByRole('button', { name: '挑战好友' }));
    expect(await navigator.clipboard.readText()).toBe(link);
    expect(
      screen.getByRole('button', { name: '链接已复制' }),
    ).toBeInTheDocument();
  });

  it('labels the challenge card and copy action in Chinese', () => {
    render(
      <LocaleProvider>
        <ChallengeCard description="好友会拿到相同的棋盘。" link={link} />
      </LocaleProvider>,
    );
    const card = screen.getByRole('region', { name: '挑战好友' });
    expect(
      within(card).getByText('好友会拿到相同的棋盘。'),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole('button', { name: '复制挑战链接' }),
    ).toBeInTheDocument();
  });
});
