import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../tests/render-app';

vi.mock('./how-to-play', () => ({
  default: () => {
    throw new Error('The page broke');
  },
}));

describe('a page that throws', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a way back in, in the frame, instead of a blank screen', async () => {
    // React and the page both report the error, which is the point.
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
    await renderApp('/how-to-play');

    expect(
      screen.getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Main' }),
    ).toBeInTheDocument();
    expect(reported).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'The page broke' }),
    );
  });
});
