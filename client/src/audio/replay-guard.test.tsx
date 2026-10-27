import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  createReplayGuard,
  useStateSounds,
  type DeriveSounds,
  type SoundEvent,
} from './replay-guard';
import type { PlayOptions, PlaySound } from './types';

/** A slice of a Snap-like room: whose take it was, and which game. */
interface Table {
  game: number;
  started: boolean;
  lastTake: { by: string; card: number } | null;
}

type Sound = 'took' | 'start';

const ME = 'me';

const derive: DeriveSounds<Table, Sound> = (prev, next) => {
  const events: SoundEvent<Sound>[] = [];
  if (!prev.started && next.started) {
    events.push({ sound: 'start', key: `start:${next.game}` });
  }
  if (next.lastTake && next.lastTake.card !== prev.lastTake?.card) {
    events.push({
      sound: 'took',
      key: `take:${next.lastTake.card}`,
      other: next.lastTake.by !== ME,
    });
  }
  return events;
};

/** Each game has its number, as a game's summary or counter tells one apart. */
const isNewGame = (prev: Table, next: Table) => next.game > prev.game;
const never = () => false;

const table = (card: number | null, by = ME, game = 1): Table => ({
  game,
  started: true,
  lastTake: card === null ? null : { by, card },
});

const both: DeriveSounds<number, 'took'> = () => [
  { sound: 'took', key: 'a', other: true },
  { sound: 'took', key: 'b' },
  { sound: 'took', key: 'c', other: true },
];

/** A start plays alone, as a room's "your turn" does over a game's sounds. */
const startAlone = (events: SoundEvent<Sound>[]) =>
  events.some((e) => e.sound === 'start')
    ? events.filter((e) => e.sound === 'start')
    : events;

/** The take a table shows, which it stands for on its own. */
const standing = (state: Table) =>
  state.lastTake ? [`take:${state.lastTake.card}`] : [];

const keyed: DeriveSounds<number, 'tick'> = (_, next) => [
  { sound: 'tick', key: `tick:${next}` },
];

function Room({
  state,
  epoch,
  play,
}: {
  state: Table | null;
  epoch: number | null;
  play: PlaySound<Sound>;
}) {
  useStateSounds(state, { derive, play, epoch, isNewGame });
  return null;
}

function mount(state: Table | null, epoch: number | null = 1) {
  const play = vi.fn<(sound: Sound, options?: { other?: boolean }) => void>();
  const view = render(
    <StrictMode>
      <Room state={state} epoch={epoch} play={play} />
    </StrictMode>,
  );
  const next = (s: Table | null, e: number | null = epoch) => {
    epoch = e;
    view.rerender(
      <StrictMode>
        <Room state={s} epoch={e} play={play} />
      </StrictMode>,
    );
  };
  return { play, next };
}

