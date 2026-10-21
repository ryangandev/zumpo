# Trios

Twelve cards on the table, and somewhere among them three that make a **trio**: for each of the four features, the three cards are all the same or all different.
On your own it is ten trios against the clock; in a room everybody looks at the same table at once, and the first to pick a trio takes it.

Solo, or 2–8 players with 10 or 20 trios a game.

---

## The cards

There are **81 cards**, one for every combination of four features with three values each:

| Feature    | Values                                                                          |
| ---------- | ------------------------------------------------------------------------------- |
| **Colour** | Coral (`color/trios/coral`), Blue (`color/trios/blue`), Ink (`color/trios/ink`) |
| **Shape**  | Circle, Triangle, Square                                                        |
| **Count**  | One, two or three shapes, side by side                                          |
| **Fill**   | Solid, Striped (stripes inside the outline), Outline                            |

Coral is the brand's accent; the pale accents (lime, blue, peach) would vanish as an outline on a paper card, so the other two colours are the brand's deep blue and its ink.
The three `color/trios/*` tokens alias `color/coral`, `color/number/1` and `color/ink`, so the cards name what they mean and can change on their own.
The three are far apart in lightness as well as in hue (light, middle, dark), so they stay apart for colour-blind players and even in greyscale.

A card is a number from 0 to 80, its four features read as base-3 digits: `card = colour × 27 + shape × 9 + (count − 1) × 3 + fill`, each value counted from 0 in the order of the table above.
A card's name says all four, as its accessible label does: "Two blue striped triangles".

## A trio

Three cards are a **trio** when, for every feature on its own, the three are all the same or all different.

- One coral, one blue and one ink card are all different in colour: fine.
- Two circles and a square are neither: not a trio, whatever the other features do.
- Three cards may differ in every feature, or share up to three of them; they never share all four, because no two cards are alike.

In numbers: for every feature, the three values add up to a multiple of 3.
So any two cards have exactly **one** third card that makes a trio with them, which is how hints and the deal find trios quickly.
Three cards picked at random are a trio one time in 79.

## The table and the deal

The table always shows **12 cards, with at least one trio among them**, in four columns of three on a desktop and three columns of four on a phone.
It never grows or shrinks, so nothing on screen moves while you look.

- **The deal.** The 81 cards are shuffled, and the first twelve are laid out.
  If those twelve hold no trio (about one deal in thirty), they go back, the deck is shuffled, and twelve are dealt again.
- **A trio taken** leaves three empty places, and the next three cards of the deck are dealt into them, each in the place of a taken card.
  If the table then holds no trio, those three go back into the deck, the deck is shuffled, and three more are dealt, until it does.
- **The deck always lasts.**
  A game takes at most 20 trios, which uses at most 12 + 3 × 20 = 72 of the 81 cards, and any 21 cards hold a trio, so a table with a trio can always be dealt.
  Should the table and the deck ever have no trio left between them, the game ends there.

Redealing keeps the table one fixed shape, where the classic game lays out three more cards; a table that sometimes has fifteen would reflow the grid mid-search, and on a phone push cards off the screen.

Everything is dealt from a seed (`shared/seed.ts`), so a seed always deals the same first table and the same deck.
Which trios you take decides which cards stay, and so the tables that follow, as in any card game.

## Picking

1. Pick a card; it lifts and is outlined in ink.
   Pick it again to put it back.
2. Pick a second.
3. The third pick is the claim: there is no button to press.

Everything before the third pick is yours alone and never leaves your screen.

Three cards that are not a trio are told why, by the first feature that breaks it, in the order colour, shape, count, fill: "Two are striped and one is solid."
A feature breaks a trio when exactly two of the three cards share it.

A card a hint marks, on your own or in a room, is ringed in lime with a Hint tag, and the turn bar says what is marked and what is left to find: "One card of a trio is marked, find the two that go with it".

The table never moves while you look.
On a narrow screen the turn bar sits above it, so the bar keeps one height through every phase: a clock is always in its top row, and it keeps room for two lines of what it says, the most any phase needs (three on the narrowest phones).

## On your own

A **run** is **ten trios** against one clock, with no name, no room and no server: it runs in the browser.
Ten is about two minutes for somebody who knows the game and four for somebody learning it, about the length of a Make 24 run.

