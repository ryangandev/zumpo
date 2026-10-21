import type { DoodleChainKind } from '../../../../shared/wire-types';
import { countWord, plural } from './plural';

/**
 * Suggest's lines: short, drawable and a little absurd. Every language has the
 * same lines in the same order, because a suggestion travels as its number.
 */
const suggestions = [
  'A cat riding a bicycle',
  'A dragon at the dentist',
  'A snowman at the beach',
  'A penguin ordering pizza',
  'A robot walking a dog',
  'A turtle on a skateboard',
  'A giraffe in a lift',
  'An octopus playing drums',
  'A ghost doing laundry',
  'A cow on the moon',
  'A pirate eating ice cream',
  'A frog in a top hat',
  'A shark on a surfboard',
  'A wizard stuck in traffic',
  'A bear having a bath',
  'A dinosaur on a swing',
  'A fish riding a horse',
  'An elephant on a tightrope',
  'A chicken crossing a river',
  'A cactus giving a hug',
  'A banana in sunglasses',
  'A volcano making popcorn',
  'A sheep knitting a jumper',
  'A snail winning a race',
  'A king on a tiny bike',
  'A mouse lifting weights',
  'An alien at the supermarket',
  'A tree wearing headphones',
  'A duck driving a bus',
  'A teapot in the rain',
  'A rabbit pulling a magician out of a hat',
  'A whale in a bathtub',
  'A monkey taking a selfie',
  'A spider knitting a scarf',
  'A lion at the hairdresser',
  'A crab playing the guitar',
  'A rocket made of cheese',
  'A bee on a phone call',
  'A pig flying a kite',
  'A horse in pyjamas',
  'A cloud crying lemonade',
  'A hamster on a treadmill',
  'A vampire at breakfast',
  'A burger on roller skates',
  'An owl reading the news',
  'A cat stuck in a box',
  'A clown in a tiny car',
  'A mermaid on a bus',
  'A goat on a rooftop',
  'A sandwich falling in love',
  'A knight afraid of a mouse',
  'A plant watering itself',
  'A tortoise with a jetpack',
  'A pizza in a sleeping bag',
  'A grandma on a motorbike',
  'An ant carrying a watermelon',
  'A dog doing homework',
  'A camel in the snow',
  'A sun wearing a scarf',
  'A pencil drawing itself',
];

/** "draw", as a step asks for it. */
const verbs: Record<DoodleChainKind, string> = {
  prompt: 'write',
  drawing: 'draw',
  description: 'describe',
};

