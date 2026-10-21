import { plural } from './plural';

export const hush = {
  hushedChat: 'Hush. Chat opens when the level ends.',
  chatPlaceholder: 'Say something…',
  levelOf: (level: number, levels: number) => `Level ${level} of ${levels}`,
  gameOver: 'Game over',
  gameEnded: 'Game ended',
  waitingRoom: 'Waiting room',
  you: (first: boolean): string => (first ? 'You' : 'you'),
  player: 'A player',
  level: (level: number) => `Level ${level}`,
  allCards: (count: number) => `All ${plural(count, 'card')}`,
  asEnded: 'As it ended',
  alone: 'A little better with company.',
  setup: (players: number, levels: number) =>
    `${plural(players, 'player')}, ${plural(levels, 'level')}. Play every card in order, together, without a word.`,
  guestSetup: (players: number, levels: number) =>
    `${plural(players, 'player')}, ${plural(levels, 'level')}.`,
  lastLife: (level: number) => `Level ${level}: the last life lost`,
  unfinished: (level: number) => `Level ${level}: not finished`,
  clean: (level: number, lifeBack: boolean) =>
    `Level ${level}: clean${lifeBack ? ', a life back' : ''}`,
  livesLost: (level: number, lives: number) =>
    lives === 1
      ? `Level ${level}: a life lost`
      : `Level ${level}: ${plural(lives, 'life', 'lives')} lost`,
  won: (levels: number) => `All ${plural(levels, 'level')} cleared.`,
  lost: (level: number) => `Out of lives on level ${level}.`,
  wonDetail: (lives: number) =>
    lives === 0
      ? 'Together.'
      : `Together, with ${plural(lives, 'life', 'lives')} to spare.`,
  lostDetail: (cleared: number, levels: number) =>
    `${cleared} of ${plural(levels, 'level')} cleared, together.`,
  levelByLevel: 'Level by level',
  playedBy: 'Played by',
  stillHeld: 'Still held',
  playerHeld: (name: string) => `${name} held`,
  nothingLeft: 'Nothing left',
  dealtWhenReady: 'Cards are dealt when everyone is ready',
  lowestHere: 'The lowest card in the room goes here',
  cardsEach: (count: number) => `${plural(count, 'card')} each`,
  pile: 'The pile',
  underTop: 'Under the top card',
  allPlayed: (count: number) => `All ${plural(count, 'card')} played`,
  playedDiscarded: (played: number, discarded: number) =>
    `${plural(played, 'card')} played, ${discarded} discarded`,
  lowestFirst: 'Lowest first',
  noCards: 'No cards left',
  cardsToGo: (count: number) => `${plural(count, 'card')} to go`,
  ready: 'Ready',
  yourReady: 'You’re ready',
  readyWhen: 'Ready when you are',
  chatTiming: 'The chat locks when the level starts, and opens when it ends.',
  /** Level 1's, before the first deal: the rule, then the chat. */
  firstRule:
    'No turns, no talking: play your lowest card when it feels right, so the pile goes up from the lowest. The chat locks when the level starts.',
  readyButton: 'I’m ready',
  waitingOthers: 'Waiting for the others.',
  nextUp: 'Next up',
  nextLevel: (level: number) =>
    `Level ${level} deals ${plural(level, 'card')} each. Everyone presses Ready again.`,
  hand: 'Your hand',
  watchingHand: 'You’re watching. The team plays without a word.',
  handEmpty: 'Nothing left to play. Watch the pile, without a word.',
  play: (card: number) => `Play ${card}`,
  onlyLowest: 'Only your lowest card can be played.',
  opensSoon: 'Play opens in a moment.',
  returns: (names: string, count: number) =>
    `Play goes on with a countdown when ${names} ${count === 1 ? 'is' : 'are'} back.`,
  goesSoon: 'Play goes on in a moment.',
  pausedClock: 'paused',
  getReady: 'Get ready',
  waitingFor: (names: string) => `Waiting for ${names}.`,
  namesReady: (names: string, count: number) =>
    `${names} ${count === 1 ? 'is' : 'are'} ready.`,
  pressReady: 'Press Ready when you’re settled.',
  hush: 'Hush',
  everyoneHolds: (count: number) => `Everybody holds ${plural(count, 'card')}.`,
  toStart: 'to start',
  heldCards: (name: string, cards: string) => `${name} still held ${cards}`,
  playedCard: (name: string, card: number) => `${name} played ${card}`,
  mistake: (held: string) => `${held}. One life lost.`,
  toGoOn: 'to go on',
  paused: 'Paused',
  waitingHolder: (names: string, held: number) =>
    `Waiting for ${names}, who still holds ${plural(held, 'card')}.`,
  waitingHolders: (names: string) =>
    `Waiting for ${names}, who still hold cards.`,
  seatHeld: 'seat held',
  cleared: 'Level cleared!',
  cleanLifeBack: 'Not one slip: a life back.',
  cleanLevel: 'Not one slip.',
  costLives: (lives: number) => `It cost ${plural(lives, 'life', 'lives')}.`,
  toLevel: (level: number) => `to level ${level}`,
  playWhen: 'Play your lowest card when it feels right.',
  awayCards: (count: number) => `Away, ${plural(count, 'card')}`,
  away: 'Away',
  waiting: 'Waiting',
  gettingReady: 'Getting ready',
  levelCleared: 'Level cleared',
  lostCards: (cards: string, held: number) =>
    held === 0
      ? `Lost ${cards}, no cards left`
      : `Lost ${cards}, ${plural(held, 'card')} left`,
  cards: (count: number) => plural(count, 'card'),
};
