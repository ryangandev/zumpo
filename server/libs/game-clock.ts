import * as doodleChain from '../../shared/doodle-chain.js';

/**
 * How long each phase of a turn lasts. These live on the server because the
 * server is what enforces them - clients are told how much time is left, they
 * do not decide it.
 *
 * Overridable so a game can be sped up for local play or an integration run
 * without touching the code.
 */
const readSecondsFromEnv = (name: string, fallbackSeconds: number): number => {
  const raw = process.env[name];
  if (!raw) return fallbackSeconds;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `Ignoring ${name}="${raw}": expected a positive number of seconds.`,
    );
    return fallbackSeconds;
  }

  return parsed;
};

interface PhaseDurationsInSeconds {
  wordSelecting: number;
  drawing: number;
  reviewing: number;
  /**
   * How long a turn waits for a drawer whose connection dropped mid-drawing.
   * Optional because it is not a phase: the engine falls back to its own
   * default, and a test that only cares about phase lengths need not name it.
   */
  drawerHold?: number;
}

const phaseDurationsInSeconds: PhaseDurationsInSeconds = {
  wordSelecting: readSecondsFromEnv('WORD_SELECT_SECONDS', 15),
  drawing: readSecondsFromEnv('DRAWING_SECONDS', 90),
  reviewing: readSecondsFromEnv('REVIEW_SECONDS', 10),
  drawerHold: readSecondsFromEnv('DRAWER_HOLD_SECONDS', 10),
};

/**
 * Minesweeper's clock. Two durations rather than three phases, because a round
 * is one window in which everybody picks at once.
 */
interface MinesweeperDurationsInSeconds {
  /** How long everybody has to choose a cell. */
  round: number;
  /**
   * How long the outcome stays up before the next round opens. Without it the
   * board would change under the results and nobody would read what their pick
   * had actually risked.
   */
  reveal: number;
}

const minesweeperDurationsInSeconds: MinesweeperDurationsInSeconds = {
  round: readSecondsFromEnv('MINESWEEPER_ROUND_SECONDS', 15),
  reveal: readSecondsFromEnv('MINESWEEPER_REVEAL_SECONDS', 4),
};

/** Make 24's clock: one hand for everybody at once, then its results. */
interface Make24DurationsInSeconds {
  /** How long everybody has to solve a hand. */
  hand: number;
  /** How long a hand's results stay up before the next is dealt. */
  reveal: number;
}

const make24DurationsInSeconds: Make24DurationsInSeconds = {
  hand: readSecondsFromEnv('MAKE24_HAND_SECONDS', 60),
  reveal: readSecondsFromEnv('MAKE24_REVEAL_SECONDS', 5),
};

/** Pairs' clock: one player's turn, and a miss left up for everybody. */
interface PairsDurationsInSeconds {
  /** How long a player has to turn over two cards. */
  turn: number;
  /** How long two cards that did not match stay up before they turn back. */
  show: number;
}

const pairsDurationsInSeconds: PairsDurationsInSeconds = {
  turn: readSecondsFromEnv('PAIRS_TURN_SECONDS', 10),
  show: readSecondsFromEnv('PAIRS_SHOW_SECONDS', 2),
};

/** Liar's Dice's clock: one player's turn to bid or call, and a call's reveal. */
interface LiarsDiceDurationsInSeconds {
  /** How long a player has to raise the bid or call Liar. */
  turn: number;
  /** How long every cup stays open after a call, before the next round is rolled. */
  reveal: number;
}

const liarsDiceDurationsInSeconds: LiarsDiceDurationsInSeconds = {
  turn: readSecondsFromEnv('LIARS_DICE_TURN_SECONDS', 20),
  reveal: readSecondsFromEnv('LIARS_DICE_REVEAL_SECONDS', 5),
};

/**
 * Hush's clock. A level itself has none: the waiting is the game, so only the
 * moments around it are timed.
 */
interface HushDurationsInSeconds {
  /** From everybody being ready to the first card that may be played. */
  countdown: number;
  /** How long play stops after a mistake, for everybody to see it. */
  mistake: number;
  /** How long a cleared level shows before the next one's Ready. */
  cleared: number;
}

const hushDurationsInSeconds: HushDurationsInSeconds = {
  countdown: readSecondsFromEnv('HUSH_COUNTDOWN_SECONDS', 3),
  mistake: readSecondsFromEnv('HUSH_MISTAKE_SECONDS', 3),
  cleared: readSecondsFromEnv('HUSH_CLEARED_SECONDS', 4),
};

