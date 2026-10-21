# Snap

Round cards with six symbols each, and any two of them share exactly **one** symbol.
Your card and the middle card share one too: spot it, tap it, and the middle card is yours.
On your own it is thirty cards against the clock; in a room everybody races for the same middle card, and whoever takes the most wins.

Solo, or 2–6 players with the 31-card deck.

The game is in the style of Spot It and Dobble, names that belong to others; Snap is the old card game's plain name, and in Chinese it is 找相同.

---

## The deck

There are **31 cards** and **31 symbols**; every card shows **6 symbols**, and every symbol is on 6 cards.
**Any two cards share exactly one symbol**, never none and never two.

The deck is the finite projective plane of order 5: the symbols are its 31 points and the cards its 31 lines, and two lines always meet in exactly one point.
In numbers, with arithmetic mod 5:

- The points are the 25 pairs (x, y), numbered 5x + y; the 5 slopes m, numbered 25 + m; and one more, infinity, numbered 30.
- The lines are y = mx + b with its slope m (25 cards, numbered 5m + b); x = c with infinity (5 cards, numbered 25 + c); and the line of the slopes and infinity (card 30).

Order 7 (57 cards of 8 symbols) is the classic deck, but eight symbols on a phone-sized card are too small to tell apart at a glance, and 57 cards make a game of eight minutes; order 5 keeps a game near two.

### The symbols

Each symbol is one of the 31 variants of `Zumpo/Snap symbol` in Figma, a flat shape in one of the brush colours (`color/brush/*`).
No two symbols share a shape, so colour alone never tells two apart, for colour-blind players too; the first nine are the Pairs symbols.

| #   | Symbol   | Colour | #   | Symbol   | Colour |
| --- | -------- | ------ | --- | -------- | ------ |
| 0   | Circle   | coral  | 16  | Bolt     | sun    |
| 1   | Ring     | sky    | 17  | Arrow    | ink    |
| 2   | Half     | sun    | 18  | House    | brown  |
| 3   | Square   | leaf   | 19  | Fish     | orange |
| 4   | Diamond  | violet | 20  | Bow      | coral  |
| 5   | Triangle | green  | 21  | Tree     | green  |
| 6   | Star     | orange | 22  | Mushroom | red    |
| 7   | Sparkle  | red    | 23  | Bell     | orange |
| 8   | Hexagon  | brown  | 24  | Clover   | leaf   |
| 9   | Heart    | red    | 25  | Note     | ink    |
| 10  | Moon     | sun    | 26  | Eye      | ink    |
| 11  | Plus     | coral  | 27  | Crown    | sun    |
| 12  | Drop     | sky    | 28  | Pill     | leaf   |
| 13  | Cloud    | sky    | 29  | Ghost    | violet |
| 14  | Leaf     | green  | 30  | Cup      | brown  |
| 15  | Flower   | violet |     |          |        |

A symbol's name is its accessible label and what the turn bar calls it: "The heart was on both cards".

### A card

A card is a paper circle (`Zumpo/Snap card`) with six **spots** (`Zumpo/Snap spot`), each holding one symbol at 80% of the spot:

- Spot 1 in the centre, 30% of the card's diameter across.
- Spots 2–6 around it, 24% across, their centres 34% of the diameter from the card's centre, at −90° + 72° × k clockwise from the top.

