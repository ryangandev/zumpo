import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cardName, findTrios, isTrio } from '../../../../shared/trios';
import { onPhone } from '../../tests/phone';
import { renderApp } from '../../tests/render-app';
import {
  afterFlash,
  FLASH_MS,
  newRun,
  pick,
  RUN_TRIOS,
  type SoloRun,
} from './run';

const SEED = 'k3f9x2';

const turn = () => within(screen.getByRole('region', { name: 'Turn' }));
const table = () => within(screen.getByRole('group', { name: 'Table' }));
/** The cards on the table, in their places. */
const places = () => table().getAllByRole('button');
/** A value on the side's This run card. */
const stat = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
const chineseCards = () =>
  within(screen.getByRole('group', { name: '牌桌' })).getAllByRole('button');

let user: ReturnType<typeof userEvent.setup>;
/** The run as the page plays it, to know where the trios are. */
let model: SoloRun;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  model = newRun(SEED, 0);
});

afterEach(() => {
  vi.useRealTimers();
});

const pause = (ms: number) => act(() => vi.advanceTimersByTime(ms));

/** Picks the cards at `chosen`, on the page and in the model. */
async function pickPlaces(chosen: readonly number[]) {
  for (const place of chosen) {
    await user.click(places()[place]!);
    model = pick(model, place, 0);
  }
}

/** Finds the first trio on the table, and waits for the next cards. */
async function findTrio() {
  await pickPlaces(findTrios(model.deal.table)[0]!);
  await pause(FLASH_MS);
  model = afterFlash(model, 0);
}

/** Plays the run `SEED` deals. */
const startRun = () => renderApp(`/games/trios/solo?seed=${SEED}`);

