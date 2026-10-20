import { describe, expect, it } from 'vitest';
import {
  mineProbabilities,
  type PublicBoard,
} from '../socket/minesweeper/probability.js';
import {
  createBoard,
  hiddenIndexes,
  markHitMine,
  publicView,
  revealFrom,
} from '../socket/minesweeper/board.js';

/**
 * The solver is the whole game - every point anybody scores is a function of
 * what it returns - so it is worth pinning down against boards whose answers
 * can be worked out by hand.
 *
 * The cases below are chosen for what they distinguish. Several of them give
 * the same answer under any reasonable method; the ones that matter are the
 * ones where a per-constraint estimate is *wrong*, because those are what say
 * this is a real solver rather than a heuristic with good manners.
 */

/** `#` hidden, `*` a mine somebody hit, a digit a revealed count. */
const parse = (rows: string[], totalMines: number): PublicBoard => {
  const grid = rows.map((row) => row.trim().split(/\s+/));
  const height = grid.length;
  const width = grid[0]!.length;

  const cells = grid.flat().map((token) => {
    if (token === '#') return -1;
    if (token === '*') return 9;
    return Number(token);
  });

  return { width, height, totalMines, cells };
};

/** The risk of every still-hidden cell, added up. */
const totalRisk = (board: PublicBoard): number => {
  const probabilities = mineProbabilities(board);
  return board.cells.reduce(
    (sum, cell, index) => (cell === -1 ? sum + probabilities[index]! : sum),
    0,
  );
};

const minesStillOut = (board: PublicBoard): number =>
  board.totalMines - board.cells.filter((cell) => cell === 9).length;

describe('an unopened board', () => {
  it('gives every cell the board’s density', () => {
    const board = parse(['# # #', '# # #', '# # #'], 2);
    const probabilities = mineProbabilities(board);

    for (const probability of probabilities)
      expect(probability).toBeCloseTo(2 / 9, 6);
  });
});

describe('a single constraint', () => {
  it('spreads one mine evenly over the cells it could be in', () => {
    // The centre of a 3×3 is the only revealed cell, and it touches everything
    // else, so the one mine is equally likely to be any of the eight.
    const board = parse(['# # #', '# 1 #', '# # #'], 1);
    const probabilities = mineProbabilities(board);

    // The revealed centre itself is not a candidate...
    expect(probabilities[4]).toBeCloseTo(0, 6);
    // ...and the eight around it share the mine equally.
    const around = [0, 1, 2, 3, 5, 6, 7, 8].map((at) => probabilities[at]);
    expect(around).toEqual(around.map(() => expect.closeTo(1 / 8, 6)));
  });

  it('proves a cell safe when the count is already met', () => {
    const board = parse(['0 # # #', '# # # #', '# # # #', '# # # #'], 2);
    const probabilities = mineProbabilities(board);

    // The three cells the zero touches cannot be mines...
    expect(probabilities[1]).toBeCloseTo(0, 6);
    expect(probabilities[4]).toBeCloseTo(0, 6);
    expect(probabilities[5]).toBeCloseTo(0, 6);
    // ...so both mines are somewhere in the twelve it does not.
    expect(probabilities[15]).toBeCloseTo(2 / 12, 6);
  });
});

/*
 * The case worth having. Three numbers reading 1-2-1 over three hidden cells
 * have exactly one solution - mine, safe, mine - and no per-constraint estimate
 * finds it: taking the worst constraint touching the middle cell gives 2/3,
 * where the truth is 0. Anything that answers 2/3 here is a heuristic.
 */
describe('the 1-2-1 pattern', () => {
  it('solves it exactly, where a local estimate cannot', () => {
    const board = parse(['# # #', '1 2 1'], 2);
    const probabilities = mineProbabilities(board);

    expect(probabilities[0]).toBeCloseTo(1, 6);
    expect(probabilities[1]).toBeCloseTo(0, 6);
    expect(probabilities[2]).toBeCloseTo(1, 6);
  });

  it('subtracts mines that have already been hit', () => {
    // Same pattern, but the left mine is common knowledge now: every count it
    // touches drops by one, and the rest still resolves.
    const board = parse(['* # #', '1 2 1'], 2);
    const probabilities = mineProbabilities(board);

    expect(probabilities[0]).toBeCloseTo(1, 6); // already known
    expect(probabilities[1]).toBeCloseTo(0, 6);
    expect(probabilities[2]).toBeCloseTo(1, 6);
  });
});

