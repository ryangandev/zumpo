import type { GameType } from '../../../../shared/wire-types';
import type { GameKind } from '../../games/catalog';
import { plural } from './plural';

/**
 * How to play, short enough to take in within half a minute: what a room's
 * waiting card and its How to play dialog say, and the dialog on your own.
 * Rules only, never the room's settings, which the waiting card states.
 */
export interface HowToPlay {
  /** What you are trying to do, in one line. */
  goal: string;
  /** How to act, and how to read what the game shows back, a line each. */
  steps: readonly [string, string, string];
  /** How it is scored or won. */
  score: string;
}

/** What every page says about a game outside its room. */
export interface GameText {
  name: string;
  /** One line on the game cards; two at most on a tile. */
  tagline: string;
  /** A shorter one for a phone's row, where the tagline takes three lines. */
  rowTagline?: string;
  /**
   * Who plays, as a paper tag on the game's card and intro: "2–8 players". A
   * game with a solo mode has a Solo tag before it.
   */
  facts: string;
  /** How to play in a room, on its waiting card, in its dialog and on the game's page. */
  howToPlay: HowToPlay;
  /**
   * Every rule, in a room and on your own, under Full rules in the How to
   * play dialog and on the game's page; blank lines separate paragraphs.
   */
  rules: string;
  /** The create-room card's description. */
  createDescription: string;
  /**
   * The game on your own, for a game that has one: the line under its title,
   * and how to play it.
   */
  solo?: { summary: string; howToPlay: HowToPlay };
  /** "3 points", "1 pair": a score in the game's own unit. */
  score: (points: number) => string;
}

/** A game whose room setting is a count, not a board. */
export type CountedGame = Exclude<GameType, 'minesweeper' | 'pairs' | 'gomoku'>;