describe('createReplayGuard', () => {
  it('plays nothing for the first state, as on arrival or after a refresh', () => {
    const guard = createReplayGuard(derive, { isNewGame });
    expect(guard.observe(table(5))).toEqual([]);
  });

  it("plays what changed after it, the viewer's own and another player's", () => {
    const guard = createReplayGuard(derive, { isNewGame });
    guard.observe(table(3));
    expect(guard.observe(table(4))).toEqual([
      { sound: 'took', key: 'take:4', other: false },
    ]);
    expect(guard.observe(table(5, 'bob'))).toEqual([
      { sound: 'took', key: 'take:5', other: true },
    ]);
  });

  it('only takes the first state after a reconnect as a new baseline', () => {
    const guard = createReplayGuard(derive, { isNewGame });
    guard.observe(table(3));
    expect(guard.observe(table(9, 'bob'), true)).toEqual([]);
    expect(guard.observe(table(10))).toEqual([
      { sound: 'took', key: 'take:10', other: false },
    ]);
  });

  it('never plays one event twice, when a state repeats or flips back', () => {
    const guard = createReplayGuard(derive, { isNewGame });
    const four = table(4);
    guard.observe(table(3));
    expect(guard.observe(four)).toHaveLength(1);
    expect(guard.observe(four)).toEqual([]);
    guard.observe(table(3));
    expect(guard.observe(table(4))).toEqual([]);
  });

  it('forgets the keys when a new game began while away', () => {
    // Away mid-game 1; back mid-game 2.
    const guard = createReplayGuard(derive, { isNewGame });
    guard.observe(table(3));
    guard.observe(table(4));
    guard.observe(table(null, ME, 2), true);
    expect(guard.observe(table(4, ME, 2))).toEqual([
      { sound: 'took', key: 'take:4', other: false },
    ]);
  });

  it('hears the same keys again in a new game', () => {
    const guard = createReplayGuard(derive, { isNewGame });
    guard.observe(table(3));
    guard.observe(table(4));
    guard.observe({ ...table(null, ME, 1), started: false });
    expect(guard.observe(table(null, ME, 2))).toEqual([
      { sound: 'start', key: 'start:2' },
    ]);
    expect(guard.observe(table(4, ME, 2))).toEqual([
      { sound: 'took', key: 'take:4', other: false },
    ]);
  });

  it('without a new game, keys stay heard', () => {
    const guard = createReplayGuard(derive, { isNewGame: never });
    guard.observe(table(4));
    guard.observe(table(5));
    guard.observe({ ...table(null), started: false });
    guard.observe(table(null, ME, 2));
    expect(guard.observe(table(5, ME, 2))).toEqual([]);
  });

  it('keeps the keys across a reconnect, so a state that flips back is silent', () => {
    const guard = createReplayGuard(derive, { isNewGame });
    guard.observe(table(3));
    guard.observe(table(4));
    // Back online to a snapshot from before take 4, then take 4 again.
    guard.observe(table(3), true);
    expect(guard.observe(table(4))).toEqual([]);
    expect(guard.observe(table(5))).toEqual([
      { sound: 'took', key: 'take:5', other: false },
    ]);
  });

  it("plays one sound once per change, as the viewer's own if any is", () => {
    const guard = createReplayGuard(both, { isNewGame: never });
    guard.observe(0);
    expect(guard.observe(1)).toEqual([{ sound: 'took', key: 'b' }]);
  });

  it('plays what `select` keeps, and has heard what it drops', () => {
    const guard = createReplayGuard(derive, { isNewGame, select: startAlone });
    guard.observe({ game: 1, started: false, lastTake: null });
    expect(guard.observe(table(4))).toEqual([
      { sound: 'start', key: 'start:1' },
    ]);
    // The take dropped beside the start never plays later.
    guard.observe(table(null));
    expect(guard.observe(table(4))).toEqual([]);
  });

  it('counts what a baseline stands for as heard', () => {
    const guard = createReplayGuard(derive, { isNewGame, standing });
    guard.observe(table(4));
    guard.observe(table(null));
    expect(guard.observe(table(4))).toEqual([]);
    // After a reconnection too.
    guard.observe(table(6), true);
    guard.observe(table(null));
    expect(guard.observe(table(6))).toEqual([]);
    expect(guard.observe(table(7))).toHaveLength(1);
  });

  it('remembers only so many keys', () => {
    const guard = createReplayGuard(keyed, { isNewGame: never, memory: 2 });
    guard.observe(0);
    expect(guard.observe(1)).toHaveLength(1);
    expect(guard.observe(2)).toHaveLength(1);
    expect(guard.observe(1)).toEqual([]);
    expect(guard.observe(3)).toHaveLength(1);
    // tick:1 was forgotten when tick:3 came in.
    expect(guard.observe(1)).toHaveLength(1);
  });
});

describe('useStateSounds', () => {
  it('plays nothing on arrival, then each change once', () => {
    const { play, next } = mount(table(3));
    expect(play).not.toHaveBeenCalled();
    next(table(4, 'bob'));
    expect(play.mock.calls).toEqual([['took', { other: true }]]);
  });

  it('waits for a first state', () => {
    const { play, next } = mount(null);
    next(table(3));
    expect(play).not.toHaveBeenCalled();
    next(table(4));
    expect(play.mock.calls).toEqual([['took', { other: false }]]);
  });

  it('takes the first state after a new connection as a baseline', () => {
    const three = table(3);
    const { play, next } = mount(three);
    // Offline: the old state stays on screen.
    next(three, null);
    // Back online; a render before the fresh state must not use up the resync.
    next(three, 2);
    next(table(8, 'bob'));
    expect(play).not.toHaveBeenCalled();
    next(table(9));
    expect(play.mock.calls).toEqual([['took', { other: false }]]);
  });

  it('takes a fresh state that comes with the new connection as a baseline too', () => {
    const { play, next } = mount(table(3));
    next(table(8, 'bob'), 2);
    expect(play).not.toHaveBeenCalled();
  });
});

/**
 * A streak sound rising one step per point this round. Its key names the
 * round, since a point's number comes round again every round. (A clock's
 * last seconds are not derived from states: the page plays them from its own
 * timer, as the seconds pass.)
 */
interface Scores {
  round: number;
  points: { by: string; streak: number }[];
}

const scoring: DeriveSounds<Scores, 'scored', 'scored'> = (prev, next) => {
  const from = prev.round === next.round ? prev.points.length : 0;
  return next.points.slice(from).map((point, index) => ({
    sound: 'scored',
    key: `score:${next.round}:${from + index}`,
    other: point.by !== ME,
    variant: point.streak,
  }));
};

const scores = (round: number, ...points: [string, number][]): Scores => ({
  round,
  points: points.map(([by, streak]) => ({ by, streak })),
});

function Board({
  state,
  play,
}: {
  state: Scores;
  play: PlaySound<'scored', 'scored'>;
}) {
  useStateSounds(state, {
    derive: scoring,
    play,
    epoch: 1,
    isNewGame: never,
  });
  return null;
}