describe('Trios on your own', () => {
  it('runs in Chinese with localized cards, hints and penalty explanations', async () => {
    await renderApp(`/games/trios/solo?seed=${SEED}`, { locale: 'zh' });
    expect(screen.getByText('挑战')).toBeInTheDocument();
    expect(screen.getByText('怎样算一组')).toBeInTheDocument();
    const bar = within(screen.getByRole('region', { name: '当前回合' }));
    expect(bar.getByText('第 1 / 10 组')).toBeInTheDocument();
    expect(bar.getByText('找出一组')).toBeInTheDocument();
    expect(chineseCards()).toHaveLength(12);
    expect(chineseCards()[0]).toHaveAccessibleName(/^[123] 个/);
    const t = model.deal.table;
    const third = t.findIndex((_, c) => c > 1 && !isTrio(t[0]!, t[1]!, t[c]!));
    await user.click(chineseCards()[0]!);
    await user.click(chineseCards()[1]!);
    await user.click(chineseCards()[third]!);
    expect(bar.getByText('不成一组，+5 秒')).toBeInTheDocument();
    expect(bar.getByText(/^其中 2 张/)).toBeInTheDocument();
    await pause(FLASH_MS);
    await user.click(screen.getByRole('button', { name: '提示，+10 秒' }));
    expect(
      chineseCards().filter((card) =>
        (card.getAttribute('aria-label') ?? '').endsWith('，提示'),
      ),
    ).toHaveLength(1);
  });

  it('is offered on the game’s page', async () => {
    await renderApp('/games/trios');
    expect(screen.getByRole('link', { name: 'Play solo' })).toHaveAttribute(
      'href',
      '/games/trios/solo',
    );
  });

  it('deals at once on a first visit, with a trio to learn from', async () => {
    const { router } = await renderApp('/games/trios/solo', {
      firstVisit: true,
    });
    expect(router.state.location.pathname).toBe('/games/trios/solo');
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(screen.getByText('Not yet')).toBeInTheDocument();
    expect(screen.getByText('What makes a trio')).toBeInTheDocument();
    expect(turn().getByText('Trio 1 of 10')).toBeInTheDocument();
    expect(turn().getByText('Find a trio')).toBeInTheDocument();
    expect(places()).toHaveLength(12);
  });

  it('leaves for the game’s page, asking first once a trio is found', async () => {
    const { router } = await startRun();
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    expect(router.state.location.pathname).toBe('/games/trios');

    await act(() => router.navigate(`/games/trios/solo?seed=${SEED}`));
    await findTrio();
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    const dialog = within(
      screen.getByRole('dialog', { name: 'Leave this game?' }),
    );
    expect(
      dialog.getByText('This run ends here, and its time is not kept.'),
    ).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: 'Stay' })).toHaveFocus();
    await user.click(dialog.getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe('/games/trios/solo');
    expect(turn().getByText('Trio 2 of 10')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Leave' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave' }),
    );
    expect(router.state.location.pathname).toBe('/games/trios');
  });

  it('plays a challenge’s own deal', async () => {
    await startRun();
    expect(screen.getByText('Challenge')).toBeInTheDocument();
    expect(places().map((card) => card.getAttribute('aria-label'))).toEqual(
      model.deal.table.map(cardName),
    );
  });

  it('says why three cards are not a trio, and adds 5 seconds', async () => {
    await startRun();
    const t = model.deal.table;
    const third = t.findIndex((_, c) => c > 1 && !isTrio(t[0]!, t[1]!, t[c]!));
    await pickPlaces([0, 1]);
    expect(turn().getByText('Pick a third card')).toBeInTheDocument();
    await pickPlaces([third]);

    expect(turn().getByText('Not a trio, +5 s')).toBeInTheDocument();
    expect(turn().getByText(/^Two (are|have) /)).toBeInTheDocument();
    expect(turn().getByRole('timer')).toHaveTextContent(/^0:0[5-6]/);
    expect(
      table().getByRole('img', { name: `${cardName(t[0]!)}, not a trio` }),
    ).toBeInTheDocument();

    // The cards go back, but why they were not a trio stays until the next pick.
    await pause(FLASH_MS);
    expect(table().queryByRole('button', { name: /, not a trio$/ })).toBeNull();
    expect(turn().getByText('Not a trio, +5 s')).toBeInTheDocument();
    expect(turn().getByText(/^Two (are|have) /)).toBeInTheDocument();
    expect(screen.getByText('1, +0:05')).toBeInTheDocument();
    await pause(5000);
    expect(turn().getByText(/^Two (are|have) /)).toBeInTheDocument();
    await pickPlaces([0]);
    expect(turn().getByText('Pick two more')).toBeInTheDocument();
  });

  it('counts a found trio’s wrong pick and hints once while it is up', async () => {
    await startRun();
    const t = model.deal.table;
    const third = t.findIndex((_, c) => c > 1 && !isTrio(t[0]!, t[1]!, t[c]!));
    await pickPlaces([0, 1, third]);
    await pause(FLASH_MS);
    model = afterFlash(model, 0);
    await user.click(screen.getByRole('button', { name: 'Hint, +10 s' }));
    await user.click(screen.getByRole('button', { name: 'Hint, +10 s' }));
    expect(stat('Wrong picks')).toBe('1, +0:05');
    expect(stat('Hints')).toBe('2, +0:20');

    await pickPlaces(findTrios(model.deal.table)[0]!);
    expect(turn().getByText('A trio!')).toBeInTheDocument();
    expect(stat('Wrong picks')).toBe('1, +0:05');
    expect(stat('Hints')).toBe('2, +0:20');
    await pause(FLASH_MS);
    expect(stat('Wrong picks')).toBe('1, +0:05');
    expect(stat('Hints')).toBe('2, +0:20');
  });

  it('marks a card of a trio for 10 seconds, twice at most', async () => {
    await startRun();
    await user.click(screen.getByRole('button', { name: 'Hint, +10 s' }));
    expect(table().getAllByRole('button', { name: /, hint$/ })).toHaveLength(1);
    expect(
      turn().getByText('One card of a trio is marked'),
    ).toBeInTheDocument();
    expect(
      turn().getByText('Find the other two'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hint, +10 s' }));
    expect(table().getAllByRole('button', { name: /, hint$/ })).toHaveLength(2);
    expect(
      turn().getByText('Two cards of a trio are marked'),
    ).toBeInTheDocument();
    expect(turn().getByText('Find the third card')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hint, +10 s' })).toBeNull();
    expect(turn().getByRole('timer')).toHaveTextContent(/^0:2[0-1]/);
  });

  it('ends after ten trios with every one, keeps the best and copies a challenge', async () => {
    await startRun();
    await pickPlaces(findTrios(model.deal.table)[0]!);
    expect(turn().getByText('A trio!')).toBeInTheDocument();
    expect(turn().getByText(/^Found in 0:0\d$/)).toBeInTheDocument();
    await pause(FLASH_MS);
    model = afterFlash(model, 0);
    expect(turn().getByText('Trio 2 of 10')).toBeInTheDocument();
    for (let trio = 1; trio < RUN_TRIOS; trio++) await findTrio();

    expect(
      screen.getByRole('heading', { name: /^10 trios in 0:0\d\.$/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your first run on this device.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Run complete')).toBeInTheDocument();

    const trios = within(
      screen.getByRole('region', { name: 'Every trio' }),
    ).getAllByRole('listitem');
    expect(trios).toHaveLength(RUN_TRIOS);
    expect(
      within(trios[0]!)
        .getAllByRole('img')
        .map((c) => c.getAttribute('aria-label')),
    ).toEqual(model.results[0]!.cards.map(cardName));
    expect(localStorage.getItem('zumpo:solo:best:trios:ten-trios')).toMatch(
      /^\d+$/,
    );
    expect(screen.getByText('Today')).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { name: 'Challenge a friend' }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Copy challenge link' }),
    );
    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}/games/trios/solo?seed=${SEED}`,
    );

    // Play again is a new run, not the challenge again.
    await user.click(screen.getByRole('button', { name: 'Play again' }));
    expect(turn().getByText('Trio 1 of 10')).toBeInTheDocument();
  });

  it('keeps to the table on a phone', async () => {
    onPhone();
    await startRun();
    expect(places()).toHaveLength(12);
    expect(screen.queryByText('This run')).toBeNull();
    expect(screen.queryByText('What makes a trio')).toBeNull();
  });
});
