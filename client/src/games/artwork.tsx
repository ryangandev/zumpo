import type { ReactNode } from 'react';
import {
  CodeMarks,
  Die,
  DigitTile,
  HushCard,
  LetterTile,
  MineCell,
  NumberCard,
  PairsCard,
  PickMarker,
  SnapCard,
  Stone,
  symbolNamed,
  Tag,
  TriosCard,
  type StoneColor,
  type StoneMark,
} from '../ui';
import { turtle, TURTLE_SIZE } from '../ui/generated/drawings';
import {
  CHAIN_DRAWING_SIZE,
  chainDrawings,
  type ChainDrawingName,
  type ChainDrawingPart,
} from '../ui/generated/chain-drawings';
import { SYMBOLS, type SymbolName } from '../../../shared/snap';
import type { GameType } from '../../../shared/wire-types';
import { cx } from '../ui/cx';
import { useMessages } from '../i18n';
import styles from './artwork.module.css';

/**
 * Zumpo/Game artwork: the paper panel that shows what a game looks like, a
 * strip of play on a tile and a game's page, its signature piece as a row's
 * icon.
 */
export function GameArtwork({
  type,
  size,
  className,
}: {
  type: GameType;
  size: 'tile' | 'icon';
  className?: string;
}) {
  const Art = (size === 'tile' ? TILES : ICONS)[type];
  return (
    <div className={cx(styles[size], className)} aria-hidden="true">
      <Art />
    </div>
  );
}

/** The finished turtle at 0.26 of its size, and the word it was. */
function DrawingArtwork() {
  const m = useMessages();
  return (
    <>
      <TurtleDrawing className={styles.turtle} />
      <Tag tone="lime" icon="check">
        <span lang="en">{m.games.artwork.drawn}</span>
      </Tag>
    </>
  );
}

export function TurtleDrawing({ className }: { className?: string }) {
  return (
    <SampleDrawing
      parts={turtle.Done}
      size={TURTLE_SIZE}
      className={className}
    />
  );
}

/** Sample / Chain drawing: one of the drawings a chain shows off with. */
export function ChainDrawing({
  name,
  className,
}: {
  name: ChainDrawingName;
  className?: string;
}) {
  return (
    <SampleDrawing
      parts={chainDrawings[name]}
      size={CHAIN_DRAWING_SIZE}
      className={className}
    />
  );
}

