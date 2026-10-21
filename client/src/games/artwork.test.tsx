import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../tests/render-app';

describe('the games in Chinese', () => {
  it('draws Doodle Chain’s lines in the reader’s language', async () => {
    await renderApp('/games/doodle-chain', { locale: 'zh' });
    expect(screen.getByText('乌龟')).toBeInTheDocument();
    expect(screen.getByText('汉堡？')).toBeInTheDocument();
    expect(screen.queryByText('burger?')).toBeNull();
  });

  it('says up front that Draw & Guess’s words are English', async () => {
    await renderApp('/games/draw-and-guess', { locale: 'zh' });
    expect(
      screen.getByText('一人画，其他人抢着猜。词语都是英文。'),
    ).toBeInTheDocument();
    // The artwork's word is the English one a player would type.
    expect(screen.getByText('turtle')).toHaveAttribute('lang', 'en');
  });
});
