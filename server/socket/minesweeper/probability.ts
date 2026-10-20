import type { MinesweeperCellView } from '../../models/types.js';
import {
  HIDDEN,
  KNOWN_MINE,
  neighboursOf,
} from '../../../shared/minesweeper.js';

/**
 * How likely each hidden cell is to be a mine, given only what everybody can
 * see.
 *
 * This is the whole game. Every score is a function of it, so it is worth being
 * exact rather than approximately right: the number returned is the true
 * posterior - the fraction of all mine layouts consistent with the visible board
 * in which that cell is a mine - not a per-constraint estimate.
 *
 * **It takes the public view, not the board.** That is a deliberate constraint
 * rather than a convenience: a function that could see the layout could score a
 * pick by whether it was actually a mine, which is exactly the thing that must
 * not happen. Being unable to cheat is better than being trusted not to.
 *
 * The method is the standard one:
 *
 * 1. Every revealed number is a constraint on its hidden neighbours: how many
 *    of them are mines. Mines somebody has already hit count against the number
 *    and drop out of the unknowns.
 * 2. The **frontier** is the hidden cells touching at least one revealed number.
 *    Split it into independent components - two cells are connected when a
 *    constraint mentions both - because components multiply rather than interact.
 * 3. Enumerate each component's satisfying assignments by backtracking, counting
 *    how many use `k` mines and, of those, how many make each cell a mine.
 * 4. The **sea** is the hidden cells touching nothing revealed. They are
 *    interchangeable, and are accounted for by weighting each frontier total `t`
 *    by `C(|sea|, remaining − t)` - the number of ways the mines the frontier did
 *    not use could be spread through the sea.
 *
 * Counts are `bigint` because they genuinely overflow: `C(300, 99)` has 82
 * digits, and a probability that silently became `Infinity / Infinity` would
 * make every score on a Large board `NaN`.
 */

interface PublicBoard {
  width: number;
  height: number;
  totalMines: number;
  cells: MinesweeperCellView[];
}

/** One revealed number, reduced to what is still unknown about it. */
interface Constraint {
  /** Local indices into a component's cell list. */
  cells: number[];
  /** How many of them are mines. */
  target: number;
}

/**
 * A bound on backtracking work, shared across the whole board.
 *
 * Frontier components on a real board are small - the pruning below rejects a
 * partial assignment the moment any constraint becomes unsatisfiable, so the
 * search visits roughly the number of *valid* prefixes rather than 2^n. This
 * exists so that a pathological board degrades to an estimate instead of
 * stalling the event loop, and in ordinary play it never fires.
 */
const NODE_BUDGET = 2_000_000;

/*
 * Every array below is read at indexes its own loop bounds, or that were built
 * from its own length; the `!` on those reads says so where the type checker
 * cannot follow the arithmetic. This is the hot loop of every Minesweeper
 * pick, so the checks stay out of it.
 */

const ratio = (numerator: bigint, denominator: bigint): number => {
  if (denominator === 0n) return 0;
  const scale = 1_000_000_000n;
  return Number((numerator * scale) / denominator) / 1e9;
};

/** One row of Pascal's triangle: `[C(n,0) … C(n,n)]`. */
const binomialRow = (n: number): bigint[] => {
  const row: bigint[] = [1n];
  for (let k = 1; k <= n; k++) {
    row.push((row[k - 1]! * BigInt(n - k + 1)) / BigInt(k));
  }
  return row;
};

const convolve = (left: bigint[], right: bigint[]): bigint[] => {
  const out = Array.from({ length: left.length + right.length - 1 }, () => 0n);
  for (const [i, l] of left.entries()) {
    if (l === 0n) continue;
    for (const [j, r] of right.entries()) {
      if (r === 0n) continue;
      out[i + j]! += l * r;
    }
  }
  return out;
};

interface ComponentCounts {
  /** Board indices, in the order they were enumerated. */
  cells: number[];
  /** `ways[k]` - assignments of this component using `k` mines. */
  ways: bigint[];
  /** `mineWays[k][local]` - of those, how many make that cell a mine. */
  mineWays: bigint[][];
}

/**
 * Every assignment of one component that satisfies its constraints.
 *
 * Cells are visited in the order the constraints introduce them, which is what
 * makes the pruning bite: a constraint's last unknown is reached early, so an
 * assignment that cannot satisfy it is abandoned near the top of the tree rather
 * than at the bottom.
 */