/** Daily Word's clock: one word for everybody at once, then its results. */
interface DailyWordDurationsInSeconds {
  /** How long everybody has to find the word. */
  round: number;
  /** How long a round's results stay up before the next word. */
  reveal: number;
}

const dailyWordDurationsInSeconds: DailyWordDurationsInSeconds = {
  round: readSecondsFromEnv('DAILY_WORD_ROUND_SECONDS', 120),
  reveal: readSecondsFromEnv('DAILY_WORD_REVEAL_SECONDS', 8),
};

/**
 * Doodle Chain's clock. A drawing step lasts as long as its room chose, so it
 * is here only to be overridden: unset, each room's own setting stands.
 */
interface DoodleChainDurationsInSeconds {
  /** How long everybody has to write a prompt. */
  write: number;
  /** How long everybody has to describe a drawing. */
  describe: number;
  /** The pause between steps, while the chains move on. */
  passing: number;
  /** When set, every room's drawing time, whatever the room chose. */
  draw?: number;
}

const doodleChainDurationsInSeconds: DoodleChainDurationsInSeconds = {
  write: readSecondsFromEnv('DC_WRITE_SECONDS', doodleChain.WRITE_SECONDS),
  describe: readSecondsFromEnv(
    'DC_DESCRIBE_SECONDS',
    doodleChain.DESCRIBE_SECONDS,
  ),
  passing: readSecondsFromEnv(
    'DC_PASSING_SECONDS',
    doodleChain.PASSING_SECONDS,
  ),
  ...(process.env.DC_DRAW_SECONDS
    ? {
        draw: readSecondsFromEnv(
          'DC_DRAW_SECONDS',
          doodleChain.DEFAULT_DRAWING_SECONDS,
        ),
      }
    : {}),
};

/**
 * Trios' clock. A table has no deadline of its own: nothing ends while
 * everybody looks, so these are the pause after a trio, the cost of a wrong
 * claim, and how long a silence lasts before a hint breaks it.
 */
interface TriosDurationsInSeconds {
  /** How long a taken trio stays on the table before new cards come. */
  taken: number;
  /** How long a wrong claim locks its player out. */
  lockout: number;
  /** How long a table goes without a trio before each hint. */
  hint: number;
}

const triosDurationsInSeconds: TriosDurationsInSeconds = {
  taken: readSecondsFromEnv('TRIOS_TAKEN_SECONDS', 2),
  lockout: readSecondsFromEnv('TRIOS_LOCKOUT_SECONDS', 3),
  hint: readSecondsFromEnv('TRIOS_HINT_SECONDS', 30),
};

/**
 * Snap's clock. A middle card has no deadline: nothing ends while everybody
 * looks, so these are the pause after a card is taken and the cost of a
 * wrong claim.
 */
interface SnapDurationsInSeconds {
  /** How long a taken middle card stays in play before the next is turned. */
  taken: number;
  /** How long a wrong claim locks its player out. */
  lockout: number;
}

const snapDurationsInSeconds: SnapDurationsInSeconds = {
  taken: readSecondsFromEnv('SNAP_TAKEN_SECONDS', 1.5),
  lockout: readSecondsFromEnv('SNAP_LOCKOUT_SECONDS', 2),
};

/**
 * How long a disconnected player keeps their seat, their score and their place
 * in the round before the room gives up on them.
 *
 * Long enough to cover a refresh, a tab restore or a brief network blip; short
 * enough that a room is not held up by somebody who has actually gone. A player
 * who leaves deliberately is removed at once - this is only for connections
 * that drop.
 */
const reconnectGraceInSeconds = readSecondsFromEnv(
  'RECONNECT_GRACE_SECONDS',
  30,
);

export {
  phaseDurationsInSeconds,
  minesweeperDurationsInSeconds,
  make24DurationsInSeconds,
  pairsDurationsInSeconds,
  triosDurationsInSeconds,
  snapDurationsInSeconds,
  liarsDiceDurationsInSeconds,
  hushDurationsInSeconds,
  dailyWordDurationsInSeconds,
  doodleChainDurationsInSeconds,
  reconnectGraceInSeconds,
};
export type {
  PhaseDurationsInSeconds,
  MinesweeperDurationsInSeconds,
  Make24DurationsInSeconds,
  PairsDurationsInSeconds,
  TriosDurationsInSeconds,
  SnapDurationsInSeconds,
  LiarsDiceDurationsInSeconds,
  HushDurationsInSeconds,
  DailyWordDurationsInSeconds,
  DoodleChainDurationsInSeconds,
};
