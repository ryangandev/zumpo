import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUGGESTION_COUNT } from '../../../shared/doodle-chain';
import { renderApp } from '../tests/render-app';
import { en } from './en';
import { detectLocale } from './locale';
import { zh } from './zh';

/** Every leaf's path, so two catalogs can be compared key for key. */
function leaves(value: unknown, path = ''): Map<string, unknown> {
  const found = new Map<string, unknown>();
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      for (const [leaf, leafValue] of leaves(child, `${path}${key}.`)) {
        found.set(leaf, leafValue);
      }
    }
  } else {
    found.set(path.slice(0, -1), value);
  }
  return found;
}

/** A leaf's shape: its type, and its length for a list. */
const shape = (value: unknown) =>
  Array.isArray(value) ? `list of ${value.length}` : typeof value;

const shapes = (catalog: Map<string, unknown>) =>
  [...catalog].map(([key, value]) => `${key}: ${shape(value)}`).toSorted();

describe('the catalogs', () => {
  const english = leaves(en);
  const chinese = leaves(zh);

  it('have the same keys, so no language falls behind', () => {
    expect([...chinese.keys()].toSorted()).toEqual(
      [...english.keys()].toSorted(),
    );
  });

  it('agree on what is a message, a list and a function', () => {
    expect(shapes(chinese)).toEqual(shapes(english));
  });

  it('leave nothing blank', () => {
    const blank = [...chinese]
      .filter(([, value]) =>
        Array.isArray(value) ? value.some((item) => item === '') : value === '',
      )
      .map(([key]) => key);
    expect(blank).toEqual([]);
  });

  it('suggest the same number of Doodle Chain lines as the server picks from', () => {
    expect(en.doodleChain.suggestions).toHaveLength(SUGGESTION_COUNT);
    expect(zh.doodleChain.suggestions).toHaveLength(SUGGESTION_COUNT);
  });
});

describe('the language', () => {
  it('follows the browser on a first visit', () => {
    expect(detectLocale(['zh-CN', 'en-US'])).toBe('zh');
    expect(detectLocale(['ja', 'zh-Hant-TW'])).toBe('zh');
    expect(detectLocale(['en-GB'])).toBe('en');
    expect(detectLocale(['fr'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });

  it('is English in a browser that speaks it', async () => {
    await renderApp('/');
    expect(document.documentElement.lang).toBe('en');
    expect(
      screen.getByRole('heading', { level: 1, name: /A little play/ }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'How to play' })).toBeVisible();
  });
});

describe('the language switch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem('zumpo:locale');
  });

  it('turns every page Chinese and remembers it', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/');
    const languages = screen.getByRole('radiogroup', { name: 'Language' });
    expect(
      screen.getByRole('radio', { name: 'English', checked: true }),
    ).toBeVisible();

    await user.click(screen.getByRole('radio', { name: '中文' }));
    expect(localStorage.getItem('zumpo:locale')).toBe('zh');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(languages).toHaveAccessibleName('语言');
    expect(
      screen.getByRole('radio', { name: '中文', checked: true }),
    ).toBeVisible();
    expect(
      screen.getByRole('heading', { level: 1, name: /玩一会儿/ }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: '玩法' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '你画我猜' })).toBeVisible();

    // The choice outlives the page, and so does the English the test began in.
    await user.click(screen.getByRole('link', { name: '玩法' }));
    expect(router.state.location.pathname).toBe('/how-to-play');
    expect(
      screen.getByRole('heading', { level: 1, name: /一学就会/ }),
    ).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'English' }));
    expect(localStorage.getItem('zumpo:locale')).toBe('en');
    expect(
      screen.getByRole('heading', { level: 1, name: /Easy to learn/ }),
    ).toBeVisible();
  });

  it('opens Chinese for a visitor who chose it', async () => {
    await renderApp('/how-to-play', { locale: 'zh' });
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(screen.getByRole('heading', { name: '扫雷' })).toBeVisible();
    expect(screen.getAllByRole('link', { name: '找房间' })).toHaveLength(9);
  });
});