describe('steps', () => {
  it('hears two steps of one sound in one change once, at the higher step', () => {
    const guard = createReplayGuard(scoring, { isNewGame: never });
    guard.observe(scores(1));
    // Two players score in one snapshot: step 2 must not be lost to step 1.
    expect(guard.observe(scores(1, ['me', 1], ['bob', 2]))).toEqual([
      { sound: 'scored', key: 'score:1:0', other: false, variant: 2 },
    ]);
    // Another player's only if every one of them was.
    expect(
      guard.observe(scores(1, ['me', 1], ['bob', 2], ['bob', 3], ['ann', 4])),
    ).toEqual([{ sound: 'scored', key: 'score:1:2', other: true, variant: 4 }]);
    // The next round's first point is news, though its number is not.
    expect(guard.observe(scores(2, ['me', 1]))).toEqual([
      { sound: 'scored', key: 'score:2:0', other: false, variant: 1 },
    ]);
  });

  it('plays that step through the hook', () => {
    const play = vi.fn<(sound: 'scored', options?: PlayOptions) => void>();
    const view = render(<Board state={scores(1)} play={play} />);
    view.rerender(
      <Board state={scores(1, ['ann', 1], ['bob', 2])} play={play} />,
    );
    expect(play.mock.calls).toEqual([['scored', { other: true, variant: 2 }]]);
  });
});

/** A guess's pegs: one snapshot, heard one after another. */
const pegs: DeriveSounds<number, 'peg'> = (prev, next) =>
  next > prev
    ? [0, 1, 2].map((beat) => ({
        sound: 'peg' as const,
        key: `row:${next}:${beat}`,
        delayMs: beat * 90,
      }))
    : [];

function Pegs({ rows, play }: { rows: number; play: PlaySound<'peg'> }) {
  useStateSounds(rows, { derive: pegs, play, epoch: 1, isNewGame: never });
  return null;
}

describe('a run heard one after another', () => {
  it('keeps each beat of one sound, rather than hearing it once', () => {
    const guard = createReplayGuard(pegs, { isNewGame: never });
    guard.observe(0);
    expect(guard.observe(1).map((e) => e.delayMs)).toEqual([0, 90, 180]);
  });

  it('plays each beat after its delay, and none once the page is gone', () => {
    vi.useFakeTimers();
    try {
      const play = vi.fn<(sound: 'peg', options?: PlayOptions) => void>();
      const view = render(<Pegs rows={0} play={play} />);
      view.rerender(<Pegs rows={1} play={play} />);
      expect(play).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(90);
      expect(play).toHaveBeenCalledTimes(2);
      view.rerender(<Pegs rows={2} play={play} />);
      expect(play).toHaveBeenCalledTimes(3);
      view.unmount();
      vi.advanceTimersByTime(1000);
      expect(play).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cuts short the beats still waiting when a sound that cuts plays', () => {
    vi.useFakeTimers();
    try {
      // -1 is the end: a stinger that must not have pegs over it.
      const ending: DeriveSounds<number, 'peg' | 'end'> = (prev, next) =>
        next === -1 ? [{ sound: 'end', key: 'end' }] : pegs(prev, next);
      const play =
        vi.fn<(sound: 'peg' | 'end', options?: PlayOptions) => void>();
      function Ending({ rows }: { rows: number }) {
        useStateSounds<number, 'peg' | 'end'>(rows, {
          derive: ending,
          play,
          epoch: 1,
          isNewGame: never,
          cuts: (sound) => sound === 'end',
        });
        return null;
      }
      const view = render(<Ending rows={0} />);
      view.rerender(<Ending rows={1} />);
      view.rerender(<Ending rows={-1} />);
      vi.advanceTimersByTime(1000);
      expect(play.mock.calls.map(([sound]) => sound)).toEqual(['peg', 'end']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cuts short the beats still waiting the moment a delayed sound that cuts is queued', () => {
    vi.useFakeTimers();
    try {
      // The end follows a beat of its own that plays beside it.
      const ending: DeriveSounds<number, 'peg' | 'end'> = (prev, next) =>
        next === -1
          ? [
              { sound: 'peg', key: 'five', delayMs: 100 },
              { sound: 'end', key: 'end', delayMs: 500 },
            ]
          : pegs(prev, next);
      const play =
        vi.fn<(sound: 'peg' | 'end', options?: PlayOptions) => void>();
      function Ending({ rows }: { rows: number }) {
        useStateSounds<number, 'peg' | 'end'>(rows, {
          derive: ending,
          play,
          epoch: 1,
          isNewGame: never,
          cuts: (sound) => sound === 'end',
        });
        return null;
      }
      const view = render(<Ending rows={0} />);
      view.rerender(<Ending rows={3} />);
      view.rerender(<Ending rows={-1} />);
      vi.advanceTimersByTime(1000);
      // The first change's later pegs never land; this change's own beat and
      // the end do, in order.
      expect(play.mock.calls.map(([sound]) => sound)).toEqual([
        'peg',
        'peg',
        'end',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
