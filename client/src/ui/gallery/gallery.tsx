// The design gallery: every Zumpo component in the states the Figma file
// draws, beside that family's Figma preview, each measured against the
// export. Development only, at /design.

import { pointAt, POINTS } from '../../../../shared/gomoku';
import { itemAt } from '../../../../shared/list';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import '../zumpo.css';
import {
  Avatar,
  AVATAR_TONES,
  Bid,
  BidPicker,
  Button,
  Card,
  ChipField,
  FilterChipField,
  ChoiceList,
  Chat,
  CodeBoard,
  CodeMarks,
  CodeMarksBoard,
  CodeRaceBoard,
  ChatInput,
  ChatMessage,
  Countdown,
  Cup,
  Dialog,
  DialogClose,
  Die,
  DigitPad,
  DigitTile,
  DrawingToolbar,
  FilterChip,
  GomokuBoard,
  GomokuSeat,
  Header,
  Icon,
  Keyboard,
  LetterKey,
  LetterTile,
  MineCell,
  MobileTabs,
  Notice,
  PickerField,
  NumberCard,
  OperatorKey,
  PairsCard,
  HushCard,
  Lives,
  PairsSymbol,
  symbolName,
  PickMarker,
  PickResult,
  PlayerRow,
  RaceBoard,
  RoomBar,
  RoomRow,
  Scoreboard,
  SelectField,
  StatList,
  Tag,
  TextField,
  ToggleChip,
  SnapCard,
  SnapSymbol,
  Stone,
  TriosCard,
  TriosShape,
  TurnBar,
  WordBoard,
  WordChoice,
  Wordmark,
  type BrushName,
  type BrushSize,
  type DieFace,
  type GlyphName,
  ChainComposer,
  ChainEntry,
  HeartButton,
  HowToPlay,
} from '..';
import { GAMES, scoreOf } from '../../games/catalog';
import { ChainDrawing, GameArtwork } from '../../games/artwork';
import { GameCard } from '../../games/game-card';
import { GameIntro } from '../../games/game-intro';
import { useMessages } from '../../i18n';
import { PHONE, useMediaQuery } from '../../shell/use-media-query';
import { glyphs } from '../generated/glyphs';
import { pairsSymbols } from '../generated/pairs-symbols';
import { snapSymbols } from '../generated/snap-symbols';
import { Specimen } from './specimen';
import styles from './gallery.module.css';

const noop = () => {};

/** Chip field's sample: Draw & Guess's word categories, five of them on. */
const SAMPLE_CATEGORIES: readonly string[] = [
  'Animals',
  'Clothing',
  'Electronics',
  'Fantasy',
  'Food',
  'Fruits',
  'Household',
  'Jobs',
  'League of Legends',
  'Music',
  'Nature',
  'Places',
  'Sea Life',
  'Sports',
  'Vehicles',
];
const SAMPLE_PICKED = ['Animals', 'Food', 'Fruits', 'Music', 'Sea Life'];

/** A Gomoku game won by Black on the diagonal from C11 to G7 (GM13). */
const GOMOKU_LINE = [0, 1, 2, 3, 4].map((step) => pointAt(2 + step, 11 - step));
const GOMOKU_WHITE = [
  pointAt(3, 11),
  pointAt(4, 10),
  pointAt(5, 10),
  pointAt(3, 8),
  pointAt(7, 7),
];
const GOMOKU_STONES = Array.from({ length: POINTS }, (_, point) =>
  GOMOKU_LINE.includes(point)
    ? ('black' as const)
    : GOMOKU_WHITE.includes(point)
      ? ('white' as const)
      : null,
);

/** The symbols every Zumpo/Snap card variant shows, spot by spot. */
const SNAP_SAMPLE = ['Star', 'Heart', 'Cloud', 'Crown', 'Fish', 'Leaf'].map(
  (name) => snapSymbols.findIndex((symbol) => symbol.name === name),
);
const SNAP_STAR = snapSymbols.findIndex((symbol) => symbol.name === 'Star');

/** Who made each kind of entry in the chain the gallery shows. */
const CHAIN_AUTHORS = {
  prompt: {
    name: 'Maya',
    initials: 'MA',
    tone: 'peach',
    verb: 'started the chain',
  },
  drawing: { name: 'Ryan', initials: 'RG', tone: 'blue', verb: 'drew it' },
  description: {
    name: 'Leo',
    initials: 'LE',
    tone: 'lime',
    verb: 'described it',
  },
  empty: { name: 'Sam', initials: 'SA', tone: 'sand', verb: 'ran out of time' },
} as const;

/** Trios cards for the gallery, with how many shapes each shows. */
const TRIOS_SPECIMENS = [
  [40, 2],
  [0, 1],
  [80, 3],
  [41, 2],
  [62, 3],
] as const;