/** A drawing from the Figma file, path for path, at any size. */
function SampleDrawing({
  parts,
  size,
  className,
}: {
  parts: readonly ChainDrawingPart[];
  size: { width: number; height: number };
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${size.width} ${size.height}`}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {parts.map((part, index) =>
        'ellipse' in part ? (
          <ellipse
            key={index}
            cx={part.x + part.w / 2}
            cy={part.y + part.h / 2}
            rx={part.w / 2}
            ry={part.h / 2}
            fill={part.fill}
          />
        ) : 'ring' in part ? (
          // Stroked inside its box, as Figma strokes an ellipse.
          <ellipse
            key={index}
            cx={part.x + part.w / 2}
            cy={part.y + part.h / 2}
            rx={(part.w - part.width) / 2}
            ry={(part.h - part.width) / 2}
            stroke={part.stroke}
            strokeWidth={part.width}
          />
        ) : (
          <path
            key={index}
            d={part.d}
            transform={`translate(${part.x} ${part.y})`}
            stroke={part.stroke}
            strokeWidth={part.width}
          />
        ),
      )}
    </svg>
  );
}

/** A hand, on cards smaller than any in play. */
function HandArtwork() {
  return (
    <div className={styles.hand}>
      {[8, 4, 7, 1].map((value) => (
        <NumberCard key={value} value={String(value)} size="compact" />
      ))}
    </div>
  );
}

/** A row of a board mid-game: a pair just found, one matched before. */
function PairsArtwork() {
  const size = 'compact';
  const star = symbolNamed('Star Orange');
  const circle = symbolNamed('Circle Coral');
  return (
    <div className={styles.pairs}>
      <PairsCard state={{ kind: 'down' }} size={size} row={0} column={0} />
      <PairsCard
        state={{ kind: 'up', symbol: star }}
        size={size}
        row={0}
        column={1}
      />
      <PairsCard
        state={{ kind: 'up', symbol: star }}
        size={size}
        row={0}
        column={2}
      />
      <PairsCard
        state={{ kind: 'matched', symbol: circle }}
        size={size}
        row={0}
        column={3}
      />
    </div>
  );
}

/** A table at a call: a cup still hidden, and dice that count, one wild. */
function DiceArtwork() {
  return (
    <div className={styles.dice}>
      <Die face="hidden" label={null} />
      <Die face={5} state="counted" label={null} />
      <Die face={1} state="wild" label={null} />
      <Die face={5} state="counted" label={null} />
    </div>
  );
}

/** A strip of a board mid-game: numbers, a safe pick, a mine. */
function BoardArtwork() {
  return (
    <div className={styles.cells}>
      <MineCell state={{ kind: 'open', adjacent: 1 }} row={0} column={0} />
      <MineCell state={{ kind: 'hidden' }} row={0} column={1} />
      <MineCell
        state={{ kind: 'open', adjacent: 2 }}
        row={0}
        column={2}
        marker={<PickMarker outcome="safe" initials="SA" />}
      />
      <MineCell state={{ kind: 'mine' }} row={0} column={3} />
      <MineCell state={{ kind: 'hidden' }} row={0} column={4} />
    </div>
  );
}

/** A trio found: every feature different. */
function TriosArtwork() {
  return (
    <div className={styles.trios}>
      {[0, 40, 80].map((card) => (
        <TriosCard key={card} card={card} state="found" size="mini" />
      ))}
    </div>
  );
}

const snapSymbols = (...names: SymbolName[]) =>
  names.map((name) => SYMBOLS.indexOf(name));
/** Two Snap cards that share the star, marked on both. */
const SNAP_A = snapSymbols(
  'tree',
  'star',
  'plus',
  'heart',
  'diamond',
  'triangle',
);
const SNAP_B = snapSymbols('star', 'bolt', 'crown', 'note', 'moon', 'cloud');
const STAR_MATCH = { [SYMBOLS.indexOf('star')]: 'match' } as const;

/** Two cards and the one symbol they share. */
function SnapArtwork() {
  return (
    <div className={styles.snap}>
      {[SNAP_A, SNAP_B].map((symbols) => (
        <SnapCard
          key={symbols.join()}
          symbols={symbols}
          size="mini"
          marks={STAR_MATCH}
        />
      ))}
    </div>
  );
}

/** The top of a pile mid-level: two cards played, and the one on top. */
function PileArtwork() {
  return (
    <div className={styles.pile}>
      {[27, 45].map((value) => (
        <HushCard key={value} value={value} state="played" size="small" />
      ))}
      <HushCard value={58} state="pile" size="small" />
    </div>
  );
}

/** The start of a guess against PLANT: one letter elsewhere, one not in it,
    one in place. */
function WordArtwork() {
  const marks = ['present', 'absent', 'correct'] as const;
  return (
    <div className={styles.word}>
      {[...'TRA'].map((letter, index) => (
        <LetterTile
          key={index}
          letter={letter}
          state={marks[index]}
          size="regular"
        />
      ))}
    </div>
  );
}

/** Three digits of a guess and the pegs that will mark it. */
function CodeArtwork() {
  return (
    <div className={styles.code}>
      {[...'407'].map((digit) => (
        <DigitTile key={digit} digit={digit} state="guessed" size="regular" />
      ))}
      <CodeMarks mark={{ right: 1, moved: 2 }} decorative />
    </div>
  );
}

/** A chain's first line, its drawing, and what the drawing became. */
function ChainArtwork() {
  const m = useMessages();
  return (
    <div className={styles.chain}>
      <Tag tone="lime">{m.games.artwork.chainLine}</Tag>
      <ChainDrawing
        name="Turtle on skateboard"
        className={styles.chainDrawing}
      />
      <Tag tone="peach">{m.games.artwork.chainGuess}</Tag>
    </div>
  );
}

/** A stone on a corner of a Gomoku board, or an empty point. */
type Spot = readonly [StoneColor, StoneMark] | null;

/**
 * A corner of a Gomoku board, its points 36 px apart: the stones of `rows`,
 * row by row from the top left.
 */
function BoardCrop({
  rows,
  className,
  children,
}: {
  rows: readonly (readonly Spot[])[];
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cx(styles.boardCrop, className)}>
      {rows.flatMap((row, r) =>
        row.map(
          (spot, c) =>
            spot && (
              <span
                key={`${r}-${c}`}
                className={styles.spot}
                style={{ gridRow: r + 1, gridColumn: c + 1 }}
              >
                <Stone color={spot[0]} mark={spot[1]} />
              </span>
            ),
        ),
      )}
      {children}
    </div>
  );
}

const WON: Spot = ['black', 'win'];

/** Black's five across the top of the board, struck through, and White's stones under it. */
function GomokuArtwork() {
  return (
    <BoardCrop
      rows={[
        [WON, WON, WON, WON, WON],
        [null, ['white', 'none'], ['white', 'none'], null, ['white', 'last']],
      ]}
      className={styles.gomoku}
    >
      <span className={styles.gomokuLine} />
    </BoardCrop>
  );
}

const TILES: Readonly<Record<GameType, () => ReactNode>> = {
  'draw-and-guess': DrawingArtwork,
  minesweeper: BoardArtwork,
  'make-24': HandArtwork,
  pairs: PairsArtwork,
  trios: TriosArtwork,
  snap: SnapArtwork,
  'liars-dice': DiceArtwork,
  hush: PileArtwork,
  'doodle-chain': ChainArtwork,
  gomoku: GomokuArtwork,
  'daily-word': WordArtwork,
  'code-breaker': CodeArtwork,
};

/** Each game's signature piece, in a row's 80 px icon. */
const ICONS: Readonly<Record<GameType, () => ReactNode>> = {
  'draw-and-guess': () => <TurtleDrawing className={styles.iconTurtle} />,
  minesweeper: () => (
    <div className={styles.iconGrid}>
      <MineCell
        state={{ kind: 'open', adjacent: 1 }}
        size="compact"
        row={0}
        column={0}
      />
      <MineCell state={{ kind: 'hidden' }} size="compact" row={0} column={1} />
      <MineCell
        state={{ kind: 'open', adjacent: 2 }}
        size="compact"
        row={1}
        column={0}
      />
      <MineCell state={{ kind: 'mine' }} size="compact" row={1} column={1} />
    </div>
  ),
  'make-24': () => (
    <span className={styles.iconSolved}>
      <NumberCard value="24" state="solved" size="compact" />
    </span>
  ),
  pairs: () => (
    <PairsCard
      state={{ kind: 'up', symbol: symbolNamed('Star Orange') }}
      size="compact"
      row={0}
      column={0}
    />
  ),
  // Two coral solid circles (shared/trios.ts)
  trios: () => <TriosCard card={3} state="found" size="mini" />,
  snap: () => <SnapCard symbols={SNAP_B} size="mini" marks={STAR_MATCH} />,
  'liars-dice': () => (
    <div className={styles.iconGrid}>
      <Die face={5} state="counted" size="compact" label={null} />
      <Die face={1} state="wild" size="compact" label={null} />
      <Die face="hidden" size="compact" label={null} />
      <Die face={5} state="counted" size="compact" label={null} />
    </div>
  ),
  hush: () => (
    <span className={styles.iconPile}>
      <HushCard value={58} state="pile" size="small" />
    </span>
  ),
  'doodle-chain': () => (
    <ChainDrawing name="Burger on skates" className={styles.iconChain} />
  ),
  gomoku: () => (
    <BoardCrop
      rows={[
        [
          ['black', 'none'],
          ['white', 'none'],
        ],
        [
          ['white', 'none'],
          ['black', 'last'],
        ],
      ]}
      className={styles.iconGomoku}
    />
  ),
  'daily-word': () => (
    <div className={styles.iconGrid}>
      {(
        [
          ['W', 'present'],
          ['O', 'absent'],
          ['R', 'correct'],
          ['D', 'correct'],
        ] as const
      ).map(([letter, state]) => (
        <LetterTile key={letter} letter={letter} state={state} size="small" />
      ))}
    </div>
  ),
  'code-breaker': () => (
    <div className={styles.iconGrid}>
      {(
        [
          ['4', 'guessed'],
          ['0', 'guessed'],
          ['7', 'cracked'],
          ['1', 'cracked'],
        ] as const
      ).map(([digit, state]) => (
        <DigitTile key={digit} digit={digit} state={state} size="small" />
      ))}
    </div>
  ),
};
