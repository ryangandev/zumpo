import {
  bidWords,
  HIGHEST_FACE,
  numberWord,
  type Bid,
} from '../../../../shared/liars-dice';
import type { LiarsDiceReveal } from '../../../../shared/wire-types';
import type { Who, Naming } from '../../liars-dice/words';
import { plural } from './plural';

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const loss = (reveal: LiarsDiceReveal, who: Naming): string => {
  const loser = who(reveal.loserId);
  return reveal.out
    ? `${loser.name} ${loser.you ? 'are' : 'is'} out`
    : `${loser.name} ${loser.you ? 'lose' : 'loses'} a die`;
};
const stands = (reveal: LiarsDiceReveal) => reveal.matched >= reveal.bid.count;

export const liarsDice = {
  dice: (count: number) => plural(count, 'die', 'dice'),
  you: 'you',
  youLabel: 'You',
  possessive: (name: string, you: boolean) => (you ? 'your' : `${name}’s`),
  bid: (bid: Bid) => bidWords(bid),
  bidLabel: (bid: Bid) => `Bid ${bidWords(bid)}`,
  bidLine: (who: Who, bid: Bid) => `${capital(who.name)} bid ${bidWords(bid)}`,
  /** What a raise must do, on your turn: "Beat four 5s: more dice, or a higher face". */
  beat: (bid: Bid) =>
    bid.face < HIGHEST_FACE
      ? `Beat ${bidWords(bid)}: more dice, or a higher face`
      : `Beat ${bidWords(bid)}: more dice`,
  countDetail: (reveal: LiarsDiceReveal) => {
    const wild =
      reveal.wild === 0
        ? 'no wild ones'
        : reveal.wild === 1
          ? 'incl. 1 wild one'
          : `incl. ${reveal.wild} wild ones`;
    return `${wild} · bid was ${numberWord(reveal.bid.count)}`;
  },
  lossLine: loss,
  verdict: (reveal: LiarsDiceReveal, who: Naming) =>
    stands(reveal)
      ? `${capital(who(reveal.bid.playerId).possessive)} bid stands`
      : `a lie, so ${loss(reveal, who)}`,
  revealBar: (reveal: LiarsDiceReveal, who: Naming) => ({
    label: `${capital(who(reveal.callerId).name)} called Liar`,
    main: `${capital(who(reveal.bid.playerId).possessive)} bid ${stands(reveal) ? 'stands' : 'was a lie'}`,
    meta: capital(loss(reveal, who)),
  }),
  out: 'Out',
  lostDie: 'Lost a die',
  calledLiar: 'Called Liar',
  outRound: (round: number) => `Out in round ${round}`,
  yourTurn: 'Your turn',
  deciding: 'Deciding',
  youNext: 'You go next',
  count: 'The count',
  bidsRound: 'Bids this round',
  face: (face: number) => `${face}s`,
  round: (round: number) => `Round ${round}`,
  gameOver: 'Game over',
  gameEnded: 'Game ended',
  waitingRoom: 'Waiting room',
  chat: 'Say something…',
  somebody: 'Somebody',
  each: (dice: number) => `${plural(dice, 'die', 'dice')} each`,
  resultDetail: (rounds: number, dice: number) =>
    `${plural(rounds, 'round')}, ${plural(dice, 'die', 'dice')} each.`,
  leftGame: 'Left the game',
  lastCall: 'The last call',
  alone: 'A little better with company.',
  setup: (players: number, dice: number) =>
    `${plural(players, 'player')}, ${plural(dice, 'die', 'dice')} each. Everybody rolls in secret, then bids on the whole table; call Liar on a bid you doubt.`,
  guestSetup: (players: number, dice: number) =>
    `${plural(players, 'player')}, ${plural(dice, 'die', 'dice')} each.`,
  outNote:
    'You are out of dice. Stay to watch who wins, and keep the table talk going.',
  callLiar: 'Call Liar',
  paused: 'paused',
  nextRound: 'next round',
  raiseOrCall: 'Raise, or call Liar',
  openBidding: 'Open the bidding',
  onTable: (dice: number) => `${plural(dice, 'die', 'dice')} on the table`,
  toBid: 'to bid',
  turn: (name: string) => `${name}’s turn`,
  isDeciding: (name: string) => `${name} is deciding`,
  openingRound: 'Opening the round',
  away: 'Away',
  waiting: 'Waiting',
  bidStands: 'Bid stands',
  bidLie: 'Bid was a lie',
  bidding: 'Bidding',
  upNext: 'Up next',
  solo: {
    record: (wins: number, games: number, run: number) =>
      `You have won ${wins} of ${plural(games, 'game')} here.${run > 1 ? ` You are on a run of ${run} wins.` : ''}`,
    description:
      'Bid on the whole table, bluff a little, and call the bots’ bluffs.',
    pickTable: 'Pick a table.',
    leaveWarning: 'This game ends here, and it is not counted.',
    bots: 'Bots',
    botCount: (count: number) => plural(count, 'bot'),
    diceEach: 'Dice each',
    quick: 'The quick game.',
    classic: 'The classic: a longer game.',
    diceCount: (count: number) => `${count} dice`,
    youWon: 'You won',
    wonIn: (rounds: number) => `You won in ${plural(rounds, 'round')}.`,
    outIn: (place: string, of: number) => `You finished ${place} of ${of}.`,
    lastAtTable: (dice: number) =>
      `Last at the table, with ${plural(dice, 'die', 'dice')} left.`,
    stillIn: (names: string, count: number, round: number) =>
      `${names} ${count === 1 ? 'was' : 'were'} still in, in round ${round}.`,
    gamesWon: 'Games won',
    gamesWonCount: (wins: number, games: number) => `${wins} of ${games}`,
    changeTable: 'Change table',
    nextRound: 'Next round',
    thisGame: 'This game',
    diceOnTable: 'Dice on the table',
    yourDice: 'Your dice',
    onDevice: 'On this device',
    notYet: 'Not yet',
    currentRun: 'Current run',
    wins: (count: number) => plural(count, 'win'),
    thinking: (name: string) => `${name} is thinking`,
  },
};