const cap = (word: string) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`;

const BID_TEXT =
  'Figma rounds each of the three text runs up to a whole pixel, 2 px in all; the stroke and spacing match.';

const CLOCK_CELLS =
  'Wider on purpose: DM Sans has no tabular figures, so each digit sits in a fixed cell and the clock never changes width as it ticks.';

function Family({
  name,
  file,
  note,
  children,
}: {
  name: string;
  file: string;
  note?: string;
  children: ReactNode;
}) {
  const [preview, setPreview] = useState<boolean | null>(null);
  return (
    <section className={styles.family} id={file}>
      <header className={styles.familyHead}>
        <h2 className={styles.familyName}>{name}</h2>
        {note && <p className={styles.familyNote}>{note}</p>}
      </header>
      <div className={styles.specimens}>{children}</div>
      <figure className={styles.reference}>
        {preview !== false && (
          <img
            src={`/__figma/previews/components/${file}.png`}
            alt={`${name} in Figma`}
            onLoad={() => setPreview(true)}
            onError={() => setPreview(false)}
          />
        )}
        <figcaption className={styles.referenceCaption}>
          {preview === false
            ? 'No Figma preview: run npm run design:export with previews.'
            : 'Figma, from the latest export'}
        </figcaption>
      </figure>
    </section>
  );
}

function Mismatches() {
  const phone = useMediaQuery(PHONE);
  if (phone)
    return (
      <p className={styles.summary}>
        Nothing is compared with Figma in a window 640 px wide or narrower:
        there the mine cell, the header, the name menu and the cup take their
        phone sizes, which Figma draws only inside its 390 px screens. Widen the
        window to compare.
      </p>
    );
  return <MismatchCount />;
}

function MismatchCount() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setCount(document.querySelectorAll('[data-mismatch]').length),
      1500,
    );
    return () => window.clearTimeout(timer);
  }, []);
  if (count === null)
    return <p className={styles.summary}>Measuring against Figma…</p>;
  return (
    <p className={styles.summary}>
      {count === 0
        ? 'Every measured specimen matches its Figma size.'
        : `${count} specimen${count === 1 ? '' : 's'} differ from Figma by more than half a pixel (in red).`}
    </p>
  );
}

const PLAYERS = {
  maya: { name: 'Maya', initials: 'MA', tone: 'peach' },
  ryan: { name: 'Ryan', initials: 'RG', tone: 'blue' },
  leo: { name: 'Leo', initials: 'LE', tone: 'lime' },
  sam: { name: 'Sam', initials: 'SA', tone: 'sand' },
} as const;

/** The avatar Figma's Player row and Pick result samples use. */
const SAMPLE_AVATAR = { initials: 'RG', tone: 'peach' } as const;

export default function Gallery() {
  const m = useMessages();
  const [seats, setSeats] = useState(8);
  const [rounds, setRounds] = useState(2);
  const [board, setBoard] = useState<'small' | 'medium' | 'large'>('medium');
  const [choice, setChoice] = useState('medium');
  const [bots, setBots] = useState(3);
  const [categories, setCategories] =
    useState<readonly string[]>(SAMPLE_PICKED);
  const [colour, setColour] = useState<BrushName>('ink');
  const [size, setSize] = useState<BrushSize>(10);
  const [view, setView] = useState<'board' | 'players' | 'chat'>('board');
  const [dialog, setDialog] = useState(false);
  const stay = useRef<HTMLButtonElement>(null);

  return (
    <div className={`zumpo zumpo-page ${styles.page}`}>
      <div className={styles.intro}>
        <Wordmark />
        <h1 className={styles.title}>Design system</h1>
        <p className={styles.lede}>
          The Shared pieces of the Figma file as code. Each specimen is
          captioned with its Figma variant and measured against the export; the
          family&rsquo;s Figma preview sits beside it.
        </p>
        <Mismatches />
      </div>

      <Family name="Button" file="button">
        {(['primary', 'secondary', 'quiet', 'danger'] as const).map(
          (variant) => {
            const style = cap(variant);
            return [
              <Specimen
                key={variant}
                family="button"
                variant={`Style=${style}, State=Default`}
              >
                <Button variant={variant}>Let’s play</Button>
              </Specimen>,
              <Specimen
                key={`${variant}-disabled`}
                family="button"
                variant={`Style=${style}, State=Disabled`}
              >
                <Button variant={variant} disabled>
                  Let’s play
                </Button>
              </Specimen>,
            ];
          },
        )}
        <Specimen family="button" label="With icon">
          <Button variant="secondary" icon="leave">
            Leave room
          </Button>
        </Specimen>
        <Specimen family="button" label="Icon only">
          <Button variant="secondary" icon="leave" iconOnly>
            Leave room
          </Button>
        </Specimen>
      </Family>

      <Family
        name="Icon"
        file="icon"
        note="24 px line icons, 2 px strokes in currentColor."
      >
        {(Object.keys(glyphs) as GlyphName[]).map((glyph) => (
          <Specimen
            key={glyph}
            family="icon"
            variant={`Glyph=${glyph}`}
            label={glyph}
          >
            <Icon glyph={glyph} />
          </Specimen>
        ))}
      </Family>

      <Family name="Avatar" file="avatar">
        {AVATAR_TONES.map((tone) => (
          <Specimen key={tone} family="avatar" variant={`Tone=${cap(tone)}`}>
            <Avatar initials="RG" tone={tone} />
          </Specimen>
        ))}
        <Specimen family="avatar" label="Small (phone header)">
          <Avatar initials="MA" tone="peach" size="small" />
        </Specimen>
      </Family>

      <Family name="Tag" file="tag">
        {(['sand', 'blue', 'lime', 'peach', 'paper', 'ink'] as const).map(
          (tone) => (
            <Specimen key={tone} family="tag" variant={`Tone=${cap(tone)}`}>
              <Tag tone={tone}>Waiting room</Tag>
            </Specimen>
          ),
        )}
        <Specimen family="tag" label="With icon">
          <Tag tone="lime" icon="check">
            Safe
          </Tag>
        </Specimen>
        <Specimen family="tag" label="Compact">
          <Tag size="compact">You</Tag>
        </Specimen>
      </Family>

      <Family name="Filter chip" file="filter-chip">
        <Specimen family="filter-chip" variant="State=Default">
          <FilterChip selected={false} onSelect={() => {}}>
            Puzzles
          </FilterChip>
        </Specimen>
        <Specimen family="filter-chip" variant="State=Selected">
          <FilterChip selected onSelect={() => {}}>
            Puzzles
          </FilterChip>
        </Specimen>
        <Specimen label="Filter chip field: Bots, one choice" width={320}>
          <FilterChipField
            label="Bots"
            value={bots}
            onValueChange={setBots}
            options={[1, 2, 3, 4, 5].map((count) => ({
              value: count,
              label: String(count),
              name: count === 1 ? '1 bot' : `${count} bots`,
            }))}
          />
        </Specimen>
      </Family>

      <Family name="Notice" file="notice">
        {(['info', 'success', 'error', 'pending'] as const).map((tone) => (
          <Specimen
            key={tone}
            family="notice"
            variant={`Tone=${cap(tone)}`}
            width={560}
          >
            <Notice tone={tone}>Connection restored. Welcome back!</Notice>
          </Specimen>
        ))}
        <Specimen family="notice" label="Two lines" width={360}>
          <Notice tone="error">
            That room is full now. Pick another one, or make your own room.
          </Notice>
        </Specimen>
      </Family>

      <Family
        name="How to play"
        file="how-to-play"
        note="A game in half a minute: under a waiting card with its heading and goal, and in the How to play dialog as steps with the score last."
      >
        <Specimen family="how-to-play" label="Waiting card" width={360}>
          <HowToPlay
            heading={m.ui.room.howToPlay}
            goal={m.games.of['draw-and-guess'].howToPlay.goal}
            steps={m.games.of['draw-and-guess'].howToPlay.steps}
          />
        </Specimen>
        <Specimen label="Dialog: steps only" width={360}>
          <HowToPlay
            steps={[
              ...m.games.of['draw-and-guess'].howToPlay.steps,
              m.games.of['draw-and-guess'].howToPlay.score,
            ]}
          />
        </Specimen>
      </Family>

      <Family
        name="Countdown"
        file="countdown"
        note="Urgent is automatic in the last 5 seconds of a phase you act in. Info is a clock that ends nothing: a hint, a card, a run."
      >
        <Specimen
          family="countdown"
          variant="Tone=Running"
          deviation={CLOCK_CELLS}
        >
          <Countdown seconds={15} label="to pick" />
        </Specimen>
        <Specimen
          family="countdown"
          variant="Tone=Waiting"
          deviation={CLOCK_CELLS}
        >
          <Countdown seconds={15} label="to pick" waiting />
        </Specimen>
        <Specimen
          family="countdown"
          variant="Tone=Urgent"
          deviation={CLOCK_CELLS}
        >
          <Countdown seconds={4} label="to pick" />
        </Specimen>
        <Specimen
          family="countdown"
          variant="Tone=Info"
          deviation={CLOCK_CELLS}
        >
          <Countdown seconds={28} label="to a hint" deadline={false} />
        </Specimen>
      </Family>

      <Family name="Input" file="input">
        <Specimen family="input" variant="State=Default" width={496}>
          <TextField
            label="Your name"
            defaultValue="Maya"
            helper="Up to 18 characters."
          />
        </Specimen>
        <Specimen family="input" variant="State=Error" width={496}>
          <TextField
            label="Your name"
            defaultValue="Maya"
            error="That name is taken in this room."
          />
        </Specimen>
        <Specimen family="input" variant="State=Disabled" width={496}>
          <TextField
            label="Your name"
            defaultValue="Maya"
            helper="Up to 18 characters."
            disabled
          />
        </Specimen>
        <Specimen family="input" label="Select: Seats" width={496}>
          <SelectField
            label="Seats"
            value={seats}
            onValueChange={setSeats}
            options={[2, 3, 4, 5, 6, 7, 8].map((n) => ({
              value: n,
              label: `${n} players`,
            }))}
            helper="Up to 8 players."
          />
        </Specimen>
        <Specimen family="input" label="Select: Rounds" width={496}>
          <SelectField
            label="Rounds"
            value={rounds}
            onValueChange={setRounds}
            options={[1, 2, 3, 4].map((n) => ({
              value: n,
              label: n === 1 ? '1 round' : `${n} rounds`,
            }))}
          />
        </Specimen>
        <Specimen family="input" label="Select: Board" width={496}>
          <SelectField
            label="Board"
            value={board}
            onValueChange={setBoard}
            options={[
              { value: 'small', label: 'Small', detail: '9 × 9 · 10 mines' },
              {
                value: 'medium',
                label: 'Medium',
                detail: '16 × 16 · 40 mines',
              },
              { value: 'large', label: 'Large', detail: '30 × 16 · 99 mines' },
            ]}
            helper={
              {
                small: '9 × 9 · 10 mines',
                medium: '16 × 16 · 40 mines',
                large: '30 × 16 · 99 mines',
              }[board]
            }
          />
        </Specimen>
        <Specimen
          family="input"
          label="Select: Word categories, opening a dialog"
          width={496}
        >
          <PickerField label="Word categories" value="All 15" onOpen={noop} />
        </Specimen>
      </Family>

      <Family name="Chat message" file="chat-message">
        <Specimen family="chat-message" variant="Kind=Player" width={296}>
          <ul
            style={{ margin: 0, padding: 0, listStyle: 'none', width: '100%' }}
          >
            <ChatMessage kind="player" name="Ryan">
              a turtle?
            </ChatMessage>
          </ul>
        </Specimen>
        {(['system', 'score', 'divider', 'success', 'alert'] as const).map(
          (kind) => (
            <Specimen
              key={kind}
              family="chat-message"
              variant={`Kind=${cap(kind)}`}
              width={296}
            >
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                  width: '100%',
                }}
              >
                <ChatMessage kind={kind}>a turtle?</ChatMessage>
              </ul>
            </Specimen>
          ),
        )}
        <Specimen family="chat-message" variant="Kind=Close" width={296}>
          <ul
            style={{ margin: 0, padding: 0, listStyle: 'none', width: '100%' }}
          >
            <ChatMessage kind="close" name="Ryan" note="So close!">
              a turtle?
            </ChatMessage>
          </ul>
        </Specimen>
        <Specimen family="chat-message" label="Wrapped" width={296}>
          <ul
            style={{ margin: 0, padding: 0, listStyle: 'none', width: '100%' }}
          >
            <ChatMessage kind="success">
              Sam guessed the word! +112 and the round is over
            </ChatMessage>
          </ul>
        </Specimen>
      </Family>

      <Family name="Chat input" file="chat-input">
        <Specimen family="chat-input" variant="State=Default" width={296}>
          <ChatInput onSend={noop} />
        </Specimen>
        <Specimen family="chat-input" variant="State=Disabled" width={296}>
          <ChatInput onSend={noop} lockedReason="Type a guess or say hi…" />
        </Specimen>
      </Family>

      <Family name="Chat" file="chat">
        <Specimen family="chat" width={344}>
          <Chat input={{ onSend: noop }}>
            <ChatMessage kind="system">
              Game has started! The category is Animals.
            </ChatMessage>
            <ChatMessage kind="player" name="Ryan">
              a rock?
            </ChatMessage>
            <ChatMessage kind="player" name="Leo">
              tortoise
            </ChatMessage>
            <ChatMessage kind="success">Sam guessed the word! +112</ChatMessage>
            <ChatMessage kind="player" name="Ryan">
              a shell with legs
            </ChatMessage>
            <ChatMessage kind="player" name="Leo">
              snail?
            </ChatMessage>
          </Chat>
        </Specimen>
      </Family>

      <Family name="Player row" file="player-row">
        {(['default', 'highlight', 'scored', 'away'] as const).map((state) => (
          <Specimen
            key={state}
            family="player-row"
            variant={`State=${cap(state)}`}
            width={312}
          >
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                width: '100%',
              }}
            >
              <PlayerRow
                {...PLAYERS.maya}
                {...SAMPLE_AVATAR}
                status="Drawing"
                statusIcon="brush"
                score={460}
                state={state}
              />
            </ul>
          </Specimen>
        ))}
        <Specimen family="player-row" label="Host and you" width={312}>
          <ul
            style={{ margin: 0, padding: 0, listStyle: 'none', width: '100%' }}
          >
            <PlayerRow {...PLAYERS.sam} status="Waiting" score={180} host you />
          </ul>
        </Specimen>
        <Specimen family="player-row" label="Show score off" width={312}>
          <ul
            style={{ margin: 0, padding: 0, listStyle: 'none', width: '100%' }}
          >
            <PlayerRow
              {...PLAYERS.maya}
              {...SAMPLE_AVATAR}
              status="Level cleared"
              statusIcon="check"
              state="scored"
            />
          </ul>
        </Specimen>
      </Family>

      <Family name="Scoreboard" file="scoreboard">
        <Specimen family="scoreboard" width={344}>
          <Scoreboard players={4} seats={8}>
            <PlayerRow
              {...PLAYERS.maya}
              status="Drawing"
              statusIcon="brush"
              score={460}
              host
              state="highlight"
            />
            <PlayerRow {...PLAYERS.ryan} status="Guessing" score={320} />
            <PlayerRow {...PLAYERS.leo} status="Guessing" score={240} />
            <PlayerRow {...PLAYERS.sam} status="Guessing" score={180} you />
          </Scoreboard>
        </Specimen>
      </Family>

      <Family name="Room row" file="room-row">
        {(['open', 'private', 'full', 'playing'] as const).map((status) => (
          <Specimen
            key={status}
            family="room-row"
            variant={`Status=${cap(status)}, Layout=Desktop`}
            width={840}
          >
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                width: '100%',
              }}
            >
              <RoomRow
                name="Maya’s room"
                details="Hosted by Maya · 3 rounds"
                host={PLAYERS.maya}
                players={status === 'full' ? 8 : 4}
                seats={8}
                status={status}
                onJoin={noop}
              />
            </ul>
          </Specimen>
        ))}
        <Specimen
          family="room-row"
          variant="Status=Open, Layout=Phone"
          width={350}
        >
          <ul
            style={{ margin: 0, padding: 0, listStyle: 'none', width: '100%' }}
          >
            <RoomRow
              name="Maya’s room"
              details="Hosted by Maya · 3 rounds"
              host={PLAYERS.maya}
              players={4}
              seats={8}
              status="open"
              onJoin={noop}
            />
          </ul>
        </Specimen>
      </Family>

      <Family name="Turn bar" file="turn-bar">
        <Specimen
          family="turn-bar"
          variant="Kind=Word, Layout=Desktop"
          width={944}
        >
          <TurnBar
            category="Animals"
            label="Guess the word"
            kind="word"
            main="__r___"
            meta="6 letters"
            countdown={{ seconds: 72, label: 'left' }}
          />
        </Specimen>
        <Specimen
          family="turn-bar"
          variant="Kind=Hint, Layout=Desktop"
          width={944}
        >
          <TurnBar
            category="Animals"
            label="Guess the word"
            kind="hint"
            main="__r___"
            meta="6 letters"
            countdown={{ seconds: 58, label: 'left' }}
          />
        </Specimen>
        <Specimen
          family="turn-bar"
          variant="Kind=Status, Layout=Desktop"
          width={944}
        >
          <TurnBar
            category="Animals"
            label="Guess the word"
            kind="status"
            main="__r___"
            meta="6 letters"
            countdown={{ seconds: 12, label: 'to choose', waiting: true }}
          />
        </Specimen>
        <Specimen
          family="turn-bar"
          variant="Kind=Hint, Layout=Phone"
          width={350}
        >
          <TurnBar
            category="Animals"
            label="Guess the word"
            kind="hint"
            main="__r___"
            meta="6 letters"
            countdown={{ seconds: 58, label: 'left' }}
          />
        </Specimen>
      </Family>

      <Family name="Drawing toolbar" file="drawing-toolbar">
        <Specimen family="drawing-toolbar" variant="Layout=Desktop" width={944}>
          <DrawingToolbar
            colour={colour}
            onColourChange={setColour}
            size={size}
            onSizeChange={setSize}
            onUndo={noop}
            onClear={noop}
          />
        </Specimen>
        <Specimen family="drawing-toolbar" variant="Layout=Phone" width={358}>
          <DrawingToolbar
            colour={colour}
            onColourChange={setColour}
            size={size}
            onSizeChange={setSize}
            onUndo={noop}
            onClear={noop}
          />
        </Specimen>
      </Family>

      <Family name="Word choice" file="word-choice">
        <Specimen family="word-choice" width={260}>
          <WordChoice word="Turtle" onChoose={noop} />
        </Specimen>
      </Family>

      <Family
        name="Mine cell"
        file="mine-cell"
        note="Regular is 36 px on phones."
      >
        {(['regular', 'compact'] as const).map((cellSize) => {
          const sizeName = cellSize === 'regular' ? 'Regular' : 'Compact';
          return (
            <div
              key={cellSize}
              className={styles.cellRow}
              role="grid"
              aria-label={sizeName}
            >
              <div role="row" className={styles.cellRow}>
                <Specimen
                  family="mine-cell"
                  variant={`State=Hidden, Size=${sizeName}`}
                  label="Hidden"
                >
                  <MineCell
                    state={{ kind: 'hidden' }}
                    size={cellSize}
                    row={0}
                    column={0}
                    onPick={noop}
                  />
                </Specimen>
                <Specimen
                  family="mine-cell"
                  variant={`State=Picked, Size=${sizeName}`}
                  label="Picked"
                >
                  <MineCell
                    state={{ kind: 'picked' }}
                    size={cellSize}
                    row={0}
                    column={1}
                  />
                </Specimen>
                <Specimen
                  family="mine-cell"
                  variant={`State=Empty, Size=${sizeName}`}
                  label="Empty"
                >
                  <MineCell
                    state={{ kind: 'open', adjacent: 0 }}
                    size={cellSize}
                    row={0}
                    column={2}
                  />
                </Specimen>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <Specimen
                    key={n}
                    family="mine-cell"
                    variant={`State=${n}, Size=${sizeName}`}
                    label={String(n)}
                  >
                    <MineCell
                      state={{ kind: 'open', adjacent: n }}
                      size={cellSize}
                      row={0}
                      column={2 + n}
                    />
                  </Specimen>
                ))}
                <Specimen
                  family="mine-cell"
                  variant={`State=Mine, Size=${sizeName}`}
                  label="Mine"
                >
                  <MineCell
                    state={{ kind: 'mine' }}
                    size={cellSize}
                    row={0}
                    column={11}
                  />
                </Specimen>
                {(
                  [
                    ['Flag', 'flag'],
                    ['Hit', 'hit'],
                    ['Wrong flag', 'wrong-flag'],
                  ] as const
                ).map(([state, kind], index) => (
                  <Specimen
                    key={kind}
                    family="mine-cell"
                    variant={`State=${state}, Size=${sizeName}`}
                    label={state}
                  >
                    <MineCell
                      state={{ kind }}
                      size={cellSize}
                      row={0}
                      column={12 + index}
                    />
                  </Specimen>
                ))}
              </div>
            </div>
          );
        })}
      </Family>

      <Family
        name="Pick marker"
        file="pick-marker"
        note="Laid over a cell during the reveal."
      >
        {(['regular', 'compact'] as const).map((cellSize) =>
          (['safe', 'mine', 'auto'] as const).map((outcome) => (
            <Specimen
              key={`${cellSize}-${outcome}`}
              family="pick-marker"
              variant={`Outcome=${cap(outcome)}, Size=${cellSize === 'regular' ? 'Regular' : 'Compact'}`}
            >
              <span
                className={
                  cellSize === 'regular'
                    ? styles.markerBox
                    : styles.markerBoxCompact
                }
              >
                <PickMarker outcome={outcome} initials="SA" size={cellSize} />
              </span>
            </Specimen>
          )),
        )}
        <div className={styles.cellRow} role="grid" aria-label="Reveal">
          <div role="row" className={styles.cellRow}>
            {(['safe', 'mine', 'auto'] as const).map((outcome, column) => (
              <Specimen key={outcome} label={`Over a cell: ${outcome}`}>
                <MineCell
                  state={
                    outcome === 'mine'
                      ? { kind: 'mine' }
                      : { kind: 'open', adjacent: 1 }
                  }
                  row={0}
                  column={column}
                  marker={<PickMarker outcome={outcome} initials="SA" />}
                />
              </Specimen>
            ))}
          </div>
        </div>
      </Family>

      <Family
        name="Number card"
        file="number-card"
        note="Values longer than two characters, such as 8/3, step down a text size."
      >
        {(['regular', 'compact'] as const).map((cardSize) => {
          const sizeName = cardSize === 'regular' ? 'Regular' : 'Compact';
          return (
            <div key={cardSize} className={styles.cellRow}>
              {(
                [
                  ['Default', 'default', '8', undefined],
                  ['Selected', 'selected', '8', undefined],
                  ['Made', 'made', '4', '8 − 4'],
                  ['Solved', 'solved', '24', '4 × 6'],
                  ['Not 24', 'not-24', '20', 'Not 24'],
                ] as const
              ).map(([state, kind, value, formula]) => (
                <Specimen
                  key={kind}
                  family="number-card"
                  variant={`State=${state}, Size=${sizeName}`}
                  label={state}
                >
                  <NumberCard
                    value={value}
                    formula={formula}
                    state={kind}
                    size={cardSize}
                  />
                </Specimen>
              ))}
              <Specimen label="A fraction">
                <NumberCard
                  value="8/3"
                  formula="8 ÷ 3"
                  state="made"
                  size={cardSize}
                />
              </Specimen>
              <Specimen label="A button">
                <NumberCard value="7" size={cardSize} label="7" onPick={noop} />
              </Specimen>
            </div>
          );
        })}
      </Family>

      <Family name="Operator key" file="operator-key">
        <Specimen family="operator-key" variant="State=Default">
          <OperatorKey symbol="×" label="times" onPick={noop} />
        </Specimen>
        <Specimen family="operator-key" variant="State=Selected">
          <OperatorKey symbol="×" label="times" selected onPick={noop} />
        </Specimen>
      </Family>

      <Family name="Pairs card" file="pairs-card">
        {(
          [
            ['regular', 'Regular'],
            ['compact', 'Compact'],
            ['large', 'Large'],
          ] as const
        ).map(([cardSize, sizeName]) => {
          return (
            <div
              key={cardSize}
              className={styles.cellRow}
              role="grid"
              aria-label={`Pairs ${sizeName}`}
            >
              <div role="row" className={styles.cellRow}>
                {(
                  [
                    ['Down', { kind: 'down' }],
                    ['Up', { kind: 'up', symbol: 0 }],
                    ['Matched', { kind: 'matched', symbol: 0 }],
                  ] as const
                ).map(([state, cardState]) => (
                  <Specimen
                    key={state}
                    family="pairs-card"
                    variant={`State=${state}, Size=${sizeName}`}
                    label={state}
                  >
                    <PairsCard
                      state={cardState}
                      size={cardSize}
                      row={0}
                      column={0}
                      onPick={noop}
                    />
                  </Specimen>
                ))}
              </div>
            </div>
          );
        })}
      </Family>

      <Family
        name="Pairs symbol"
        file="pairs-symbol"
        note="Nine shapes in two brush colours each; a Small board draws eight of them."
      >
        <div className={styles.cellRow}>
          {pairsSymbols.map((_, symbol) => (
            <Specimen
              key={symbol}
              family="pairs-symbol"
              variant={`Symbol=${symbolName(symbol)}`}
              label={symbolName(symbol)}
            >
              <PairsSymbol symbol={symbol} />
            </Specimen>
          ))}
        </div>
      </Family>

      <Family
        name="Snap card"
        file="snap-card"
        note="Six spots, one in the middle and five around it; a spot is marked as the match, a wrong tap, or dim while you are locked out."
      >
        {(
          [
            ['regular', 'Regular'],
            ['compact', 'Compact'],
            ['mini', 'Mini'],
          ] as const
        ).map(([cardSize, sizeName]) => (
          <div key={cardSize} className={styles.cellRow}>
            {(['Default', 'Taken', 'Locked'] as const).map((state) => (
              <Specimen
                key={state}
                family="snap-card"
                variant={`State=${state}, Size=${sizeName}`}
                label={`${state}, ${sizeName}`}
              >
                <SnapCard
                  symbols={SNAP_SAMPLE}
                  size={cardSize}
                  state={state.toLowerCase() as Lowercase<typeof state>}
                  badge={
                    state === 'Taken' && cardSize !== 'mini' ? 'MA' : undefined
                  }
                  onTap={state === 'Default' ? noop : undefined}
                />
              </Specimen>
            ))}
          </div>
        ))}
        <div className={styles.cellRow}>
          {(['match', 'miss'] as const).map((mark) => (
            <Specimen key={mark} label={`Spot marked ${mark}`}>
              <SnapCard
                symbols={SNAP_SAMPLE}
                size="compact"
                marks={{ [SNAP_STAR]: mark }}
              />
            </Specimen>
          ))}
        </div>
      </Family>

      <Family
        name="Snap symbol"
        file="snap-symbol"
        note="31 shapes, each in one brush colour; no two share a shape."
      >
        <div className={styles.cellRow}>
          {snapSymbols.map(({ name }, symbol) => (
            <Specimen
              key={name}
              family="snap-symbol"
              variant={`Symbol=${name}`}
              label={name}
            >
              <SnapSymbol symbol={symbol} />
            </Specimen>
          ))}
        </div>
      </Family>

      <Family name="Trios card" file="trios-card">
        {(
          [
            [
              'regular',
              'Regular',
              ['Default', 'Selected', 'Found', 'Wrong', 'Hinted'],
            ],
            [
              'compact',
              'Compact',
              ['Default', 'Selected', 'Found', 'Wrong', 'Hinted'],
            ],
            ['mini', 'Mini', ['Default', 'Found']],
          ] as const
        ).map(([cardSize, sizeName, states]) => (
          <div key={cardSize} className={styles.cellRow}>
            {states.map((state, index) => {
              // Every count, colour, shape and fill appears in a row.
              const [card, count] = itemAt(TRIOS_SPECIMENS, index);
              return (
                <Specimen
                  key={state}
                  family="trios-card"
                  variant={`Count=${count}, State=${state}, Size=${sizeName}`}
                  label={`${state}, ${sizeName}`}
                >
                  <TriosCard
                    card={card}
                    state={state.toLowerCase() as Lowercase<typeof state>}
                    size={cardSize}
                    badge={
                      state === 'Found' && cardSize !== 'mini'
                        ? 'MA'
                        : state === 'Hinted'
                          ? 'Hint'
                          : undefined
                    }
                  />
                </Specimen>
              );
            })}
          </div>
        ))}
      </Family>

      <Family
        name="Trios shape"
        file="trios-shape"
        note="Three shapes, three fills, three colours: 27 in all, scaled as a whole on smaller cards."
      >
        {(['circle', 'triangle', 'square'] as const).map((shape) => (
          <div key={shape} className={styles.cellRow}>
            {(['solid', 'striped', 'outline'] as const).flatMap((fill) =>
              (['coral', 'blue', 'ink'] as const).map((tone) => (
                <Specimen
                  key={`${fill}-${tone}`}
                  family="trios-shape"
                  variant={`Shape=${cap(shape)}, Fill=${cap(fill)}, Colour=${cap(tone)}`}
                  label={`${cap(tone)} ${fill}`}
                >
                  <TriosShape shape={shape} fill={fill} colour={tone} />
                </Specimen>
              )),
            )}
          </div>
        ))}
      </Family>

      <Family name="Die" file="die">
        {(['regular', 'compact'] as const).map((dieSize) => {
          const sizeName = dieSize === 'regular' ? 'Regular' : 'Compact';
          return (
            <div key={dieSize} className={styles.cellRow}>
              {([1, 2, 3, 4, 5, 6] as const).map((face) => (
                <Specimen
                  key={face}
                  family="die"
                  variant={`Face=${face}, State=Default, Size=${sizeName}`}
                  label={String(face)}
                >
                  <Die face={face} size={dieSize} />
                </Specimen>
              ))}
              {(
                [
                  [5, 'counted', 'Counted'],
                  [1, 'wild', 'Wild'],
                  [2, 'dim', 'Dim'],
                ] as const
              ).map(([face, state, stateName]) => (
                <Specimen
                  key={state}
                  family="die"
                  variant={`Face=${face}, State=${stateName}, Size=${sizeName}`}
                  label={stateName}
                >
                  <Die face={face} state={state} size={dieSize} />
                </Specimen>
              ))}
              {(['hidden', 'empty'] as const).map((face) => (
                <Specimen
                  key={face}
                  family="die"
                  variant={`Face=${face === 'hidden' ? 'Hidden' : 'Empty'}, State=Default, Size=${sizeName}`}
                  label={face === 'hidden' ? 'Hidden' : 'Empty'}
                >
                  <Die face={face} size={dieSize} />
                </Specimen>
              ))}
            </div>
          );
        })}
      </Family>

      <Family name="Bid" file="bid">
        <Specimen family="bid" variant="Kind=Latest" deviation={BID_TEXT}>
          <Bid name="Leo" count={5} face={5} latest />
        </Specimen>
        <Specimen family="bid" variant="Kind=Earlier" deviation={BID_TEXT}>
          <Bid name="Leo" count={5} face={5} />
        </Specimen>
      </Family>

      <Family
        name="Cup"
        file="cup"
        note="Row is the phone table's cup in a 3-dice game; it fills its row, 350 px in Figma."
      >
        {(
          [
            ['regular', 'stack'],
            ['compact', 'stack'],
            ['compact', 'row'],
          ] as const
        ).map(([cupSize, layout]) => (
          <div key={`${cupSize}-${layout}`} className={styles.cellRow}>
            {(
              [
                ['default', 'Default'],
                ['turn', 'Turn'],
                ['lost', 'Lost'],
              ] as const
            ).map(([state, stateName]) => (
              <Specimen
                key={state}
                family="cup"
                variant={`State=${stateName}, Dice=${cupSize === 'regular' ? 'Regular' : 'Compact'}, Layout=${layout === 'stack' ? 'Stack' : 'Row'}`}
                width={layout === 'row' ? 350 : undefined}
              >
                <Cup
                  name="Leo"
                  initials="LE"
                  tone="lime"
                  detail="3 dice"
                  state={state}
                  size={cupSize}
                  layout={layout}
                  dice={
                    cupSize === 'regular'
                      ? ([5, 4, 1] as const).map((face: DieFace) => ({ face }))
                      : [
                          { face: 'hidden' },
                          { face: 'hidden' },
                          { face: 'hidden' },
                        ]
                  }
                />
              </Specimen>
            ))}
          </div>
        ))}
      </Family>

      <Family
        name="Bid picker"
        file="bid-picker"
        note="It takes the width it is given, as beside your cup; Phone is the same picker in a column narrower than its 518 px row."
      >
        {(
          [
            ['Desktop', 518],
            ['Phone', 342],
          ] as const
        ).map(([layout, width]) => (
          <Specimen
            key={layout}
            family="bid-picker"
            variant={`Layout=${layout}`}
            width={width}
          >
            <BidPicker
              count={5}
              face={6}
              onCountChange={noop}
              onFaceChange={noop}
              canFewer={false}
              canMore
              bidLabel="Bid five 6s"
              onBid={noop}
              onCall={noop}
            />
          </Specimen>
        ))}
      </Family>

      <Family
        name="Hush card"
        file="hush-card"
        note="Hush's numbered cards: in a hand, next to play, on top of the pile, played under it, or discarded by a mistake."
      >
        {(['large', 'regular', 'small'] as const).map((cardSize) => {
          const sizeName = cap(cardSize);
          return (
            <div key={cardSize} className={styles.cellRow}>
              {(
                [
                  ['Hand', 'hand'],
                  ['Next', 'next'],
                  ['Pile', 'pile'],
                  ['Played', 'played'],
                  ['Discarded', 'discarded'],
                ] as const
              ).map(([state, kind]) => (
                <Specimen
                  key={kind}
                  family="hush-card"
                  variant={`State=${state}, Size=${sizeName}`}
                  label={state}
                >
                  <HushCard value={41} state={kind} size={cardSize} />
                </Specimen>
              ))}
            </div>
          );
        })}
      </Family>

      <Family
        name="Lives"
        file="lives"
        note="A Hush team's lives, as hearts full or lost; the hub card hides the label."
      >
        {[3, 2, 1, 0].map((lives) => (
          <Specimen
            key={lives}
            family="lives"
            variant={`Lives=${lives}`}
            label={`${lives}`}
          >
            <Lives lives={lives} />
          </Specimen>
        ))}
        <Specimen family="lives" label="Show label off">
          <Lives lives={2} showLabel={false} />
        </Specimen>
      </Family>

      <Family
        name="Heart button"
        file="heart-button"
        note="Doodle Chain's heart: yours to give on an entry (off or on), or only its count on your own."
      >
        {(['off', 'on', 'count'] as const).map((state) => (
          <Specimen
            key={state}
            family="heart-button"
            variant={`State=${cap(state)}`}
            label={cap(state)}
          >
            <HeartButton count={2} state={state} onPress={noop} />
          </Specimen>
        ))}
      </Family>

      <Family
        name="Chain entry"
        file="chain-entry"
        note="One entry of a Doodle Chain chain, its author beside it like a line of a conversation."
      >
        {(['desktop', 'phone'] as const).map((layout) => (
          <div key={layout} className={styles.cellRow}>
            {(['prompt', 'drawing', 'description', 'empty'] as const).map(
              (kind) => (
                <Specimen
                  key={kind}
                  family="chain-entry"
                  variant={`Kind=${cap(kind)}, Layout=${cap(layout)}`}
                  width={layout === 'desktop' ? 600 : 350}
                >
                  <ChainEntry
                    kind={kind}
                    {...CHAIN_AUTHORS[kind]}
                    text={
                      kind === 'prompt'
                        ? 'A turtle on a skateboard'
                        : 'A hamburger on roller skates'
                    }
                    drawing={<ChainDrawing name="Turtle on skateboard" />}
                    heart={<HeartButton count={2} state="off" onPress={noop} />}
                  />
                </Specimen>
              ),
            )}
          </div>
        ))}
      </Family>

      <Family
        name="Chain composer"
        file="chain-composer"
        note="Writing a line of a chain, then Done; Keep editing takes it back."
      >
        {(['desktop', 'phone'] as const).map((layout) =>
          ([false, true] as const).map((done) => (
            <Specimen
              key={`${layout}-${done}`}
              family="chain-composer"
              variant={`State=${done ? 'Done' : 'Editing'}, Layout=${cap(layout)}`}
              width={layout === 'desktop' ? 600 : 310}
            >
              <ChainComposer
                label="Your first line"
                helper="22 / 80 · anything drawable, in any language"
                value="A cat riding a bicycle"
                onValueChange={noop}
                done={done}
                doneMessage="Done. Waiting for Leo and Sam."
                onDone={noop}
                onKeepEditing={noop}
                onSuggest={noop}
              />
            </Specimen>
          )),
        )}
      </Family>

      <Family
        name="Sample / Chain drawing"
        file="sample-chain-drawing"
        note="The example drawings of Doodle Chain's artwork and gallery."
      >
        {(['Turtle on skateboard', 'Burger on skates'] as const).map((name) => (
          <Specimen
            key={name}
            family="sample-chain-drawing"
            variant={`Drawing=${name}`}
            width={480}
          >
            <ChainDrawing name={name} />
          </Specimen>
        ))}
      </Family>

      <Family name="Letter tile" file="letter-tile">
        {(
          [
            ['regular', 'Regular'],
            ['compact', 'Compact'],
            ['small', 'Small'],
            ['mini', 'Mini'],
          ] as const
        ).map(([tileSize, sizeName]) => (
          <div key={tileSize} className={styles.cellRow}>
            {(
              [
                ['Empty', 'empty'],
                ['Typed', 'typed'],
                ['Correct', 'correct'],
                ['Present', 'present'],
                ['Absent', 'absent'],
              ] as const
            )
              // A Mini tile is another player's, marks only: never typed into.
              .filter(([, state]) => tileSize !== 'mini' || state !== 'typed')
              .map(([stateName, state]) => (
                <Specimen
                  key={state}
                  family="letter-tile"
                  variant={`State=${stateName}, Size=${sizeName}`}
                  label={`${stateName} · ${sizeName}`}
                >
                  <LetterTile
                    letter={state === 'empty' ? undefined : 'A'}
                    state={state}
                    size={tileSize}
                  />
                </Specimen>
              ))}
          </div>
        ))}
      </Family>

      <Family name="Letter key" file="letter-key">
        {(
          [
            ['regular', 'Regular'],
            ['compact', 'Compact'],
          ] as const
        ).map(([keySize, sizeName]) => (
          <div key={keySize} className={styles.cellRow}>
            {(
              [
                ['Plain', 'plain'],
                ['Correct', 'correct'],
                ['Present', 'present'],
                ['Absent', 'absent'],
                ['Ruled out', 'ruledOut'],
              ] as const
            ).map(([stateName, state]) => (
              <Specimen
                key={state}
                family="letter-key"
                variant={`Kind=Letter, State=${stateName}, Size=${sizeName}`}
                label={`${stateName} · ${sizeName}`}
              >
                <LetterKey
                  letter="q"
                  state={state}
                  size={keySize}
                  onPress={noop}
                />
              </Specimen>
            ))}
            {(
              [
                ['Enter', 'enter'],
                ['Delete', 'delete'],
              ] as const
            ).map(([kindName, kind]) => (
              <Specimen
                key={kind}
                family="letter-key"
                variant={`Kind=${kindName}, State=Plain, Size=${sizeName}`}
                label={`${kindName} · ${sizeName}`}
              >
                <LetterKey kind={kind} size={keySize} onPress={noop} />
              </Specimen>
            ))}
          </div>
        ))}
        <div className={styles.cellRow}>
          <Specimen label="Disabled">
            <LetterKey letter="q" onPress={noop} disabled />
          </Specimen>
        </div>
      </Family>

      <Family
        name="Keyboard"
        file="keyboard"
        note="One component: it takes the Phone layout in a container narrower than the Desktop one."
      >
        {(
          [
            ['Desktop', 472],
            ['Phone', 336],
          ] as const
        ).map(([layout, width]) => (
          <Specimen
            key={layout}
            family="keyboard"
            variant={`Layout=${layout}`}
            width={width}
          >
            <Keyboard onLetter={noop} onEnter={noop} onDelete={noop} />
          </Specimen>
        ))}
      </Family>

      <Family name="Word board" file="word-board">
        <div className={styles.cellRow}>
          {(
            [
              ['regular', 'Regular'],
              ['compact', 'Compact'],
              ['small', 'Small'],
              ['mini', 'Mini'],
            ] as const
          ).map(([boardSize, sizeName]) => (
            <Specimen
              key={boardSize}
              family="word-board"
              variant={`Size=${sizeName}`}
            >
              <WordBoard
                rows={[]}
                size={boardSize}
                label={`${sizeName} board`}
              />
            </Specimen>
          ))}
        </div>
      </Family>

      <Family name="Race board" file="race-board">
        {(
          [
            ['mini', 'Mini'],
            ['small', 'Small'],
          ] as const
        ).map(([boardSize, boardName]) => (
          <div key={boardSize} className={styles.cellRow}>
            {(
              [
                ['Guessing', 'guessing'],
                ['Found', 'found'],
                ['Out', 'out'],
              ] as const
            ).map(([stateName, state]) => (
              <Specimen
                key={state}
                family="race-board"
                variant={`State=${stateName}, Board=${boardName}`}
                label={`${stateName} · ${boardName}`}
              >
                <RaceBoard
                  name="Maya"
                  status="Found · +431"
                  state={state}
                  board={boardSize}
                  rows={[]}
                />
              </Specimen>
            ))}
          </div>
        ))}
      </Family>

      <Family name="Digit tile" file="digit-tile">
        {(
          [
            ['regular', 'Regular'],
            ['compact', 'Compact'],
            ['small', 'Small'],
          ] as const
        ).map(([tileSize, sizeName]) => (
          <div key={tileSize} className={styles.cellRow}>
            {(
              [
                ['Empty', 'empty'],
                ['Typed', 'typed'],
                ['Guessed', 'guessed'],
                ['Cracked', 'cracked'],
              ] as const
            ).map(([stateName, state]) => (
              <Specimen
                key={state}
                family="digit-tile"
                variant={`State=${stateName}, Size=${sizeName}`}
                label={`${stateName} · ${sizeName}`}
              >
                <DigitTile
                  digit={state === 'empty' ? undefined : '7'}
                  state={state}
                  size={tileSize}
                />
              </Specimen>
            ))}
          </div>
        ))}
      </Family>

      <Family name="Code marks" file="code-marks">
        <div className={styles.cellRow}>
          {(
            [
              ['grid', 'Grid'],
              ['row', 'Row'],
            ] as const
          ).map(([layout, layoutName]) => (
            <Specimen
              key={layout}
              family="code-marks"
              variant={`Layout=${layoutName}`}
              label={layoutName}
            >
              <CodeMarks layout={layout} />
            </Specimen>
          ))}
          <Specimen label="1 in place, 2 elsewhere">
            <CodeMarks mark={{ right: 1, moved: 2 }} />
          </Specimen>
        </div>
      </Family>

      <Family
        name="Code board"
        file="code-board"
        note="Zumpo/Code row is drawn by the board, one row a guess."
      >
        <div className={styles.cellRow}>
          {(
            [
              ['compact', 'Compact'],
              ['small', 'Small'],
            ] as const
          ).map(([boardSize, sizeName]) => (
            <Specimen
              key={boardSize}
              family="code-board"
              variant={`Size=${sizeName}`}
            >
              <CodeBoard
                rows={[]}
                size={boardSize}
                label={`${sizeName} board`}
                describe={() => ''}
              />
            </Specimen>
          ))}
          <Specimen label="Two guesses and one typing">
            <CodeBoard
              rows={[
                { guess: '1234', mark: { right: 0, moved: 2 } },
                { guess: '4071', mark: { right: 4, moved: 0 } },
              ]}
              typed="56"
              label="Sample board"
              describe={(row) => row.guess}
            />
          </Specimen>
        </div>
      </Family>

      <Family name="Code marks board" file="code-marks-board">
        <Specimen family="code-marks-board">
          <CodeMarksBoard marks={[]} label="Marks board" />
        </Specimen>
      </Family>

      <Family name="Digit pad" file="digit-pad">
        {(
          [
            ['desktop', 'Desktop', 727],
            ['phone', 'Phone', 350],
          ] as const
        ).map(([layout, layoutName, width]) => (
          <Specimen
            key={layout}
            family="digit-pad"
            variant={`Layout=${layoutName}`}
            width={width}
          >
            <DigitPad
              notes={{ 2: 'out', 9: 'out', 1: 'in', 4: 'in' }}
              layout={layout}
              onNoting={noop}
              onDigit={noop}
              onEnter={noop}
              onDelete={noop}
            />
          </Specimen>
        ))}
      </Family>

      <Family name="Code race board" file="code-race-board">
        {(
          [
            ['Marks', 'column'],
            ['Digits', 'column'],
            ['Digits', 'row'],
          ] as const
        ).map(([boardName, layout]) => (
          <div key={boardName + layout} className={styles.cellRow}>
            {(
              [
                ['Guessing', 'guessing'],
                ['Cracked', 'cracked'],
                ['Out', 'out'],
              ] as const
            ).map(([stateName, state]) => (
              <Specimen
                key={state}
                family="code-race-board"
                variant={`State=${stateName}, Board=${boardName}, Layout=${cap(layout)}`}
                label={`${stateName} · ${boardName} · ${cap(layout)}`}
              >
                <CodeRaceBoard
                  name="Maya"
                  status="Cracked · +633"
                  state={state}
                  layout={layout}
                  rows={[]}
                  describe={boardName === 'Digits' ? () => '' : undefined}
                />
              </Specimen>
            ))}
          </div>
        ))}
      </Family>

      <Family name="Chip field" file="chip-field">
        <Specimen family="chip-field" variant="State=Default" width={496}>
          <ChipField
            label={`${categories.length} of 15 picked`}
            options={SAMPLE_CATEGORIES.map((name) => ({
              value: name,
              label: name,
            }))}
            value={categories}
            onToggle={(name) =>
              setCategories((current) =>
                current.includes(name)
                  ? current.filter((one) => one !== name)
                  : [...current, name],
              )
            }
            locked={categories.length === 1 ? categories : []}
            action={
              categories.length < SAMPLE_CATEGORIES.length
                ? {
                    label: 'Choose all',
                    onClick: () => setCategories(SAMPLE_CATEGORIES),
                  }
                : undefined
            }
            helper="At least one stays picked."
          />
        </Specimen>
      </Family>

      <Family name="Toggle chip" file="toggle-chip">
        <div className={styles.cellRow}>
          {(
            [
              ['Off', false],
              ['On', true],
            ] as const
          ).map(([stateName, on]) => (
            <Specimen
              key={stateName}
              family="toggle-chip"
              variant={`State=${stateName}`}
              label={stateName}
            >
              <ToggleChip on={on} onToggle={noop}>
                Notes
              </ToggleChip>
            </Specimen>
          ))}
        </div>
      </Family>

      <Family name="Pick result" file="pick-result">
        {(['safe', 'mine', 'auto'] as const).map((outcome) => (
          <Specimen
            key={outcome}
            family="pick-result"
            variant={`Outcome=${cap(outcome)}`}
            width={832}
          >
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                width: '100%',
              }}
            >
              <PickResult
                {...PLAYERS.sam}
                {...SAMPLE_AVATAR}
                outcome={outcome}
                detail="23% risk"
                points={outcome === 'mine' ? -20 : 31}
              />
            </ul>
          </Specimen>
        ))}
      </Family>

      <Family
        name="Stone"
        file="stone"
        note="Black or White, placed or faint (the viewer's own colour at 40%), with the last move's coral dot or the winning line's coral ring."
      >
        {(
          [
            ['regular', 'Regular'],
            ['small', 'Small'],
          ] as const
        ).map(([stoneSize, sizeName]) => (
          <div key={stoneSize} className={styles.cellRow}>
            {(['black', 'white'] as const).flatMap((color) =>
              (
                [
                  ['none', 'Placed'],
                  ['last', 'Placed'],
                  ['win', 'Placed'],
                  ['none', 'Ghost'],
                ] as const
              ).map(([mark, state]) => {
                const colorName = color === 'black' ? 'Black' : 'White';
                const markName =
                  mark === 'none' ? 'None' : mark === 'last' ? 'Last' : 'Win';
                const variant = `Color=${colorName}, Mark=${markName}, State=${state}, Size=${sizeName}`;
                return (
                  <Specimen
                    key={variant}
                    family="stone"
                    variant={variant}
                    label={`${colorName}, ${state === 'Ghost' ? 'Ghost' : markName}`}
                  >
                    <Stone
                      color={color}
                      mark={mark}
                      ghost={state === 'Ghost'}
                      size={stoneSize}
                    />
                  </Specimen>
                );
              }),
            )}
          </div>
        ))}
      </Family>

      <Family
        name="Gomoku board"
        file="gomoku-board"
        note="15 × 15 lines on peach with five star points; the last stone carries the coral dot, and a five is struck through with Zumpo/Win line. Tab onto the board, then the arrow keys show Zumpo/Point focus and the faint stone."
      >
        <div className={styles.cellRow}>
          {(
            [
              ['regular', 'Desktop', 564],
              ['small', 'Phone', 350],
            ] as const
          ).map(([boardSize, layout, width]) => (
            <Specimen
              key={layout}
              family="gomoku-board"
              variant={`Layout=${layout}`}
              label={`${layout}, won`}
              width={width}
            >
              <GomokuBoard
                stones={GOMOKU_STONES}
                size={boardSize}
                last={GOMOKU_LINE[4]}
                winLines={[GOMOKU_LINE]}
                label={`Gomoku board, ${layout}`}
              />
            </Specimen>
          ))}
          <Specimen label="Your turn, Black" width={350}>
            <GomokuBoard
              size="small"
              stones={GOMOKU_STONES.map((stone, point) =>
                point === GOMOKU_LINE[4] ? null : stone,
              )}
              last={GOMOKU_WHITE[4]}
              color="black"
              pending={GOMOKU_LINE[4]}
              onPlace={noop}
              label="Gomoku board, your turn"
            />
          </Specimen>
        </div>
      </Family>

      <Family name="Gomoku seat" file="gomoku-seat">
        <div className={styles.cellRow}>
          {(['black', 'white'] as const).flatMap((color) =>
            (['default', 'turn', 'won'] as const).map((seatState) => {
              const colorName = color === 'black' ? 'Black' : 'White';
              const stateName =
                seatState === 'default'
                  ? 'Default'
                  : seatState === 'turn'
                    ? 'Turn'
                    : 'Won';
              return (
                <Specimen
                  key={`${color}-${seatState}`}
                  family="gomoku-seat"
                  variant={`Color=${colorName}, State=${stateName}`}
                  width={306}
                  heightOnly
                >
                  <GomokuSeat
                    name={color === 'black' ? 'Maya' : 'Leo'}
                    detail={
                      seatState === 'turn'
                        ? `${colorName} · your turn`
                        : seatState === 'won'
                          ? `${colorName} · five in a row`
                          : colorName
                    }
                    avatar={
                      color === 'black'
                        ? { initials: 'MA', tone: 'peach' }
                        : { initials: 'LE', tone: 'lime' }
                    }
                    color={color}
                    state={seatState}
                  />
                </Specimen>
              );
            }),
          )}
        </div>
      </Family>

      <Family name="Mobile tabs" file="mobile-tabs">
        <Specimen family="mobile-tabs" variant="View=Board" width={480}>
          <MobileTabs
            value={view}
            onValueChange={setView}
            tabs={[
              { value: 'board', label: 'Board', panel: null },
              { value: 'players', label: 'Players · 4', panel: null },
              { value: 'chat', label: 'Chat', panel: null },
            ]}
          />
        </Specimen>
        <Specimen family="mobile-tabs" label="Chat unread" width={480}>
          <MobileTabs
            value="board"
            onValueChange={noop}
            tabs={[
              { value: 'board', label: 'Board', panel: null },
              { value: 'players', label: 'Players · 4', panel: null },
              { value: 'chat', label: 'Chat', panel: null, unread: 3 },
            ]}
          />
        </Specimen>
      </Family>

      <Family name="Game card" file="game-card">
        {GAMES.map((game) => (
          <Specimen
            key={`${game.type}-tile`}
            family="game-card"
            variant={`Game=${m.games.of[game.type].name}, Layout=Tile`}
            width={310}
          >
            <GameCard game={game} layout="tile" />
          </Specimen>
        ))}
        {GAMES.map((game) => (
          <Specimen
            key={`${game.type}-row`}
            family="game-card"
            variant={`Game=${m.games.of[game.type].name}, Layout=Row`}
            width={350}
          >
            <GameCard game={game} layout="row" />
          </Specimen>
        ))}
      </Family>

      <Family name="Game artwork" file="game-artwork">
        {GAMES.map((game) => (
          <Specimen
            key={`${game.type}-tile`}
            family="game-artwork"
            variant={`Game=${m.games.of[game.type].name}, Size=Tile`}
            width={276}
          >
            <GameArtwork type={game.type} size="tile" />
          </Specimen>
        ))}
        {GAMES.map((game) => (
          <Specimen
            key={`${game.type}-icon`}
            family="game-artwork"
            variant={`Game=${m.games.of[game.type].name}, Size=Icon`}
          >
            <GameArtwork type={game.type} size="icon" />
          </Specimen>
        ))}
      </Family>

      <Family name="Game intro" file="game-intro">
        {GAMES.map((game) => (
          <Specimen
            key={`${game.type}-desktop`}
            family="game-intro"
            variant={`Game=${m.games.of[game.type].name}, Layout=Desktop`}
            width={920}
          >
            <GameIntro game={game} />
          </Specimen>
        ))}
        {GAMES.map((game) => (
          <Specimen
            key={`${game.type}-phone`}
            family="game-intro"
            variant={`Game=${m.games.of[game.type].name}, Layout=Phone`}
            width={350}
          >
            <GameIntro game={game} />
          </Specimen>
        ))}
      </Family>

      <Family name="Header and wordmark" file="header">
        <Specimen family="header" width={1312}>
          <Header
            links={[{ label: 'Games', to: '/design', current: true }]}
            viewer={{ ...PLAYERS.maya, label: 'You are Maya' }}
          />
        </Specimen>
        <Specimen family="wordmark">
          <Wordmark />
        </Specimen>
      </Family>

      <Family
        name="Room bar"
        file="room-bar"
        note="A seated room's header and heading in one row. Its only link out is the wordmark, which the room guards with the leave dialog."
      >
        <Specimen family="room-bar" variant="Layout=Desktop" width={1312}>
          <RoomBar
            game="Minesweeper"
            room="Maya’s room"
            phase={{ tone: 'blue', label: 'Round 2' }}
            onHowToPlay={noop}
            onLeave={noop}
            viewer={{ ...PLAYERS.sam, label: 'You are Sam' }}
          />
        </Specimen>
        <Specimen family="room-bar" variant="Layout=Phone" width={350}>
          <RoomBar
            layout="phone"
            game="Minesweeper"
            room="Maya’s room"
            phase={{ tone: 'blue', label: 'Round 4' }}
            onHowToPlay={noop}
            onLeave={noop}
            viewer={{ ...PLAYERS.sam, label: 'You are Sam' }}
          />
        </Specimen>
        <Specimen label="Choice list: Board, in the page" width={496}>
          <ChoiceList
            label="Board"
            value={choice}
            onValueChange={setChoice}
            options={[
              {
                value: 'small',
                label: 'Small · 9 × 9',
                detail: '10 mines. Best: 0:48',
              },
              {
                value: 'medium',
                label: 'Medium · 16 × 16',
                detail: '40 mines. Best: 3:12',
              },
              {
                value: 'large',
                label: 'Large · 30 × 16',
                detail: '99 mines. No best yet',
              },
            ]}
          />
        </Specimen>
      </Family>

      <Family
        name="Card and dialog"
        file="card"
        note="The focused card of name, create-room and password pages, the dialog over a room, and the panels of an empty or loading lobby. Figma's variants hold an empty Content slot, so the specimens are not measured; the screens that use them are."
      >
        <Specimen label="Kind=Focused" width={560}>
          <Card
            title="A little room for you."
            description="Set up your game and invite some good company."
            actions={
              <>
                <Button>Continue</Button>
                <Button variant="quiet">Cancel</Button>
              </>
            }
            onSubmit={(event) => event.preventDefault()}
          >
            <TextField
              label="Your name"
              defaultValue="Maya"
              helper="Up to 18 characters."
            />
          </Card>
        </Specimen>
        <Specimen label="Kind=Panel" width={920}>
          <Card
            kind="panel"
            title="A little quiet in here."
            description="Be the first to make a room. Bring a friend and get playing."
          />
        </Specimen>
        <Specimen label="Kind=Panel: stats beside a game" width={344}>
          <Card kind="panel" title="Best on this device">
            <StatList
              className={styles.stretch}
              stats={[
                { label: 'Small · 9 × 9', value: '0:48' },
                { label: 'Medium · 16 × 16', value: '3:05', tone: 'green' },
                { label: 'Large · 30 × 16', value: 'Not yet', tone: 'muted' },
              ]}
            />
          </Card>
        </Specimen>
        <Specimen label="Kind=Dialog: opens over the page">
          <Button
            variant="secondary"
            icon="leave"
            onClick={() => setDialog(true)}
          >
            Leave room
          </Button>
        </Specimen>
        <Dialog
          open={dialog}
          onOpenChange={setDialog}
          initialFocus={stay}
          // The room's own words, as a host leaving a Make 24 game reads them.
          title={m.room.leaveTitle(m.createRoom.defaultName('Maya'))}
          description={m.room.both(
            m.room.leaveInGame(scoreOf(m, 'make-24', 180)),
            m.room.leaveNextHost('Sam'),
          )}
          actions={
            <>
              <Button
                variant="danger"
                icon="leave"
                onClick={() => setDialog(false)}
              >
                {m.room.leave}
              </Button>
              <DialogClose
                render={
                  <Button ref={stay} variant="secondary">
                    {m.room.stay}
                  </Button>
                }
              />
            </>
          }
        />
      </Family>
    </div>
  );
}