- Play solo, or a challenge link, deals the table and starts the **run time** at once; there is no start screen, so nobody studies the table before the clock runs.
  For the same reason the run time stops while **How to play** is open, and the table is put away behind it until it closes.
- **A trio** shows as found for a moment (0.6 s, off the clock), then three new cards are dealt into its places, and the next trio begins.
- **Not a trio:** the three cards show as wrong for a moment (0.6 s) and are put back, and **5 seconds** go on the clock.
  Why they were not a trio stays in the turn bar until the next pick or hint, so it can be read after the cards go back.
  A wrong pick costs time, never a trio, so a run always ends at ten.
- **Hint** marks one card of a trio on the table, and **10 seconds** go on the clock.
  A second hint marks a second card of the same trio, for 10 more; after that the third card is yours to find, and Hint is not offered, though its place under the table is kept so the table never moves.
  Hints are cleared when a trio is taken.
- After the tenth trio the last table stays, and beside it (under it on a phone): the run time, the wrong picks and hints with what they cost, the fastest trio, and every trio you found with its time.
- **Leave** goes to the game's page; once a trio is found, any way out asks first, since the run's time is not kept.
  The run time stops while it asks, and the table is put away, so staying costs nothing.
- **The quicker run time is better.**
  The best is kept **on this device** (in `localStorage`), with the best of each of the last few days, as Make 24 keeps them.

**Challenge a friend**, beside a finished game, has one button, **Copy challenge link**, which copies a link to the same deal (`/games/trios/solo?seed=k3f9x2`).
Whoever opens it gets the same first table and the same deck, and can compare times.
A run without a link gets a new seed, and Play again starts another.

## In a room

The room owner picks, when creating the room, **10 or 20 trios** a game and 2–8 seats.
A game of 10 is about three minutes; one of 20, about six.
At the start of a game the server shuffles a new deck and deals the table.

There are no turns: everybody looks at the same table at the same time.

| Phase       | Wire name | Length | What happens                                                                        |
| ----------- | --------- | ------ | ----------------------------------------------------------------------------------- |
| **Finding** | `finding` | -      | Everybody looks for a trio; the first trio claimed is taken.                        |
| **Taken**   | `taken`   | 2s     | The trio stays on the table for everybody, marked with who took it; then new cards. |

Between games the room is in `waiting`.

### A claim

A player's third pick sends their three cards to the server as one **claim** (`trios:claim`).
The server takes claims in the order they arrive:

- **A trio**, with all three cards still on the table: the claimant takes it, **+1**.
  The room goes to `taken` for 2 seconds: the three cards stay where they are, outlined in green and tagged with the finder's initials, and the turn bar says who found them, so everybody sees what was taken and by whom.
  Then three new cards are dealt into their places and the room goes back to `finding`.
- **Not a trio:** nothing is taken, and the claimant is **locked out for 3 seconds**: their three cards show as wrong on their own screen, and they cannot pick until the lockout ends.
  Nobody else is told.
  In a race, 3 seconds is enough to make guessing a bad idea.
- **Too late:** a claim with a card no longer on the table, or one that arrives during `taken`, lost a race rather than made a mistake.
  It is dropped, with no lockout.

The score is the trios you found, never anything less: a wrong claim costs time, not a trio.

When somebody else takes a trio, any of your picked cards that were in it leave your selection, and the rest stay picked.
During `taken` nobody can pick, but your picks stay shown, so you see what is still picked when the new cards come.

### Hints

A table nobody can crack would stall the room, so the server breaks a long silence:

- **30 seconds** after the table last changed with no trio found, one card of a trio on the table is marked for everybody.
- **30 seconds** after that, a second card of the same trio.

The turn bar counts down to the next hint, so a room's clock means something without ending anything.
After the second hint it counts up instead: how long the table has gone without a trio.
A hint is help, not a deadline, so neither clock ever turns urgent.
A hint is the same for everybody, so it changes nobody's chances; hints are cleared when a trio is taken.

### The end

A game ends when its 10 or 20 trios have been found, after the last one's 2 seconds, and the room reopens for a new one.
The finished table stays under the results until the next game is dealt.
**The winner is whoever found the most trios.**
Players who share the top score share the win, and the results rank a shared score in one place (1, 1, 3).