const enumerateComponent = (
  cells: number[],
  constraints: Constraint[],
  budget: { nodes: number },
): ComponentCounts | null => {
  const size = cells.length;
  const ways = Array.from({ length: size + 1 }, () => 0n);
  const mineWays = Array.from({ length: size + 1 }, () =>
    Array.from({ length: size }, () => 0n),
  );

  const touching: number[][] = Array.from({ length: size }, () => []);
  constraints.forEach((constraint, at) => {
    for (const local of constraint.cells) touching[local]!.push(at);
  });

  const minesSoFar = Array.from({ length: constraints.length }, () => 0);
  const decidedSoFar = Array.from({ length: constraints.length }, () => 0);
  const isMine = Array.from({ length: size }, () => false);
  let withinBudget = true;

  const walk = (at: number, minesUsed: number): void => {
    if (!withinBudget) return;
    if (budget.nodes-- <= 0) {
      withinBudget = false;
      return;
    }

    if (at === size) {
      ways[minesUsed]! += 1n;
      const mineWaysHere = mineWays[minesUsed]!;
      for (let local = 0; local < size; local++) {
        if (isMine[local]) mineWaysHere[local]! += 1n;
      }
      return;
    }

    for (const asMine of [false, true]) {
      isMine[at] = asMine;

      let feasible = true;
      for (const which of touching[at]!) {
        const decided = (decidedSoFar[which]! += 1);
        const mines = asMine ? (minesSoFar[which]! += 1) : minesSoFar[which]!;

        const constraint = constraints[which]!;
        const stillUndecided = constraint.cells.length - decided;
        // Too many mines already, or too few cells left to reach the target.
        // When nothing is left undecided this is an exact check.
        if (
          mines > constraint.target ||
          constraint.target - mines > stillUndecided
        ) {
          feasible = false;
        }
      }

      if (feasible) walk(at + 1, minesUsed + (asMine ? 1 : 0));

      for (const which of touching[at]!) {
        decidedSoFar[which]! -= 1;
        if (asMine) minesSoFar[which]! -= 1;
      }
    }

    isMine[at] = false;
  };

  walk(0, 0);

  return withinBudget ? { cells, ways, mineWays } : null;
};

/**
 * The fallback: each cell's worst local constraint, or the global density if it
 * has none.
 *
 * Only reached when the exact search runs out of budget, which ordinary play does
 * not do. It is here so that such a board is scored pessimistically rather than
 * not at all - an approximate risk is a playable game, a thrown exception is not.
 */
const approximateProbabilities = (board: PublicBoard): number[] => {
  const { cells, totalMines } = board;
  const out = Array.from({ length: cells.length }, () => 0);

  const hidden: number[] = [];
  let knownMines = 0;
  for (let index = 0; index < cells.length; index++) {
    if (cells[index] === HIDDEN) hidden.push(index);
    else if (cells[index] === KNOWN_MINE) knownMines++;
  }

  const remaining = Math.max(0, totalMines - knownMines);
  const density = hidden.length > 0 ? remaining / hidden.length : 0;
  for (const index of hidden) out[index] = density;

  for (const [index, view] of cells.entries()) {
    if (view < 0 || view > 8) continue;

    const neighbours = neighboursOf(board, index);
    const unknown = neighbours.filter((at) => cells[at] === HIDDEN);
    const hit = neighbours.filter((at) => cells[at] === KNOWN_MINE).length;
    if (unknown.length === 0) continue;

    const local = Math.min(1, Math.max(0, (view - hit) / unknown.length));
    for (const at of unknown) out[at] = Math.max(out[at]!, local);
  }

  for (const index of hidden)
    out[index] = Math.min(1, Math.max(0, out[index]!));
  for (let index = 0; index < cells.length; index++) {
    if (cells[index] === KNOWN_MINE) out[index] = 1;
  }

  return out;
};

/**
 * The mine probability of every cell: `0` for anything revealed, `1` for a mine
 * already hit, and the exact posterior for everything still hidden.
 */
