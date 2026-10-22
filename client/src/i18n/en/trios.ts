import { itemAt } from '../../../../shared/list';
import { COLOUR_WORDS } from '../../../../shared/trios';
import type { CardFeatures, Feature } from '../../../../shared/trios';
import { plural } from './plural';

const counts = ['one', 'two', 'three'];
const value = (feature: Feature, f: CardFeatures, many: boolean): string => {
  switch (feature) {
    case 'colour':
      return COLOUR_WORDS[f.colour];
    case 'shape':
      return many ? `${f.shape}s` : `a ${f.shape}`;
    case 'fill':
      return f.fill === 'outline' ? 'outlined' : f.fill;
    case 'count':
      return itemAt(counts, f.count - 1);
  }
};

export const trios = {
  reason: (feature: Feature, pair: CardFeatures, odd: CardFeatures) =>
    feature === 'count'
      ? `Two have ${value(feature, pair, true)} ${pair.count === 1 ? 'shape' : 'shapes'} and one has ${value(feature, odd, false)}.`
      : `Two are ${value(feature, pair, true)} and one is ${value(feature, odd, false)}.`,
  table: 'Table',
  lastTrio: (finder: string) => `Last trio: ${finder}`,
  progress: (found: number, total: number) =>
    `${found} of ${plural(total, 'trio')}`,
  gameOver: 'Game over',
  gameEnded: 'Game ended',
  waitingRoom: 'Waiting room',
  chat: 'Say something…',
  you: 'you',
  by: (name: string) => `by ${name}`,
  resultDetail: (count: number) => `${plural(count, 'trio')} found.`,
  alone: 'Better with company.',
  setup: (players: number, count: number) =>
    `${plural(players, 'player')}, ${plural(count, 'trio')}. Everybody looks at the same twelve cards; the first to pick a trio takes it.`,
  guestSetup: (players: number, count: number) =>
    `${plural(players, 'player')}, ${plural(count, 'trio')}.`,
  hint: 'Hint',
  hintBadge: 'hint',
  paused: 'paused',
  taken: 'Trio taken',
  youFound: 'You found a trio!',
  foundBy: (name: string) => `${name} found a trio`,
  newCardsSoon: 'New cards soon',
  newCards: 'new cards',
  notTrio: 'Not a trio',
  lockedOut: 'locked out',
  findTrio: 'Find a trio',
  pickThird: 'Pick a third card',
  pickTwo: 'Pick two more',
  oneMarked: 'One card of a trio is marked',
  twoMarked: 'Two cards of a trio are marked',
  pickThree: 'Pick three cards',
  everyoneLooking: 'Everyone is looking for a trio',
  findTwo: 'Find the other two',
  findThird: 'Find the third card',
  firstTakes: 'The first trio claimed takes it',
  toHint: 'to a hint',
  toSecondHint: 'to a second hint',
  withoutTrio: 'without a trio',
  away: 'Away',
  waiting: 'Waiting',
  foundTrio: 'Found a trio',
  looking: 'Looking',
  solo: {
    rule: 'In a trio, each of colour, shape, count and fill is all the same or all different across the three cards. A wrong pick adds 5 seconds.',
    whatMakesTrio: 'What makes a trio',
    example: 'A trio: the same colour; shape, count and fill all different.',
    notYet: 'Not yet',
    complete: 'Run complete',
    allFound: (count: number) => `All ${count} trios found`,
    leaveWarning: 'This run ends here, and its time is not kept.',
    resultTitle: (count: number, time: string) => `${count} trios in ${time}.`,
    wrongPicks: 'Wrong picks',
    hints: 'Hints',
    fastest: 'Fastest trio',
    none: 'Not yet',
    best: 'Best on this device',
    challenge: (time: string) =>
      `They get this same deal and try to beat ${time}.`,
    progress: (count: number, total: number) => `Trio ${count} of ${total}`,
    hintButton: 'Hint, +10 s',
    thisRun: 'This run',
    tenTrios: 'Ten trios',
    runTime: 'Time',
    trio: 'A trio!',
    foundIn: (time: string) => `Found in ${time}`,
    wrong: 'Not a trio, +5 s',
    features: 'All the same or all different in every feature',
    firstRun: 'Your first run on this device.',
    newBest: (time: string) =>
      `A new best on this device. Your last best was ${time}.`,
    previousBest: (time: string) => `Your best on this device is ${time}.`,
    note: (wrong: number, hints: number) =>
      [
        wrong ? plural(wrong, 'wrong pick') : '',
        hints ? plural(hints, 'hint') : '',
      ]
        .filter(Boolean)
        .join(', '),
    everyTrio: 'Every trio',
    cost: (count: number, time: string) => (count ? `${count}, +${time}` : '0'),
  },
};
