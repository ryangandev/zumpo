import type { RoomNotice } from '../../../../shared/wire-types.js';
import { bidWords, foundWords } from '../../../../shared/liars-dice.js';
import { duration } from './plural.js';
import { drawAndGuess } from './draw-and-guess.js';

const who = (name: string): string => name || 'A player';

const list = (names: readonly string[]): string =>
  names.length < 2
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/** Facts from the server, worded only for this viewer. */
export const notices = {
  'room:created': (n: Extract<RoomNotice, { type: 'room:created' }>): string =>
    `${who(n.name)} created the room.`,
  'room:joined': (n: Extract<RoomNotice, { type: 'room:joined' }>): string =>
    `${who(n.name)} has joined the room.`,
  'room:watching': (
    n: Extract<RoomNotice, { type: 'room:watching' }>,
  ): string =>
    n.owner
      ? `${who(n.name)} is watching. ${who(n.owner)} is now the host.`
      : `${who(n.name)} is watching.`,
  'room:seated': (n: Extract<RoomNotice, { type: 'room:seated' }>): string =>
    `${who(n.name)} took a seat.`,
  'room:renamed': (n: Extract<RoomNotice, { type: 'room:renamed' }>): string =>
    `${who(n.before)} is now ${who(n.name)}.`,
  'room:owner-left': (
    n: Extract<RoomNotice, { type: 'room:owner-left' }>,
  ): string =>
    `${who(n.name)} has left the room. ${who(n.owner)} is now the host.`,
  'room:left': (n: Extract<RoomNotice, { type: 'room:left' }>): string =>
    `${who(n.name)} has left the room.`,
  'room:disconnected': (
    n: Extract<RoomNotice, { type: 'room:disconnected' }>,
  ): string => `${who(n.name)} lost connection.`,
  'room:reconnected': (
    n: Extract<RoomNotice, { type: 'room:reconnected' }>,
  ): string => `${who(n.name)} reconnected.`,
  'game:ended': (_n: Extract<RoomNotice, { type: 'game:ended' }>): string =>
    'Game has ended.',
  'game:interrupted': (
    _n: Extract<RoomNotice, { type: 'game:interrupted' }>,
  ): string => 'Not enough players left to continue. Game has ended.',
  'game:over': (n: Extract<RoomNotice, { type: 'game:over' }>): string => {
    const score =
      n.unit === 'die'
        ? `${n.points} ${n.points === 1 ? 'die' : 'dice'} left`
        : `${n.points} ${n.unit}${n.points === 1 ? '' : 's'}`;
    return `Game over: ${list(n.names)} ${n.names.length === 1 ? 'wins' : 'tie'} with ${score}!`;
  },
  'dg:started': (n: Extract<RoomNotice, { type: 'dg:started' }>): string =>
    `Game started: category ${drawAndGuess.category(n.category)}.`,
  'dg:drawer-left': (
    _n: Extract<RoomNotice, { type: 'dg:drawer-left' }>,
  ): string => 'The drawer left the room. Skipping to the next turn.',
  'dg:drawer-lost': (
    _n: Extract<RoomNotice, { type: 'dg:drawer-lost' }>,
  ): string => 'The drawer lost connection. Skipping to the next turn.',
  'dg:drawer-timeout': (
    _n: Extract<RoomNotice, { type: 'dg:drawer-timeout' }>,
  ): string => 'The drawer did not come back. Skipping to the next turn.',
  'dg:drawer-returned': (
    _n: Extract<RoomNotice, { type: 'dg:drawer-returned' }>,
  ): string => 'The drawer is back.',
  'dg:all-guessed': (
    _n: Extract<RoomNotice, { type: 'dg:all-guessed' }>,
  ): string => 'Everybody guessed the word.',
  'dg:guessed': (n: Extract<RoomNotice, { type: 'dg:guessed' }>): string =>
    `${who(n.name)} guessed the word, +${n.points}.`,
  'dg:close': (n: Extract<RoomNotice, { type: 'dg:close' }>): string =>
    `${who(n.name)} is close!`,
  'dg:turn': (n: Extract<RoomNotice, { type: 'dg:turn' }>): string =>
    `Round ${n.round} · ${who(n.drawer)} draws`,
  'ms:started': (n: Extract<RoomNotice, { type: 'ms:started' }>): string =>
    `Game started: ${n.mines} mines on a ${n.width}×${n.height} board.`,
  // U+2212, a true minus: a hyphen reads as a dash beside a number.
  'ms:mines': (n: Extract<RoomNotice, { type: 'ms:mines' }>): string =>
    n.hits.length === 1
      ? `Round ${n.round}: ${who(n.hits[0]!.name)} hit a mine (−${Math.abs(n.hits[0]!.points)}).`
      : `Round ${n.round}: ${list(n.hits.map((h) => `${who(h.name)} (−${Math.abs(h.points)})`))} hit mines.`,
  'make24:started': (
    n: Extract<RoomNotice, { type: 'make24:started' }>,
  ): string => `Game started: ${n.hands} hands, ${n.seconds} seconds each.`,
  'make24:hand': (n: Extract<RoomNotice, { type: 'make24:hand' }>): string =>
    `Hand ${n.hand}: ${n.solved.map((s) => `${who(s.name)} +${s.points}`).join(', ')}`,
  'pairs:started': (
    n: Extract<RoomNotice, { type: 'pairs:started' }>,
  ): string =>
    `Game started: ${n.pairs} pairs to find, ${n.seconds} seconds a turn.`,
  'pairs:found': (n: Extract<RoomNotice, { type: 'pairs:found' }>): string =>
    `${who(n.name)} found a pair, +1.`,
  'trios:started': (
    n: Extract<RoomNotice, { type: 'trios:started' }>,
  ): string => `Game started: ${n.trios} trios to find.`,
  'trios:found': (n: Extract<RoomNotice, { type: 'trios:found' }>): string =>
    `${who(n.name)} found a trio, +1.`,
  'snap:started': (n: Extract<RoomNotice, { type: 'snap:started' }>): string =>
    `Game started: ${n.cards} cards to win.`,
  'ld:started': (n: Extract<RoomNotice, { type: 'ld:started' }>): string =>
    `Game started: ${n.dice} dice each, ${n.seconds} seconds a turn.`,
  'ld:auto-bid': (n: Extract<RoomNotice, { type: 'ld:auto-bid' }>): string =>
    `${who(n.name)} ran out of time, so ${bidWords(n.bid)} is bid for them.`,
  'ld:auto-call': (n: Extract<RoomNotice, { type: 'ld:auto-call' }>): string =>
    `${who(n.name)} ran out of time, so Liar is called for them.`,
  'ld:called': (n: Extract<RoomNotice, { type: 'ld:called' }>): string =>
    `${who(n.name)} called Liar on ${bidWords(n.bid)}: ${foundWords(n.matched)}. ${who(n.loser)} loses a die.`,
  'ld:out': (n: Extract<RoomNotice, { type: 'ld:out' }>): string =>
    `${who(n.name)} is out.`,
  'ld:reroll': (_n: Extract<RoomNotice, { type: 'ld:reroll' }>): string =>
    'A player left, so everybody rolls again.',
  'hush:started': (n: Extract<RoomNotice, { type: 'hush:started' }>): string =>
    `Game started: ${n.levels} levels and ${n.lives} lives. Not a word while a level is played.`,
  'hush:mistake': (n: Extract<RoomNotice, { type: 'hush:mistake' }>): string =>
    `${who(n.name)} played ${n.card}, but ${list(n.held.map((h) => `${who(h.name)} held ${list(h.cards.map(String))}`))}.`,
  'hush:cleared': (n: Extract<RoomNotice, { type: 'hush:cleared' }>): string =>
    n.lifeBack
      ? `Level ${n.level} cleared without a slip: a life back.`
      : n.clean
        ? `Level ${n.level} cleared without a slip.`
        : `Level ${n.level} cleared.`,
  'hush:won': (n: Extract<RoomNotice, { type: 'hush:won' }>): string =>
    `All ${n.levels} levels cleared. Well played!`,
  'hush:lost': (n: Extract<RoomNotice, { type: 'hush:lost' }>): string =>
    `Out of lives on level ${n.level}: ${n.cleared} of ${n.levels} levels cleared.`,
  'hush:discarded': (
    n: Extract<RoomNotice, { type: 'hush:discarded' }>,
  ): string =>
    `Their ${list(n.cards.map(String))} ${n.cards.length === 1 ? 'is' : 'are'} discarded, with no life lost.`,
  'dw:started': (n: Extract<RoomNotice, { type: 'dw:started' }>): string =>
    `Game started: ${n.rounds} words, ${duration(n.seconds)} each.`,
  'dw:solved': (n: Extract<RoomNotice, { type: 'dw:solved' }>): string =>
    `${who(n.name)} got it in ${n.guesses}, +${n.points}.`,
  'dw:revealed': (n: Extract<RoomNotice, { type: 'dw:revealed' }>): string =>
    `The word was ${n.word}.`,
  'cb:started': (n: Extract<RoomNotice, { type: 'cb:started' }>): string =>
    n.rounds === 1
      ? `Game started: 1 code, ${duration(n.seconds)}.`
      : `Game started: ${n.rounds} codes, ${duration(n.seconds)} each.`,
  'cb:cracked': (n: Extract<RoomNotice, { type: 'cb:cracked' }>): string =>
    `${who(n.name)} cracked it in ${n.guesses}, +${n.points}.`,
  'cb:revealed': (n: Extract<RoomNotice, { type: 'cb:revealed' }>): string =>
    `The code was ${n.code}.`,
  'dc:step': (n: Extract<RoomNotice, { type: 'dc:step' }>): string =>
    `Step ${n.step} · ${{ prompt: 'Write', drawing: 'Draw', description: 'Describe' }[n.kind]}`,
  'dc:skipped': (n: Extract<RoomNotice, { type: 'dc:skipped' }>): string =>
    n.kind === 'drawing'
      ? `Step ${n.step} is skipped: every description came back empty, so nobody had words to draw.`
      : `Step ${n.step} is skipped: every drawing came back empty, so nobody had a drawing to describe.`,
  'dc:reveal': (n: Extract<RoomNotice, { type: 'dc:reveal' }>): string =>
    `Time for the reveal. ${who(n.host)} shows the chains.`,
  'dc:album': (_n: Extract<RoomNotice, { type: 'dc:album' }>): string =>
    'Every chain is in the album.',
  'gomoku:started': (
    n: Extract<RoomNotice, { type: 'gomoku:started' }>,
  ): string =>
    `Game started: ${who(n.black)} plays Black and ${who(n.white)} plays White, ${n.seconds} seconds a move.`,
  'gomoku:timeout': (
    n: Extract<RoomNotice, { type: 'gomoku:timeout' }>,
  ): string => `${who(n.name)} ran out of time.`,
  'gomoku:over': (n: Extract<RoomNotice, { type: 'gomoku:over' }>): string => {
    const winner = who(n.winner ?? '');
    const loser = who(n.loser ?? '');
    switch (n.ending) {
      case 'five':
        return `${winner} made five in a row.`;
      case 'resigned':
        return `${loser} resigned.`;
      case 'timeout':
        return `${loser} ran out of time twice; ${winner} wins.`;
      case 'left':
        return `${loser} left; ${winner} wins.`;
      case 'draw':
        return 'The board is full: a draw.';
    }
  },
};