The chat says when somebody finds a trio ("Maya found a trio! (+1)"), as a quiet score line, and who won.

## Rules the server enforces

- **The deck is the server's.**
  A client is sent the twelve cards on the table and how many are left in the deck, never the deck's order or where the table's trios are.
  The table itself is public, so a program could find its trios; that is true of any game played face up.
- **The server decides every claim:** that the game is in `finding`, that the claimant is seated, connected and not locked out, that the three cards are different and all on the table, and that they are a trio.
- **The first trio to reach the server wins it.**
  Claims are handled one at a time, and a trio changes the table before the next claim is read.
- **The clock, the lockouts, the hints and the score are the server's.**
- **Claims are rate-limited** like every event, so a flood of them is dropped before it is judged.
- **Only the room owner may start a game**, and only with two or more players.

## Leaving, dropping and coming back

A dropped connection keeps your seat and your trios for 30 seconds, as in every room here.
Nobody waits for anybody: the table stays in play for those still connected.
Your picks live only in the page, so a refresh puts them back; a lockout outlives a refresh, because it is the server's.

If the room falls below two players the game ends, and its summary says it ended early.

## What a client is sent

Every change reaches a player as `room:state`, the whole room as that player may see it ([the wire contract](../architecture.md#the-wire-contract)).

| Field         | What it is                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| `phase`       | `waiting`, `finding` or `taken`                                                                                 |
| `trios`       | How many trios a game has: 10 or 20                                                                             |
| `found`       | How many trios have been found this game                                                                        |
| `table`       | The twelve cards in their places, row by row; between games, the last table as it ended; empty before the first |
| `deckLeft`    | How many cards are left in the deck                                                                             |
| `lastTrio`    | The latest trio taken this game: who took it, its three cards and the places they were in; `null` before one    |
| `hint`        | The places the hints have marked, in order: none, one or two                                                    |
| `searchingMs` | How long the table in play has gone without a trio, during `finding`; 0 otherwise                               |
| `lockedOutMs` | How long this player is still locked out; 0 when they are not                                                   |
| `myMiss`      | This player's three cards that were not a trio, while the lockout lasts; empty otherwise                        |
| `lastGame`    | The summary of the last finished game, until the next one starts                                                |

During `taken`, `phaseEndsInMs` is what is left of the 2 seconds; during `finding`, the time to the next hint, or 0 once both have been given, when the turn bar counts `searchingMs` up instead.
`lastTrio` stays after the table is refilled, so a player who looked away can still see what was taken.

Trios' one event of its own is `trios:claim`, with the room and the three cards.

## Configuration

| Variable                  | Default | Purpose                                         |
| ------------------------- | ------- | ----------------------------------------------- |
| `TRIOS_TAKEN_SECONDS`     | `2`     | How long a taken trio stays on the table        |
| `TRIOS_LOCKOUT_SECONDS`   | `3`     | How long a wrong claim locks its player out     |
| `TRIOS_HINT_SECONDS`      | `30`    | How long a table goes without a trio for a hint |
| `RECONNECT_GRACE_SECONDS` | `30`    | How long a dropped player keeps their seat      |

## Where the code lives

| File                                                         | Responsibility                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| [`shared/trios.ts`](../../shared/trios.ts)                   | Cards, their features, what a trio is, the deal: the rules both sides run |
| [`module.ts`](../../server/socket/trios/module.ts)           | What the room layer calls, and all it calls                               |
| [`game-engine.ts`](../../server/socket/trios/game-engine.ts) | Claims, lockouts, hints, the refill and the score                         |
| [`state.ts`](../../server/socket/trios/state.ts)             | The game's state, and the snapshot each player is sent                    |
| [`trios/solo/`](../../client/src/trios/solo/)                | A run on your own                                                         |
| [`trios/room.tsx`](../../client/src/trios/room.tsx)          | A room's screens                                                          |

The rules are covered by [`trios-rules.test.ts`](../../server/tests/trios-rules.test.ts) and [`trios-flow.test.ts`](../../server/tests/trios-flow.test.ts), and a room's race and a run on your own by [`e2e/trios.spec.ts`](../../e2e/trios.spec.ts).
The screens are TS01-TS12 in [the Figma file](../design.md).