The card comes in three sizes: **Regular** (320 px) on a desktop, **Compact** (224 px) on a phone, and **Mini** (72 px) in the game's artwork.
Its states are **Default**, **Taken** (a thick green outline and the taker's initials on a badge) and **Locked** (its symbols faded while you are locked out).
A spot is marked **Match** (lime, outlined in green), **Miss** (peach, outlined in red) or **Dim**.

### The deal

A deal (`dealDeck` in `shared/snap.ts`) shuffles three times, from the random source it is given:

1. The 31 symbols are shuffled onto the plane's 31 points, so which symbols meet is new every game.
2. The 31 cards are shuffled into the order they are dealt and turned.
3. Each card's six symbols are shuffled into its six spots, so the shared symbol is as likely in the centre as anywhere.

A run on your own deals from a seed (`shared/seed.ts`), so a challenge link deals the same deck.
A room deals from `Math.random` on the server, since nobody replays a room's deck.

## Spotting

Your card and the middle card share exactly one symbol, the **match**.
Tap it on either card: the symbol is what counts, not which card you tapped it on.

- **The match** is marked on both cards.
- **A symbol on only one of the two cards** is not a match: it is marked as a miss where you tapped it, and the turn bar says which card it is on ("The fish is only on your card").

Nothing else can be tapped, so there is no symbol on neither card to tap.
There are no hints: there is always exactly one match, and a card is never stuck.

## On your own

A **run** is **thirty cards** against one clock, with no name, no room and no server: it runs in the browser.
You start with one card; the other thirty come up as the middle card one at a time.
Thirty is about a minute and a half for somebody quick, and three minutes for somebody learning.

- The start screen shows the run and your best; the cards are dealt and the **run time** starts on Start, so nobody studies the first card before the clock runs.
  For the same reason the run time stops while **How to play** is open, and the cards are put away behind it until it closes.
- **A match** shows on both cards for a moment (0.5 s, off the clock); then the middle card becomes your card, and the next card comes up.
- **Not a match:** the symbol shows as wrong for a moment (0.6 s), and **3 seconds** go on the clock.
  Guessing among six symbols costs about 7.5 seconds a card, so looking is always faster.
- After the thirtieth card: the run time, the wrong taps with what they cost, the fastest card and the slowest card.
- **The quicker run time is better.**
  The best is kept **on this device** (in `localStorage`), with the best of each of the last few days, as Trios keeps them.

**Challenge a friend** copies a link to the same deck (`/games/snap/solo?seed=k3f9x2`).
Whoever opens it gets the same cards in the same order, and can compare times.
A run without a link gets a new seed, and Play again starts another.

## In a room

The room owner picks 2–6 seats when creating the room; there is nothing else to choose, and the lobby shows "31 cards".
At the start of a game the server shuffles a new deck, deals **one card face up to each player**, and turns the next one up as the **middle card**.
The rest are the pile.

There are no turns: everybody looks at the same middle card at the same time, each with their own card.
A game is **31 − players** cards (27 with four players), about two minutes.

| Phase       | Wire name | Length | What happens                                                                        |
| ----------- | --------- | ------ | ----------------------------------------------------------------------------------- |
| **Finding** | `finding` | -      | Everybody looks for their match with the middle card; the first right tap takes it. |
| **Taken**   | `taken`   | 1.5s   | The middle card stays for everybody, marked with who took it and the match.         |

Between games the room is in `waiting`.

### A claim

A tap sends the symbol to the server as a **claim** (`snap:claim`), with the number of the middle card it was meant for.
The server takes claims in the order they arrive:

- **A match**, on the claimant's card and the middle card in play: the claimant takes the middle card, **+1**.
  The room goes to `taken` for 1.5 seconds: the middle card is outlined in green and tagged with the taker's initials, the match is marked on it, and the turn bar says who took it and which symbol it was.
  Then the middle card becomes the taker's card, the next card of the pile is turned up, and the room goes back to `finding`.
- **Not a match**, a symbol on only one of the two cards: nothing is taken, and the claimant is **locked out for 2 seconds**: their card fades, the symbol shows as a miss where they tapped it, and they cannot tap until the lockout ends.
  Nobody else is told.
  A lockout runs on its own clock, and goes on through a card taken by somebody else.
  Once the next card is up, the miss no longer shows, since it was about the last card; the player still waits out the lockout.
- **Too late:** a claim for a middle card that is no longer in play, or one that arrives during `taken`, lost a race rather than made a mistake.
  It is dropped, with no lockout.
- **Nonsense:** a symbol on neither card cannot be tapped, so a claim with one is a broken client's, and is dropped.

The score is the cards you took, never anything less: a wrong tap costs time, not a card.

Everybody's card changes only when they take the middle card, so the one you are looking at never changes under you; somebody else taking the middle card changes only the middle card.

### The clock

The turn bar counts up how long the middle card has been out ("00:04 on this card").
It is not a deadline, so it never turns urgent; a lockout's 2 seconds count down instead.

### The end

A game ends when the pile runs out: after the last middle card is taken, and its 1.5 seconds, the room reopens for a new game.
The last middle card stays under the results, with its taker, until the next game is dealt.
**The winner is whoever took the most cards.**
Players who share the top score share the win, and the results rank a shared score in one place (1, 1, 3).

The chat says when somebody takes a card ("Leo took a card! (+1)"), how many cards a game has when it starts, and who won.

## Rules the server enforces

- **The deck is the server's.**
  A player is sent their own card and the middle card, never the pile's order or anybody else's card.
  Two cards always share one symbol, so a program could find the match; that is true of any game played face up.
- **The server decides every claim:** that the game is in `finding`, that the claimant is seated, connected and not locked out, that the claim is for the middle card in play, and that the symbol is on both cards.
- **The first match to reach the server wins the card.**
  Claims are handled one at a time, and a take ends `finding` before the next claim is read.
- **The clocks, the lockouts and the score are the server's.**
- **Claims are rate-limited** like every event, so a flood of them is dropped before it is judged.
- **Only the room owner may start a game**, and only with two or more players.

## Leaving, dropping and coming back

A dropped connection keeps your seat, your card and your cards won for 30 seconds, as in every room here.
Nobody waits for anybody: the middle card stays in play for those still connected.
A lockout outlives a refresh, because it is the server's.

A player who leaves for good takes their card out of play, and the game goes on with the middle card for the rest.
If the room falls below two players the game ends, and its summary says it ended early.

**Spectators**, who came in after the game started, see the middle card, the scores and the chat, and are sent no card of their own; they can take a seat for the next game.

## What a client is sent

Every change reaches a player as `room:state`, the whole room as that player may see it ([the wire contract](../architecture.md#the-wire-contract)).

| Field         | What it is                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phase`       | `waiting`, `finding` or `taken`                                                                                                                      |
| `cards`       | How many cards there are to take this game: 31 less the players dealt in; 0 before the first game                                                    |
| `taken`       | How many cards have been taken this game                                                                                                             |
| `middle`      | The middle card: its number in the game, from 0, and its six symbols in spot order; `null` before the first game                                     |
| `myCard`      | This player's own card, its six symbols in spot order; `null` for a spectator or before the first game                                               |
| `lastTake`    | The latest card taken this game: who took it, its number and the match; `null` before one                                                            |
| `cardMs`      | How long the middle card has been in play, during `finding`; 0 otherwise                                                                             |
| `lockedOutMs` | How long this player is still locked out; 0 when they are not                                                                                        |
| `myMiss`      | While the lockout lasts and its middle card is in play, the symbol that was not a match and the card it is on (`mine` or `middle`); `null` otherwise |
| `lastGame`    | The summary of the last finished game, until the next one starts                                                                                     |

"18 left" above the middle card is `cards − taken`: the cards still to take, the middle card among them.
During `taken`, `phaseEndsInMs` is what is left of the 1.5 seconds.
Between games, `middle` and `lastTake` stay as the game ended, so the last card stays under the results.

Snap's one event of its own is `snap:claim`, with the room, the middle card's number and the symbol.

## Configuration

| Variable                  | Default | Purpose                                     |
| ------------------------- | ------- | ------------------------------------------- |
| `SNAP_TAKEN_SECONDS`      | `1.5`   | How long a taken middle card stays in play  |
| `SNAP_LOCKOUT_SECONDS`    | `2`     | How long a wrong claim locks its player out |
| `RECONNECT_GRACE_SECONDS` | `30`    | How long a dropped player keeps their seat  |

## Where the code lives

| File                                                                          | Responsibility                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`shared/snap.ts`](../../shared/snap.ts)                                      | The plane, the symbols, the deal and the match: what both sides run |
| [`module.ts`](../../server/socket/snap/module.ts)                             | What the room layer calls, and all it calls                         |
| [`game-engine.ts`](../../server/socket/snap/game-engine.ts)                   | Claims, lockouts, taking a card, turning the next and the score     |
| [`state.ts`](../../server/socket/snap/state.ts)                               | The game's state, and the snapshot each player is sent              |
| [`snap/solo/`](../../client/src/snap/solo/)                                   | A run on your own                                                   |
| [`snap/room.tsx`](../../client/src/snap/room.tsx)                             | A room's screens                                                    |
| [`ui/components/snap-card.tsx`](../../client/src/ui/components/snap-card.tsx) | `Zumpo/Snap card`, its spots and symbols                            |

The rules are covered by [`snap-rules.test.ts`](../../server/tests/snap-rules.test.ts) and [`snap-flow.test.ts`](../../server/tests/snap-flow.test.ts), and a room's race and a run on your own by [`e2e/snap.spec.ts`](../../e2e/snap.spec.ts).
The screens are SN01-SN14 in [the Figma file](../design.md).