export const doodleChain = {
  suggestions,
  chatPlaceholder: 'Say something…',
  waitingRoom: 'Waiting room',
  stepOf: (step: number, steps: number) => `Step ${step} of ${steps}`,
  reveal: 'Reveal',
  gameOver: 'Game over',
  gameEnded: 'Game ended',
  more: (count: number) => `${countWord(count)} more to start.`,
  needsPlayers:
    'Doodle Chain needs at least three players: with two, a line only goes there and back.',
  invite: (count: number) =>
    count === 1 ? 'Invite one more.' : `Invite ${count} more.`,
  setup: (
    players: number,
    kinds: readonly DoodleChainKind[],
    seconds: number,
    minutes: number,
  ) =>
    `${plural(players, 'player')}, so ${plural(kinds.length, 'step')}: ${kinds.map((kind) => verbs[kind]).join(', ')}. ${seconds}s to draw; about ${plural(minutes, 'minute')} with the reveal.`,
  guestSetup: (players: number, steps: number, seconds: number) =>
    `${plural(players, 'player')}, so ${plural(steps, 'step')}. ${seconds}s to draw.`,

  // The turn bar.
  writeFirst: 'Write the first line',
  drawThis: 'Draw this',
  whatDoesItShow: 'What does this drawing show?',
  sitOut: 'You sit this step out',
  timesUp: 'Time’s up!',
  everyoneDone: 'Everyone’s done!',
  stepSkipped: 'Nothing to play this step',
  /** Why a step nobody could play was skipped, by what it asked for. */
  skippedWhy: {
    prompt: 'Every chain moves one place on.',
    drawing: 'Every description came back empty, so nobody had words to draw.',
    description:
      'Every drawing came back empty, so nobody had a drawing to describe.',
  } satisfies Record<DoodleChainKind, string>,
  everybody: {
    prompt: 'Everybody is writing',
    drawing: 'Everybody is drawing',
    description: 'Everybody is describing',
  } satisfies Record<DoodleChainKind, string>,
  secret: 'The chains stay secret until the reveal.',
  drawsNext: (name: string) => `${name} draws it next.`,
  describesNext: (name: string) => `${name} describes it next.`,
  drawsYoursNext: (name: string) => `${name} draws your words next.`,
  lastStep: 'Yours is the last step of this chain.',
  waitingFor: (names: string) =>
    `Waiting for ${names}. The step ends when everyone is done.`,
  backIn: (step: number) => `You’re back in step ${step}.`,
  revealNext: 'The reveal comes next.',
  goesOn: {
    prompt: (name: string) => `Your line goes to ${name}.`,
    drawing: (name: string) => `Your drawing goes to ${name}, as it is.`,
    description: (name: string) => `Your words go to ${name}.`,
  } satisfies Record<DoodleChainKind, (name: string) => string>,
  chainsMoveOn: 'The chains move one place on.',
  left: 'left',
  toStep: (step: number) => `to step ${step}`,
  toReveal: 'to the reveal',
  paused: 'paused',
  revealOf: (chain: number, chains: number) =>
    `Reveal · chain ${chain} of ${chains}`,
  chainOf: (name: string) => `${name}’s chain`,
  shownOf: (shown: number, total: number) => `${shown} of ${total} shown`,

  // The step in hand.
  firstLine: 'Your first line',
  yourDescription: 'Your description',
  promptHelper: (length: number, max: number) =>
    `${length} / ${max} · anything drawable, in any language`,
  descriptionHelper: (length: number, max: number) => `${length} / ${max}`,
  doneWaiting: (names: string) => `Done. Waiting for ${names}.`,
  doneAll: 'Done. Everyone is done.',
  asItIs: 'When the clock runs out, your drawing goes on as it is.',
  drawFirst: 'Draw something first, then press Done.',
  givenDrawing: 'The drawing you were given',
  yourDrawing: 'Your drawing',
  nothingTo: {
    drawing: 'Nothing to draw',
    description: 'Nothing to describe',
  },
  cameBackEmpty: {
    drawing: 'The words before yours came back empty.',
    description: 'The drawing before yours came back empty.',
  },
  skipped: (
    author: string,
    reason: 'time' | 'left',
    owner: string,
    /** Null after the last step; undefined when the next player has left too. */
    next: string | null | undefined,
  ) =>
    `${author} ${reason === 'left' ? 'left the game' : 'ran out of time'}, so ${owner}’s chain skips this step${next ? ` and goes on to ${next}` : next === null ? ' and ends on the entry before' : ''}.`,
  passing: {
    prompt: 'Passing the chains on. Next: draw the words you are given.',
    drawing: 'Passing the chains on. Next: draw the words you are given.',
    description:
      'Passing the chains on. Next: describe the drawing you are given.',
  } satisfies Record<DoodleChainKind, string>,
  passingToReveal: 'Passing the chains on. Next: the reveal.',
  doneOf: (done: number, of: number) => `${done} of ${of} done`,
  stepKind: {
    prompt: (seconds: number) => `Writing, ${seconds}s a step`,
    drawing: (seconds: number) => `Drawing, ${seconds}s a step`,
    description: (seconds: number) => `Describing, ${seconds}s a step`,
  } satisfies Record<DoodleChainKind, (seconds: number) => string>,

  // The players.
  waiting: 'Waiting',
  statusDone: 'Done',
  working: {
    prompt: 'Writing',
    drawing: 'Drawing',
    description: 'Describing',
  } satisfies Record<DoodleChainKind, string>,
  sitsOut: 'Sits this step out',
  passingStatus: 'Passing',
  away: 'Away',
  showing: 'Showing the chains',
  watching: 'Watching',
  favourite: 'Crowd favourite',
  // After a game, in place of a place, for a player given no hearts.
  heartless: 'No hearts',
  hearts: 'Hearts',

  // Entries.
  verb: {
    prompt: 'started the chain',
    drawing: 'drew it',
    description: 'described it',
  } satisfies Record<DoodleChainKind, string>,
  ranOutOfTime: 'ran out of time',
  leftTheGame: 'left the game',
  drawingBy: (name: string) => `${name}’s drawing`,
  // Read out as the reveal shows an entry: "Maya started the chain: …".
  shown: (name: string, verb: string, text: string) =>
    text ? `${name} ${verb}: ${text}` : `${name} ${verb}.`,

  // The reveal.
  next: 'Next',
  nextChain: 'Next chain',
  seeAlbum: 'See the album',
  moreIn: (count: number, owner: string) =>
    `${countWord(count)} more in ${owner}’s chain.`,
  lastIn: (owner: string) => `Next shows the last of ${owner}’s chain.`,
  chainDone: (owner: string, next: string) =>
    `That’s ${owner}’s chain. ${next}’s is next.`,
  allShown: 'That’s every chain. The album has them all.',
  hostShowing: (host: string) => `${host} is showing the chains.`,
  hostNext: (host: string, next: string) =>
    `${host} is showing the chains. ${next}’s chain is next.`,
  hostAway: (host: string) =>
    `${host} is away. The reveal goes on when they are back.`,

  // The album.
  everyChain: 'That’s every chain.',
  soFar: 'That’s every chain so far.',
  endedEarly: 'Too few players were left to finish, so the game ended early.',
  albumDetail: (chains: number, entries: number) =>
    `${plural(chains, 'chain')}, ${plural(entries, 'entry', 'entries')}.`,
  favouriteDetail: (name: string, kind: DoodleChainKind, hearts: number) =>
    `${name}’s ${kind === 'prompt' ? 'first line' : kind} is the crowd favourite, with ${plural(hearts, 'heart')}.`,
  sharedFavourite: (count: number, hearts: number) =>
    `${countWord(count)} entries share the crowd favourite, with ${plural(hearts, 'heart')} each.`,
  noHearts: 'Nobody gave a heart this time.',
  chains: 'Chains',
  albumStays: 'The album stays until the next game starts.',
};