const mineProbabilities = (board: PublicBoard): number[] => {
  const { cells, totalMines } = board;
  const size = cells.length;
  const out = Array.from({ length: size }, () => 0);

  const isHidden = Array.from({ length: size }, () => false);
  let knownMines = 0;
  let hiddenCount = 0;

  for (let index = 0; index < size; index++) {
    if (cells[index] === HIDDEN) {
      isHidden[index] = true;
      hiddenCount++;
    } else if (cells[index] === KNOWN_MINE) {
      knownMines++;
      out[index] = 1;
    }
  }

  if (hiddenCount === 0) return out;
  const remaining = Math.max(0, totalMines - knownMines);

  // Every revealed number, as a statement about its still-hidden neighbours.
  const rawConstraints: { cells: number[]; target: number }[] = [];
  for (const [index, view] of cells.entries()) {
    if (view < 0 || view > 8) continue;

    const neighbours = neighboursOf(board, index);
    const unknown = neighbours.filter((at) => isHidden[at]);
    if (unknown.length === 0) continue;

    const hit = neighbours.filter((at) => cells[at] === KNOWN_MINE).length;
    const target = view - hit;
    // A board that says something impossible is not worth trusting; fall back
    // rather than enumerate zero configurations and divide by zero.
    if (target < 0 || target > unknown.length) {
      return approximateProbabilities(board);
    }

    rawConstraints.push({ cells: unknown, target });
  }

  // The frontier is every cell some constraint mentions; the sea is the rest.
  const frontier = new Set<number>();
  for (const constraint of rawConstraints) {
    for (const at of constraint.cells) frontier.add(at);
  }
  const seaSize = hiddenCount - frontier.size;

  // Nothing revealed yet: every hidden cell is equally likely, which is the
  // board's density. This is the opening position of every game.
  if (rawConstraints.length === 0) {
    const density = remaining / hiddenCount;
    for (let index = 0; index < size; index++) {
      if (isHidden[index]) out[index] = density;
    }
    return out;
  }

  // Components: cells joined when a constraint mentions both. Union-find over
  // the frontier, keyed by board index.
  const parent = new Map<number, number>();
  const find = (at: number): number => {
    let root = at;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression, so a long chain of adjacent constraints stays cheap.
    let walk = at;
    while (parent.get(walk) !== root) {
      const next = parent.get(walk)!;
      parent.set(walk, root);
      walk = next;
    }
    return root;
  };
  const union = (a: number, b: number) => parent.set(find(a), find(b));

  for (const at of frontier) parent.set(at, at);
  for (const [first, ...rest] of rawConstraints.map(
    (constraint) => constraint.cells,
  )) {
    for (const at of rest) union(first!, at);
  }

  /** Constraints grouped by the component they constrain. */
  const byComponent = new Map<number, { cells: number[]; target: number }[]>();
  for (const constraint of rawConstraints) {
    // A constraint is kept only with an unknown cell, so it has a first.
    const root = find(constraint.cells[0]!);
    const list = byComponent.get(root);
    if (list) list.push(constraint);
    else byComponent.set(root, [constraint]);
  }

  const budget = { nodes: NODE_BUDGET };
  const components: ComponentCounts[] = [];

  for (const constraintsHere of byComponent.values()) {
    // Cells in the order the constraints introduce them: a constraint's last
    // unknown then appears early, which is what makes the pruning effective.
    const order: number[] = [];
    const localOf = new Map<number, number>();
    for (const constraint of constraintsHere) {
      for (const at of constraint.cells) {
        if (localOf.has(at)) continue;
        localOf.set(at, order.length);
        order.push(at);
      }
    }

    const localConstraints: Constraint[] = constraintsHere.map(
      (constraint) => ({
        cells: constraint.cells.map((at) => localOf.get(at)!),
        target: constraint.target,
      }),
    );

    const counts = enumerateComponent(order, localConstraints, budget);
    if (!counts) return approximateProbabilities(board);
    components.push(counts);
  }

  // How many ways the frontier as a whole can use `t` mines.
  let combined: bigint[] = [1n];
  for (const component of components) {
    combined = convolve(combined, component.ways);
  }

  // …and, for each component, how many ways *the others* can use `j` mines.
  const prefix: bigint[][] = [[1n]];
  for (const component of components) {
    prefix.push(convolve(prefix.at(-1)!, component.ways));
  }
  const suffix: bigint[][] = Array.from(
    { length: components.length + 1 },
    () => [1n],
  );
  suffix[components.length] = [1n];
  for (let i = components.length - 1; i >= 0; i--) {
    suffix[i] = convolve(components[i]!.ways, suffix[i + 1]!);
  }

  const choose = binomialRow(seaSize);
  /** Ways the sea can absorb whatever the frontier left over. */
  const seaWays = (frontierMines: number): bigint => {
    const inSea = remaining - frontierMines;
    if (inSea < 0 || inSea > seaSize) return 0n;
    return choose[inSea]!;
  };

  let totalWeight = 0n;
  for (const [t, ways] of combined.entries()) {
    if (ways === 0n) continue;
    totalWeight += ways * seaWays(t);
  }

  // A board with no consistent layout at all cannot be scored; this should be
  // unreachable, and falling back beats returning nonsense.
  if (totalWeight === 0n) return approximateProbabilities(board);

  for (const [index, component] of components.entries()) {
    const others = convolve(prefix[index]!, suffix[index + 1]!);

    // For a cell to be a mine in a layout using `k` of this component's mines,
    // the other components and the sea must absorb the rest - so weight `k` by
    // every way that can happen.
    const weightForK = Array.from({ length: component.ways.length }, () => 0n);
    for (let k = 0; k < component.ways.length; k++) {
      let weight = 0n;
      for (const [j, ways] of others.entries()) {
        if (ways === 0n) continue;
        weight += ways * seaWays(k + j);
      }
      weightForK[k] = weight;
    }

    for (const [local, cell] of component.cells.entries()) {
      let mineWeight = 0n;
      for (const [k, weight] of weightForK.entries()) {
        const count = component.mineWays[k]![local]!;
        if (count === 0n || weight === 0n) continue;
        mineWeight += count * weight;
      }
      out[cell] = ratio(mineWeight, totalWeight);
    }
  }

  // Every sea cell is interchangeable, so each holds its share of whatever the
  // frontier did not account for.
  if (seaSize > 0) {
    let expectedInSea = 0n;
    for (const [t, ways] of combined.entries()) {
      if (ways === 0n) continue;
      const inSea = remaining - t;
      if (inSea <= 0 || inSea > seaSize) continue;
      expectedInSea += ways * seaWays(t) * BigInt(inSea);
    }

    const perSeaCell = ratio(expectedInSea, totalWeight * BigInt(seaSize));
    for (let index = 0; index < size; index++) {
      if (isHidden[index] && !frontier.has(index)) out[index] = perSeaCell;
    }
  }

  return out;
};

export { mineProbabilities, approximateProbabilities, NODE_BUDGET };
export type { PublicBoard };