describe('the frontier and the sea', () => {
  /*
   * A five-cell strip with the middle revealed as 1. The mine is next to it, so
   * the two cells further out are provably safe - which a density estimate
   * would never say, because it has no idea the frontier has used the budget up.
   */
  it('knows the sea is empty when the frontier must hold every mine', () => {
    const board = parse(['# # 1 # #'], 1);
    const probabilities = mineProbabilities(board);

    expect(probabilities[0]).toBeCloseTo(0, 6);
    expect(probabilities[1]).toBeCloseTo(1 / 2, 6);
    expect(probabilities[3]).toBeCloseTo(1 / 2, 6);
    expect(probabilities[4]).toBeCloseTo(0, 6);
  });

  it('shares the leftover mines out across the sea', () => {
    // Same board, two mines: one is beside the revealed cell, the other is in
    // one of the two outer cells.
    const board = parse(['# # 1 # #'], 2);
    const probabilities = mineProbabilities(board);

    expect(probabilities[0]).toBeCloseTo(1 / 2, 6);
    expect(probabilities[1]).toBeCloseTo(1 / 2, 6);
    expect(probabilities[3]).toBeCloseTo(1 / 2, 6);
    expect(probabilities[4]).toBeCloseTo(1 / 2, 6);
  });
});

/*
 * The invariant that catches almost anything: the probabilities of the hidden
 * cells must sum to the number of mines still out there. It follows directly
 * from the definition - sum the indicator over every consistent layout - so a
 * solver that miscounts configurations, mishandles a component boundary or
 * weights the sea wrongly will break it, whatever else it gets right.
 */
describe('the total-mines invariant', () => {
  it('holds for every hand-built board above', () => {
    for (const board of [
      parse(['# # #', '# 1 #', '# # #'], 1),
      parse(['# # #', '1 2 1'], 2),
      parse(['# # 1 # #'], 1),
      parse(['# # 1 # #'], 2),
      parse(['0 # # #', '# # # #', '# # # #', '# # # #'], 2),
    ]) {
      expect(totalRisk(board)).toBeCloseTo(minesStillOut(board), 5);
    }
  });

  it('holds for real boards, part-way through a game', () => {
    for (const difficulty of ['Small', 'Medium'] as const) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const board = createBoard(difficulty);

        // Open a few safe cells, and set off a couple of mines, so the board
        // has a frontier, a sea and some known mines all at once.
        let opened = 0;
        for (const index of hiddenIndexes(board)) {
          if (opened >= 12) break;
          if (board.mines[index]) continue;
          if (revealFrom(board, index).length > 0) opened++;
        }
        let hit = 0;
        for (const index of hiddenIndexes(board)) {
          if (hit >= 2) break;
          if (!board.mines[index]) continue;
          markHitMine(board, index);
          hit++;
        }

        const view: PublicBoard = {
          width: board.width,
          height: board.height,
          totalMines: board.totalMines,
          cells: publicView(board),
        };
        expect(totalRisk(view)).toBeCloseTo(minesStillOut(view), 5);
      }
    }
  });
});

describe('what it returns for cells that are not hidden', () => {
  it('scores a revealed cell at zero and a hit mine at one', () => {
    const board = parse(['* 1 #', '# # #'], 2);
    const probabilities = mineProbabilities(board);

    expect(probabilities[0]).toBeCloseTo(1, 6); // the hit mine
    expect(probabilities[1]).toBeCloseTo(0, 6); // revealed
  });

  it('never reports a probability outside 0…1', () => {
    const board = createBoard('Medium');
    for (const index of hiddenIndexes(board).slice(0, 30)) {
      if (!board.mines[index]) revealFrom(board, index);
    }

    const probabilities = mineProbabilities({
      width: board.width,
      height: board.height,
      totalMines: board.totalMines,
      cells: publicView(board),
    });

    for (const probability of probabilities) {
      expect(probability).toBeGreaterThanOrEqual(0);
      expect(probability).toBeLessThanOrEqual(1);
    }
  });
});

/*
 * A Large board is 480 cells and 99 mines, and the solver runs once a round.
 * The counts genuinely overflow a double there - C(300, 99) has 82 digits -
 * which is why they are bigint; this is the test that would have caught the
 * NaN if they were not.
 */
describe('a Large board', () => {
  it('stays exact and fast enough to run every round', () => {
    const board = createBoard('Large');
    let opened = 0;
    for (const index of hiddenIndexes(board)) {
      if (opened >= 40) break;
      if (board.mines[index]) continue;
      if (revealFrom(board, index).length > 0) opened++;
    }

    const view = {
      width: board.width,
      height: board.height,
      totalMines: board.totalMines,
      cells: publicView(board),
    };

    const startedAt = Date.now();
    const probabilities = mineProbabilities(view);
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeLessThan(2000);
    for (const probability of probabilities) {
      expect(Number.isFinite(probability)).toBe(true);
    }

    const total = view.cells.reduce(
      (sum, cell, index) => (cell === -1 ? sum + probabilities[index]! : sum),
      0,
    );
    expect(total).toBeCloseTo(board.totalMines, 4);
  });
});