export const games = {
  kinds: {
    party: { name: 'Party', about: 'Draw, bluff and read the room.' },
    puzzles: {
      name: 'Puzzles',
      about: 'One answer to find, at your own pace or in a race.',
    },
    'spot-and-remember': {
      name: 'Spot & remember',
      about: 'Sharp eyes and a good memory.',
    },
    strategy: { name: 'Strategy', about: 'Think a few moves ahead.' },
  } satisfies Record<GameKind, { name: string; about: string }>,
  /** The filter chips' group, and its first chip. */
  kindOfGame: 'Kind of game',
  all: 'All',
  pickAGame: 'Pick a game',
  /** The tag before a game's player count when it can be played alone. */
  solo: 'Solo',
  /** The ways into a game. */
  playSolo: 'Play solo',
  /** A card's Solo tag, a link straight to the game on your own. */
  playGameSolo: (game: string) => `Play ${game} solo`,
  /** Where today's puzzle of a daily game stands, in place of Solo. */
  today: {
    guess: (guess: number, of: number) => `Guess ${guess} of ${of}`,
    done: 'Done today',
    /** On the game's page, beside its Continue or See today's result. */
    doneStreak: (days: number) => `Done today · ${days}-day streak`,
    continue: 'Continue',
    seeResult: 'See today’s result',
  },
  /** The setting a room was made with, counted: "2 rounds", "10 hands". */
  /** The words in the games' artwork, which show a game being played. */
  artwork: {
    /**
     * Draw & Guess: the word the turtle was guessed as. Its words are
     * English in every language, so the artwork says it as players type it.
     */
    drawn: 'turtle',
    /** Doodle Chain: the line the chain starts from, in any language. */
    chainLine: 'turtle',
    /** Doodle Chain: what the next player made of the drawing. */
    chainGuess: 'burger?',
  },
  counts: <Record<CountedGame, (count: number) => string>>{
    'draw-and-guess': (rounds) => plural(rounds, 'round'),
    'make-24': (hands) => plural(hands, 'hand'),
    trios: (trios) => plural(trios, 'trio'),
    snap: (cards) => plural(cards, 'card'),
    'liars-dice': (dice) => `${dice} dice each`,
    hush: (levels) => plural(levels, 'level'),
    'doodle-chain': (seconds) => `${seconds}s to draw`,
    'daily-word': (words) => plural(words, 'word'),
    'code-breaker': (codes) => plural(codes, 'code'),
  },
  of: <Record<GameType, GameText>>{
    'draw-and-guess': {
      name: 'Draw & Guess',
      tagline: 'One draws. Everyone else tries to get there first.',
      facts: '2–8 players',
      howToPlay: {
        goal: 'Draw a word for the others to guess, and guess theirs.',
        steps: [
          'On your turn, pick one of three words and draw it.',
          'Everyone else types guesses in the chat, and letters show as the clock runs down.',
          'Guess it and your chat locks until the next turn, so you cannot give it away.',
        ],
        score:
          'Faster guesses score more, and the drawer gets a share of each.',
      },
      rules: `2–8 players · 1–4 rounds

Everyone takes a turn to draw. One word category is used for the whole game, and everyone can see it.
The drawer has 15 seconds to pick one of 3 words. If time runs out, the first one is picked.

Everyone else has 90 seconds to type the word into the chat. Letters are revealed as the clock runs down. Once you get it, your chat locks until the next turn.

Faster guesses earn more, from 50 to 150 points, and the drawer gets two fifths of each. The answer is shown for 10 seconds, then the next turn starts.`,
      createDescription: 'Each round, everyone takes one turn to draw.',
      score: (points) => plural(points, 'point'),
    },
    minesweeper: {
      name: 'Minesweeper',
      tagline: 'Clear a board on your own, or share one and pick in secret.',
      facts: '2–8 players',
      howToPlay: {
        goal: 'Share one board, and pick safe cells in secret.',
        steps: [
          'Everyone picks one hidden cell at the same time, and nobody sees which.',
          'A number counts the mines in the eight cells around it.',
          'Then every pick opens at once: safe cells clear, mines go off.',
        ],
        score:
          'A riskier safe pick pays more, a mine costs points, and two on one safe cell split it.',
      },
      rules: `2–8 players · one shared board

Everyone picks one hidden cell at the same time. Your click locks your pick, and nobody sees which cell you chose.

You have 15 seconds to pick, then 4 seconds to see what everyone picked. A safe pick pays 10 points, plus more the riskier it was. A mine costs points, and costs more the safer the cell looked.

Pick the same safe cell as someone else? You split the reward. Run out of time? The safest cell is picked for you, without the 10-point base.

The board is Small, Medium or Large, chosen when the room is created. The game ends when the board is resolved or fewer than 2 players remain.

On your own, it is classic Minesweeper: open every safe cell without hitting a mine. Your first click is always safe. Right-click or long-press a cell to flag it, and click a number whose flags are all placed to open the rest around it. Your best time on each board is kept on this device.`,
      createDescription:
        'Pick a board. Small is a quick game; Large takes a while.',
      solo: {
        summary: 'Open every safe cell. The numbers count the mines next door.',
        howToPlay: {
          goal: 'Open every safe cell without hitting a mine.',
          steps: [
            'Click a cell to open it; your first click is always safe.',
            'A number counts the mines in the eight cells around it.',
            'Right-click or long-press to flag a mine, then click a number whose flags are placed to open the rest around it.',
          ],
          score: 'Clear the board fast: your best time on each board is kept.',
        },
      },
      score: (points) => plural(points, 'point'),
    },
    'make-24': {
      name: 'Make 24',
      tagline: 'Four numbers. Plus, minus, times, divide. Make 24.',
      facts: '2–8 players',
      howToPlay: {
        goal: 'Make 24 from the same four numbers before the others do.',
        steps: [
          'Use each number once, with plus, minus, times and divide.',
          'Pick a number, a sign, then another number: the two become one new card.',
          'Keep going until one card is left. Undo and Start over are free.',
        ],
        score: 'A solved hand pays 50 points, plus more the quicker you were.',
      },
      rules: `2–8 players · 5 or 10 hands

Every hand is four numbers from 1 to 13, and every hand can be solved. Use each number once, with plus, minus, times and divide, to make 24.

Pick a number, a sign, then another number: the two become one new card. Keep going until one card is left. Undo and Start over are free.

Everyone gets the same hand at the same time, with 60 seconds to solve it. Solving it pays 50 points, plus up to 100 more for the time left. Others see that you solved it, never how, and your chat waits until the hand ends.

On your own, a run is ten hands against one clock. Skip a hand you are stuck on, and 30 seconds go on the clock. Your best time is kept on this device, and Challenge a friend sends them the same ten hands.`,
      createDescription:
        'Every hand is 60 seconds. Five hands is a quick game.',
      solo: {
        summary:
          'Four numbers, four signs, one target. Every hand can be solved.',
        howToPlay: {
          goal: 'Make 24 from four numbers, ten hands in a row, against one clock.',
          steps: [
            'Use each number once, with plus, minus, times and divide.',
            'Pick a number, a sign, then another number: the two become one new card.',
            'Stuck? Skip the hand, and 30 seconds go on the clock.',
          ],
          score: 'Your best time for the ten hands is kept on this device.',
        },
      },
      score: (points) => plural(points, 'point'),
    },
    pairs: {
      name: 'Pairs',
      tagline: 'Flip two cards. Remember where everything is. Find every pair.',
      rowTagline: 'Flip two cards. Remember where everything is.',
      facts: '2–6 players',
      howToPlay: {
        goal: 'Find more matching pairs than anybody else.',
        steps: [
          'Every symbol is on two cards. On your turn, flip two of them.',
          'A match is your pair, and you go again.',
          'No match: everyone sees both, then they flip back and the next player goes.',
        ],
        score: 'When every pair is found, whoever found the most wins.',
      },
      rules: `2–6 players · a Small or Large board

Every card lies face down, and every symbol is on two of them. Players take turns, in an order drawn at the start.

On your turn you have 10 seconds to flip two cards. If they match, the pair is yours and you go again. If not, everyone sees both for 2 seconds, then they flip back and the next player goes.

Run out of time and a card you flipped alone flips back. A player who is away when their turn comes is skipped. When every pair is found, whoever found the most wins.

On your own, clear the board in as few turns as you can; your time breaks a tie. Two cards that do not match flip back after a second. Your best on each board is kept on this device, and Challenge a friend sends them the same deck.`,
      createDescription:
        'Take turns flipping two cards. Small is a quick game; Large takes a while.',
      solo: {
        summary: 'Flip two cards at a time. Remember where everything is.',
        howToPlay: {
          goal: 'Clear the board in as few turns as you can.',
          steps: [
            'Every symbol is on two cards. Flip two at a time.',
            'A match stays face up.',
            'No match: both flip back after a second, so remember where they were.',
          ],
          score:
            'Fewer turns is better, and your time breaks a tie. Your best is kept.',
        },
      },
      score: (pairs) => plural(pairs, 'pair'),
    },
    trios: {
      name: 'Trios',
      tagline: 'Spot three that are all the same or all different.',
      facts: '2–8 players',
      howToPlay: {
        goal: 'Spot trios among the twelve cards before anybody else.',
        steps: [
          'Every card has four features: colour, shape, how many shapes, and fill.',
          'Three cards are a trio when each feature is all the same or all different on them.',
          'Pick three, with no turns: the third pick claims them. A wrong trio locks you out for 3 seconds.',
        ],
        score: 'Every trio is a point, and whoever finds the most wins.',
      },
      rules: `2–8 players · 10 or 20 trios

Every card has four features: its colour (coral, blue or ink), its shape (circle, triangle or square), how many shapes it shows (one, two or three) and its fill (solid, striped or outlined). Three cards are a trio when, for each feature on its own, they are all the same or all different. Two circles and a square are never a trio.

Twelve cards are on the table, always with a trio among them. Everyone looks at the same table at the same time, and there are no turns. Pick three cards; your third pick claims them, and nobody sees your picks before then.

The first trio claimed is taken, for 1 point: everyone sees it, and who found it, for 2 seconds, then three new cards take its place. Three that are not a trio lock you out for 3 seconds, and never cost a point. If nobody finds a trio for 30 seconds, one card of a trio is marked for everyone, and 30 seconds later a second.

The game ends after its 10 or 20 trios. Whoever found the most wins.

On your own, a run is ten trios against one clock. A wrong pick adds 5 seconds; Hint marks a card of a trio for 10 seconds, twice at most. Your best time is kept on this device, and Challenge a friend sends them the same deal.`,
      createDescription:
        'Everybody looks at the same twelve cards, and the first to pick a trio takes it. 10 trios is about three minutes.',
      solo: {
        summary:
          'Twelve cards on the table, and three of them make a trio. Find ten as fast as you can.',
        howToPlay: {
          goal: 'Find ten trios among the twelve cards, against one clock.',
          steps: [
            'Every card has four features: colour, shape, how many shapes, and fill.',
            'Three cards are a trio when each feature is all the same or all different on them.',
            'A wrong pick adds 5 seconds. Hint marks a card of a trio and adds 10.',
          ],
          score: 'Your best time is kept on this device.',
        },
      },
      score: (trios) => plural(trios, 'trio'),
    },
    snap: {
      name: 'Snap',
      tagline: 'Spot the symbol both cards share.',
      facts: '2–6 players',
      howToPlay: {
        goal: 'Be first to spot the symbol your card shares with the middle card.',
        steps: [
          'Any two cards share exactly one symbol, never more and never less.',
          'There are no turns: tap that symbol on either card.',
          'Tap first and the middle card is yours. A wrong tap locks you out for 2 seconds.',
        ],
        score:
          'Every card you take is a point, and whoever takes the most wins.',
      },
      rules: `2–6 players · 31 cards

Every card has six symbols, and any two cards share exactly one of them, never more and never less. No two symbols share a shape, so colour alone never tells them apart.

Everybody is dealt one card face up, and one more is turned up in the middle. Everyone looks at the same middle card at the same time, and there are no turns. Find the one symbol your card shares with it, and tap that symbol on either card.

The first right tap takes the middle card, for 1 point: everyone sees who took it, and the symbol, for a moment, and it becomes the taker’s card. Then the next card is turned. A symbol that is on only one of the two cards locks you out for 2 seconds, and never costs a point.

The game ends when the pile runs out. Whoever took the most cards wins.

On your own, a run is thirty cards against one clock. A wrong tap adds 3 seconds. Your best time is kept on this device, and Challenge a friend sends them the same deck.`,
      createDescription:
        'Everybody races to spot the symbol their card shares with the middle card. A game is about two minutes.',
      solo: {
        summary:
          'Your card and the middle card share exactly one symbol. Spot it thirty times, as fast as you can.',
        howToPlay: {
          goal: 'Spot the symbol your card shares with the middle card, thirty times, against one clock.',
          steps: [
            'Any two cards share exactly one symbol, never more and never less.',
            'Tap that symbol on either card, and the middle card becomes yours.',
            'A wrong tap adds 3 seconds.',
          ],
          score: 'Your best time is kept on this device.',
        },
      },
      score: (cards) => plural(cards, 'card'),
    },
    'liars-dice': {
      name: 'Liar’s Dice',
      tagline: 'Roll in secret. Bid on the whole table. Call the bluff.',
      facts: '2–6 players',
      howToPlay: {
        goal: 'Bid on what the whole table rolled, call the bluffs, and keep your dice.',
        steps: [
          'Everybody rolls in secret, then you bid in turn round the table. A bid like “four 6s” says the whole table holds at least four 6s. Ones are wild, so a bid names a face from 2 to 6.',
          'You have 20 seconds to raise or call Liar. A raise is more dice of any face, or as many of a higher face.',
          'Call Liar and every cup opens. If the bid holds, the caller loses a die; if not, the bidder does. Whoever lost it opens the next round.',
        ],
        score:
          'Lose your last die and you are out. The last player with dice wins.',
      },
      rules: `2–6 players · 3 or 5 dice each

Everybody rolls their dice in secret, then takes turns bidding on the whole table: at least so many dice showing one face. Ones are wild: they count as any face, so nobody bids on them. About a third of the dice show any face, ones included.

On your turn, raise the bid or call Liar. A raise is more dice of any face, or as many dice of a higher face. You have 20 seconds; run out and Liar is called for you, or one 2 is bid if nobody has bid yet.

Call Liar and every cup opens for 5 seconds. If the table holds at least as many as the bid said, the caller loses a die; if not, the bidder does. Whoever lost a die opens the next round. Lose your last die and you are out; the last player with dice wins.

On your own, play 1 to 5 bots with no clock, and go on to the next round when you are ready. Your wins are kept on this device.`,
      createDescription:
        'Take turns bidding on everybody’s dice. 3 dice each is a quick game; 5 is the classic.',
      solo: {
        summary: 'Roll in secret. Bid on the whole table. Call the bluff.',
        howToPlay: {
          goal: 'Bid on what the whole table rolled, call the bots’ bluffs, and keep your dice.',
          steps: [
            'A bid like “four 6s” says the whole table holds at least four 6s. Ones are wild: they count as any face, so a bid names a face from 2 to 6.',
            'On your turn, raise or call Liar. A raise is more dice of any face, or as many of a higher face.',
            'Call Liar and every cup opens. If the bid holds, the caller loses a die; if not, the bidder does.',
          ],
          score:
            'The last player with dice wins. Expect about a third of all dice to count for any one face.',
        },
      },
      score: (dice) => plural(dice, 'die', 'dice'),
    },
    hush: {
      name: 'Hush',
      tagline: 'No turns, no talking. Play every card in order, together.',
      facts: '2–4 players',
      howToPlay: {
        goal: 'Play every card onto one pile, lowest first, together.',
        steps: [
          'Everybody holds numbered cards from 1 to 100, and sees only their own.',
          'There are no turns and no talking: anybody plays their lowest card at any moment.',
          'Play a card while somebody still holds a lower one, and the team loses a life.',
        ],
        score:
          'Clear every level to win together. A level without a slip wins a life back.',
      },
      rules: `2–4 players · 7, 6 or 5 levels

Everybody holds numbered cards from 1 to 100, and the whole table plays them onto one pile, lowest first. There are no turns: anybody plays their lowest card at any moment. Nobody may say a word, so the chat is locked while a level is played.

Level 1 deals one card each, level 2 two, and so on. Before each level everybody presses Ready; then the cards are dealt, and play opens after a 3-second countdown.

Play a card while somebody still holds a lower one, and the team loses a life: every lower card is shown and discarded, and play stops for 3 seconds. The team has 3 lives, and a level without a slip wins one back.

Clear the last level to win together. Two players play 7 levels, three play 6 and four play 5. A player who drops pauses the level until they are back; if their seat goes, their cards are discarded and no life is lost.`,
      createDescription:
        'Play every card in order, together, without a word. Fewer players play more levels.',
      score: (levels) => plural(levels, 'level'),
    },
    'doodle-chain': {
      name: 'Doodle Chain',
      tagline: 'Write a line, draw it, pass it on, and watch it fall apart.',
      facts: '3–8 players',
      howToPlay: {
        goal: 'Pass a line round the table as drawings and words, and watch it change.',
        steps: [
          'Everyone starts a chain by writing a line: anything drawable.',
          'Then draw the line you are given, or say in words what the drawing shows.',
          'You only ever see the step before yours.',
        ],
        score:
          'The host shows every chain at the end. Your score is the hearts your entries get.',
      },
      rules: `3–8 players · one step each, up to six

Everyone starts a chain by writing a line: anything drawable, in any language. Stuck? Suggest fills in one. Then every chain moves one place round the table, and the next player draws the line they are given. The next one says in words what that drawing shows, the next draws those words, and so on. You only ever see the step before yours.

Everyone plays each step at once. Writing and describing take 30 seconds, drawing takes the room’s drawing time. Press Done when you are finished, and the step ends early once everyone is done; when the clock runs out, whatever you have goes on as it is.

A game has one step per player, but never more than six. If the entry before yours came back empty, you sit that step out and the chain goes on from the entry before it.

Then the host shows every chain, one entry at a time, from its first line to its last. Give one heart in each chain to its best moment; your score is the hearts your entries get. The chains stay in the album until the next game starts.`,
      createDescription:
        'Write, draw and describe round the table, then watch every chain unfold. The players are the length: one step each, up to six.',
      score: (hearts) => plural(hearts, 'heart'),
    },
    'daily-word': {
      name: 'Daily Word',
      tagline: 'Five letters, six guesses. A new word every day.',
      facts: '2–8 players',
      howToPlay: {
        goal: 'Find the same hidden five-letter word as the others, in fewer guesses.',
        steps: [
          'Every guess must be a real five-letter word.',
          'Green square: right letter, right place. Coral circle: in the word, somewhere else. Grey tile: not in the word.',
          'Others see your marks as you go, never your letters.',
        ],
        score: 'Fewer guesses score more, plus a little for the time left.',
      },
      rules: `2–8 players · 3 or 5 words

Find a hidden five-letter word in six guesses. Every guess must be a real word. After each one, every letter is marked: a green square is in the right place, a coral circle is in the word but somewhere else, and a flat grey tile is not in the word.

A letter is marked only as many times as it is in the word, and a letter in its right place counts first. A guess that is not a word, or one you already made, is turned back and costs nothing.

Everyone guesses the same word at the same time, with 2 minutes for each. Finding it pays 100 points for every guess you had left over, plus up to 50 for the time left. Others see your marks as you go, never your letters, and once you find it your chat waits until the word is revealed.

On your own, there is one word a day, the same for everybody, and a new one at your midnight. Your stats and streak are kept on this device. After it, play practice words as long as you like, and Challenge a friend sends them the same word.`,
      createDescription:
        'Every word is two minutes. Three words is a quick game.',
      solo: {
        summary:
          'One word a day, the same for everybody. Six guesses to find it.',
        howToPlay: {
          goal: 'Find the hidden five-letter word in six guesses.',
          steps: [
            'Every guess must be a real five-letter word.',
            'Green square: right letter, right place. Coral circle: in the word, somewhere else. Grey tile: not in the word.',
            'One word a day, the same for everybody, then practice words as you like.',
          ],
          score: 'Your stats and streak are kept on this device.',
        },
      },
      score: (points) => plural(points, 'point'),
    },
    'code-breaker': {
      name: 'Code Breaker',
      tagline: 'Four digits, ten guesses. A new code every day.',
      facts: '2–8 players',
      howToPlay: {
        goal: 'Crack the same hidden four-digit code as the others, in fewer guesses.',
        steps: [
          'The code and every guess are four different digits; a code may start with 0.',
          'Each guess gets four pegs. Green square: right digit, right place. Coral circle: right digit, somewhere else. Grey square: not in the code.',
          'The pegs count digits; they never say which ones.',
        ],
        score: 'Fewer guesses score more, plus a little for the time left.',
      },
      rules: `2–8 players · 1 or 3 codes

Crack a hidden code of four different digits, 0 to 9, in ten guesses. A code may start with 0. Every guess is four different digits too.

After each guess, four pegs say how close it was: a green square for each digit in the code and in the right place, a coral circle for each digit in the code but somewhere else, and a grey square for each of the rest. The pegs count digits; they never say which ones. A guess you already made is turned back and costs nothing.

Notes on the pad are yours alone: turn Notes on, and a digit key marks that digit out, then in, then plain again.

Everyone guesses the same code at the same time, with 3 minutes for each. Cracking it pays 100 points, plus 100 for every guess you had left over, plus up to 50 for the time left. Others see your pegs as you go, never your digits, and once you crack it your chat waits until the code is revealed.

On your own, there is one code a day, the same for everybody, and a new one at your midnight. Your stats and streak are kept on this device. After it, play practice codes as long as you like, and Challenge a friend sends them the same code.`,
      createDescription:
        'Every code is three minutes. Three codes is about ten minutes.',
      solo: {
        summary:
          'One code a day, the same for everybody. Ten guesses to crack it.',
        howToPlay: {
          goal: 'Crack the hidden four-digit code in ten guesses.',
          steps: [
            'The code and every guess are four different digits; a code may start with 0.',
            'Each guess gets four pegs. Green square: right digit, right place. Coral circle: right digit, somewhere else. Grey square: not in the code.',
            'The pegs count digits; they never say which ones.',
          ],
          score:
            'One code a day, the same for everybody. Your streak is kept on this device.',
        },
      },
      score: (points) => plural(points, 'point'),
    },
    gomoku: {
      name: 'Gomoku',
      tagline: 'Take turns placing stones. Five in a row wins.',
      facts: '2 players',
      howToPlay: {
        goal: 'Be the first to make five in a row.',
        steps: [
          'Colours are drawn for the first game, and Black moves first. Then you take turns placing one stone on any empty point.',
          'Five or more in a row wins: across, down or diagonally.',
          'You have 30 seconds a move. Miss two turns in a row and you lose.',
        ],
        score: 'Every game won is a point, and colours swap every game.',
      },
      rules: `2 players · a 15 × 15 board

Black and White take turns placing one stone on any empty point, Black first. The first to make five or more in a row, across, down or diagonally, wins. A full board with no five is a draw.

You have 30 seconds a move; run out and the turn passes, and miss two turns in a row and you lose the game. You can resign at any time. Colours are drawn for the first game and swap every game after it, and every game won is a point. Up to 5 more can watch.

On your own, play the computer at Easy, Medium or Hard, as Black or White. Your wins are kept on this device.`,
      createDescription:
        'Two players take turns, black first, and five in a row wins. Up to five more can watch.',
      solo: {
        summary:
          'Take turns placing stones. Five in a row, across, down or diagonally, wins.',
        howToPlay: {
          goal: 'Make five in a row before the computer does.',
          steps: [
            'Black moves first, then you take turns placing one stone on any empty point.',
            'Five or more in a row wins: across, down or diagonally.',
            'There is no clock, and on your turn you can take back your last move.',
          ],
          score: 'A full board is a draw. Your wins are kept on this device.',
        },
      },
      score: (wins) => plural(wins, 'win'),
    },
  },
};
