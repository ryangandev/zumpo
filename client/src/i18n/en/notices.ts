import type { RoomNotice } from '../../../../shared/wire-types.js';
import { bidWords, foundWords } from '../../../../shared/liars-dice.js';

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
      ? `${who(n.name)} is watching. ${who(n.owner)} is now the owner.`
      : `${who(n.name)} is watching.`,
  'room:seated': (n: Extract<RoomNotice, { type: 'room:seated' }>): string =>
    `${who(n.name)} took a seat.`,
  'room:renamed': (n: Extract<RoomNotice, { type: 'room:renamed' }>): string =>
    `${who(n.before)} is now ${who(n.name)}.`,
  'room:owner-left': (
    n: Extract<RoomNotice, { type: 'room:owner-left' }>,
  ): string =>
    `Previous owner ${who(n.name)} has left the room. ${who(n.owner)} is now the owner.`,
  'room:left': (n: Extract<RoomNotice, { type: 'room:left' }>): string =>
    `${who(n.name)} has left the room.`,
  'room:disconnected': (
    n: Extract<RoomNotice, { type: 'room:disconnected' }>,
  ): string => `${who(n.name)} lost connection.`,
  'room:reconnected': (
    n: Extract<RoomNotice, { type: 'room:reconnected' }>,
  ): string => `${who(n.name)} reconnected.`,
  'game:ended': (_n: Extract<RoomNotice, { type: 'game:ended' }>): string =>
    'Game has ended!',
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
    `Game has started! The word category for this game is "${n.category}"!`,
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
  ): string => 'The drawer is back. Carry on!',
  'dg:all-guessed': (
    _n: Extract<RoomNotice, { type: 'dg:all-guessed' }>,
  ): string => 'Everybody guessed the word!',
  'dg:guessed': (n: Extract<RoomNotice, { type: 'dg:guessed' }>): string =>
    `${who(n.name)} guessed the correct word! (+${n.points})`,
  'ms:started': (n: Extract<RoomNotice, { type: 'ms:started' }>): string =>
    `Game has started! ${n.mines} mines on a ${n.width}×${n.height} board.`,
  'ms:mine': (n: Extract<RoomNotice, { type: 'ms:mine' }>): string =>
    `${who(n.name)} hit a mine (${Math.round(n.risk * 100)}% risk): −${Math.abs(n.points)}`,
  'make24:started': (
    n: Extract<RoomNotice, { type: 'make24:started' }>,
  ): string => `Game has started! ${n.hands} hands, ${n.seconds} seconds each.`,
  'make24:solved': (
    n: Extract<RoomNotice, { type: 'make24:solved' }>,
  ): string => `${who(n.name)} solved it! (+${n.points})`,
  'pairs:started': (
    n: Extract<RoomNotice, { type: 'pairs:started' }>,
  ): string =>
    `Game has started! ${n.pairs} pairs to find, ${n.seconds} seconds a turn.`,
  'pairs:found': (n: Extract<RoomNotice, { type: 'pairs:found' }>): string =>
    `${who(n.name)} found a pair! (+1)`,
  'trios:started': (
    n: Extract<RoomNotice, { type: 'trios:started' }>,
  ): string => `Game has started! ${n.trios} trios to find.`,
  'trios:found': (n: Extract<RoomNotice, { type: 'trios:found' }>): string =>
    `${who(n.name)} found a trio! (+1)`,
  'ld:started': (n: Extract<RoomNotice, { type: 'ld:started' }>): string =>
    `Game has started! ${n.dice} dice each, ${n.seconds} seconds a turn.`,
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
    `Game has started! ${n.levels} levels and ${n.lives} lives. Not a word while a level is played.`,
  'hush:mistake': (n: Extract<RoomNotice, { type: 'hush:mistake' }>): string =>
    `${who(n.name)} played ${n.card}, but ${list(n.held.map((h) => `${who(h.name)} held ${list(h.cards.map(String))}`))}.`,
  'hush:cleared': (n: Extract<RoomNotice, { type: 'hush:cleared' }>): string =>
    n.lifeBack
      ? `Level ${n.level} cleared without a slip: a life back!`
      : n.clean
        ? `Level ${n.level} cleared without a slip!`
        : `Level ${n.level} cleared!`,
  'hush:won': (n: Extract<RoomNotice, { type: 'hush:won' }>): string =>
    `All ${n.levels} levels cleared. Well played!`,
  'hush:lost': (n: Extract<RoomNotice, { type: 'hush:lost' }>): string =>
    `Out of lives on level ${n.level}: ${n.cleared} of ${n.levels} levels cleared.`,
  'hush:discarded': (
    n: Extract<RoomNotice, { type: 'hush:discarded' }>,
  ): string =>
    `Their ${list(n.cards.map(String))} ${n.cards.length === 1 ? 'is' : 'are'} discarded, with no life lost.`,
  'dw:started': (n: Extract<RoomNotice, { type: 'dw:started' }>): string =>
    `Game has started! ${n.rounds} words, ${n.seconds} seconds each.`,
  'dw:solved': (n: Extract<RoomNotice, { type: 'dw:solved' }>): string =>
    `${who(n.name)} got it in ${n.guesses}! (+${n.points})`,
  'dw:revealed': (n: Extract<RoomNotice, { type: 'dw:revealed' }>): string =>
    `The word was ${n.word}.`,
  'dc:step': (n: Extract<RoomNotice, { type: 'dc:step' }>): string =>
    n.kind === 'prompt'
      ? `Step ${n.step}: write the first line.`
      : n.kind === 'drawing'
        ? `Step ${n.step}: draw the words you were given.`
        : `Step ${n.step}: describe the drawing you were given.`,
  'dc:reveal': (n: Extract<RoomNotice, { type: 'dc:reveal' }>): string =>
    `Time for the reveal! ${who(n.host)} shows the chains.`,
  'dc:album': (_n: Extract<RoomNotice, { type: 'dc:album' }>): string =>
    'Every chain is in the album.',
};
