import { cardName } from '../../../../shared/trios';
import { plural } from './plural';
import { symbols as snapSymbols } from './snap';

export const ui = {
  chat: {
    title: 'Chat',
    message: 'Message',
    placeholder: 'Type a guess or say hi…',
    send: 'Send',
  },
  you: 'You',
  youName: (name: string) => `${name} (you)`,
  host: 'Host',
  players: 'Players',
  seatsTaken: (players: number, seats: number) =>
    `${players} of ${seats} seats taken`,
  turn: 'Turn',
  room: {
    leave: 'Leave room',
    howToPlay: 'How to play',
    password: 'Password protected',
    players: (players: number, seats: number) =>
      `${players} of ${seats} players`,
    full: 'Full',
    playing: 'Playing',
    join: 'Join',
    watch: 'Watch',
  },
  drawing: {
    canvas: 'Drawing canvas',
    image: 'The drawing',
    tools: 'Drawing tools',
    colour: 'Colour',
    size: 'Brush size',
    undo: 'Undo',
    clear: 'Clear',
    pixels: (width: number) => `${width} pixels`,
    colours: {
      ink: 'Ink',
      graphite: 'Graphite',
      white: 'White',
      coral: 'Coral',
      red: 'Red',
      orange: 'Orange',
      sun: 'Sun',
      leaf: 'Leaf',
      green: 'Green',
      sky: 'Sky',
      violet: 'Violet',
      brown: 'Brown',
    },
  },
  chain: {
    suggest: 'Suggest',
    done: 'Done',
    keepEditing: 'Keep editing',
    heart: (count: number) => `Give a heart, ${plural(count, 'heart')} so far`,
    hearts: (count: number) => plural(count, 'heart'),
  },
  dice: {
    title: 'Dice',
    hidden: 'Hidden die',
    lost: 'Lost die',
    wild: (face: number) => `${face}, wild`,
    counts: (face: number) => `${face}, counts`,
    bid: (name: string, count: number, face: number) =>
      `${name}: ${count} × ${face}`,
    picker: 'Your bid',
    howMany: 'How many',
    fewer: 'Fewer',
    more: 'More',
    showing: 'Showing',
    call: 'Call Liar',
    face: (face: number) => `${face}s`,
  },
  word: {
    keyboard: 'Keyboard',
    enter: 'Enter',
    delete: 'Delete letter',
    marks: {
      correct: 'right place',
      present: 'in the word, somewhere else',
      absent: 'not in the word',
    },
    marked: (letter: string, mark: string) => `${letter}, ${mark}`,
    board: (name: string) => `${name}’s board`,
    letters: (count: number) =>
      `${count} ${count === 1 ? 'letter' : 'letters'}`,
  },
  code: {
    pad: 'Digit pad',
    notes: 'Notes',
    delete: 'Delete digit',
    noted: (digit: string, note: 'out' | 'in') =>
      `${digit}, noted ${note === 'out' ? 'out of the code' : 'in the code'}`,
    mark: (right: number, moved: number) =>
      `${right} in place, ${moved} elsewhere`,
    board: (name: string) => `${name}’s board`,
  },
  lives: (lives: number) =>
    lives === 0 ? 'No lives' : lives === 1 ? '1 life' : `${lives} lives`,
  discarded: (value: number) => `${value}, discarded`,
  position: (row: number, column: number, detail: string) =>
    `Row ${row}, column ${column}: ${detail}`,
  mine: {
    hidden: 'hidden',
    picked: 'your pick',
    mine: 'mine',
    flag: 'flagged',
    wrongFlag: 'flagged, no mine',
    hit: 'the mine you hit',
    empty: 'empty',
    adjacent: (count: number) => `${count} adjacent`,
  },
  outcome: { safe: 'Safe', mine: 'Mine', auto: 'Auto-picked' },
  pairs: {
    down: 'face down',
    matched: (symbol: string) => `${symbol}, matched`,
    symbols: [
      'Circle Coral',
      'Ring Sky',
      'Half Sun',
      'Square Leaf',
      'Diamond Violet',
      'Triangle Green',
      'Star Orange',
      'Sparkle Red',
      'Hexagon Brown',
      'Circle Violet',
      'Ring Green',
      'Half Orange',
      'Square Red',
      'Diamond Brown',
      'Triangle Coral',
      'Star Sky',
      'Sparkle Sun',
      'Hexagon Leaf',
    ],
  },
  trios: {
    card: (card: number) => cardName(card),
    states: {
      selected: ', picked',
      found: ', found',
      wrong: ', not a trio',
      // The Hint badge names a hinted card.
      hinted: '',
    },
    badge: (name: string, badge: string) => `${name}, ${badge}`,
  },
  snap: {
    /** A symbol's accessible name: "Heart". */
    symbol: (symbol: number) => capital(snapSymbols[symbol] ?? ''),
    marks: { match: ', on both cards', miss: ', not a match' },
    /** A card's accessible name with what is on it: "Middle card, taken by Maya". */
    note: (name: string, note: string) => `${name}, ${note}`,
    takenBy: (name: string) => `taken by ${name}`,
    locked: 'locked out',
  },
  gomoku: {
    /** A point's accessible name: "H8, black stone"; "J9, empty". */
    point: (
      name: string,
      stone: 'black' | 'white' | null,
      { last, won }: { last: boolean; won: boolean },
    ) =>
      [
        name,
        stone === null ? 'empty' : `${stone} stone`,
        won ? 'in the winning line' : last ? 'last placed' : null,
      ]
        .filter(Boolean)
        .join(', '),
  },
};

function capital(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
