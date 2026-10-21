# Pairs

A memory game: every card lies face down, two are turned over at a time, and two that match are a pair.
On your own it is one board in as few turns as you can; in a room players take turns, and whoever finds the most pairs wins.

Solo, or 2–6 players on a Small or Large board.

---

## A board

| Board     | Cards | Pairs |
| --------- | ----- | ----- |
| **Small** | 4 × 4 | 8     |
| **Large** | 6 × 6 | 18    |

Each pair is one of 18 **symbols**: nine shapes in two colours each (`Zumpo/Pairs symbol` in Figma).
A Large board uses all 18; a Small board draws 8 of them.
The cards are shuffled, and a deck is dealt from a seed alone, so a seed and a board always deal the same deck.

A **turn** is two cards turned over:

1. Turn over a card.
2. Turn over a second one.
   If the two show the same symbol, they are a **pair**: they stay face up, faded, where they lie, and the board keeps its shape.
   If not, both stay up for a moment for everybody to remember, then turn back face down.

A card already face up, matched or not, cannot be turned over again.
The game ends when every pair is found.

## On your own

A game on your own needs no name, no room and no server: it runs in the browser.

- Play solo starts a board at once: the last one played, or Small on a first visit.
  **Change board**, beside Play again when a board is cleared, picks another (PR01).
- The **run time** starts with the first card turned and stops with the last pair.
  It also stops while **How to play** is open, and the cards are put away behind it until it closes; a miss stays up until then too.
- Two cards that do not match turn back after **1 second**, or at once when you turn over another card.
- **Turns** count every two cards turned over, pairs included.
- After the last pair the cleared board stays, and beside it (over it on one column, so Play again is in sight): the turns, the time, the longest streak of pairs found in a row, and the best on this device for each board, with Play again and Change board, then Challenge a friend.
- **Leave** goes to the game's page at once: a board is a minute or two to play again.
- **Fewer turns is better; for the same turns, the quicker time is.**
  The best for each board is kept **on this device** (in `localStorage`).

**Challenge a friend**, beside a finished game, has one button, **Copy challenge link**, which copies a link to the same deck (`/games/pairs/solo?board=Large&seed=k3f9x2`).
Whoever opens it plays exactly that deck and can compare turns.
A game without a link gets a new seed, and Play again starts another.

## In a room

The room owner picks the board when creating the room, and 2–6 seats.
At the start of a game the deck is shuffled and the players are put in a random order, kept for the game.

| Phase        | Wire name  | Length | What happens                                               |
| ------------ | ---------- | ------ | ---------------------------------------------------------- |
| **Flipping** | `flipping` | 10s    | The player whose turn it is turns over two cards.          |
| **Showing**  | `showing`  | 2s     | Two cards that did not match stay up for everybody to see. |

Between games the room is in `waiting`.

- **A pair** is the finder's: **+1**, and they go again, with a fresh 10 seconds.
- **Not a pair:** both cards stay up for everybody for 2 seconds, then turn back, and the turn passes to the next player.
- **Out of time:** a card turned over alone turns back, and the turn passes on.
- **A player who is not connected** when their turn comes is skipped.

When the last pair is found the game ends, and the room reopens for a new one.
The finished board stays on the table under the results until the next game is dealt.
**The winner is whoever found the most pairs.**
Players who share the top score share the win, and the results rank a shared score in one place (1, 1, 3).

The chat says when somebody finds a pair ("Maya found a pair! (+1)"), as a quiet score line, and who won.

## Rules the server enforces

- **The deck is the server's.**
  A client is sent the symbol of a card only while it is face up or matched; where the others lie is never sent.
- **Only the player whose turn it is may turn a card over,** and only during `flipping`, two cards a turn.
- **The clock and the score are the server's.**
- **Only the room owner may start a game**, and only with two or more players.

## Leaving, dropping and coming back

A dropped connection keeps your seat and your pairs for 30 seconds, as in every room here.
Your turn does not wait for you: its 10 seconds keep running, which is long enough for a refresh.
A turn that comes round while you are away is skipped.

If the room falls below two players the game ends, and its summary says it ended early.

## What a client is sent

Every change reaches a player as `room:state`, the whole room as that player may see it ([the wire contract](../architecture.md#the-wire-contract)).

| Field          | What it is                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `board`        | `Small` or `Large`                                                                                                   |
| `phase`        | `waiting`, `flipping` or `showing`                                                                                   |
| `cards`        | Every card in place: down, up or matched, with its symbol only when shown; between games, the last board as it ended |
| `pairsFound`   | How many pairs have been found this game                                                                             |
| `turnPlayerId` | Whose turn it is; `null` between games                                                                               |
| `nextPlayerId` | Whose turn comes next, skipping anybody not connected; `null` between games                                          |
| `lastMiss`     | The two cards that just did not match, while they show                                                               |
| `lastGame`     | The summary of the last finished game, until the next one starts                                                     |

Pairs' one event of its own is `pairs:flip`, with the room and the card's place.

## Configuration

| Variable                  | Default | Purpose                                    |
| ------------------------- | ------- | ------------------------------------------ |
| `PAIRS_TURN_SECONDS`      | `10`    | How long a player has to turn over two     |
| `PAIRS_SHOW_SECONDS`      | `2`     | How long two cards that did not match show |
| `RECONNECT_GRACE_SECONDS` | `30`    | How long a dropped player keeps their seat |

## Where the code lives

| File                                                         | Responsibility                                         |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| [`shared/pairs.ts`](../../shared/pairs.ts)                   | Boards and the deal: the rules both sides run          |
| [`module.ts`](../../server/socket/pairs/module.ts)           | What the room layer calls, and all it calls            |
| [`game-engine.ts`](../../server/socket/pairs/game-engine.ts) | Turns, flips and scores                                |
| [`state.ts`](../../server/socket/pairs/state.ts)             | The game's state, and the snapshot each player is sent |
| [`pairs/solo/`](../../client/src/pairs/solo/)                | A game on your own                                     |
| [`pairs/room.tsx`](../../client/src/pairs/room.tsx)          | A room's screens                                       |

The rules are covered by [`pairs-rules.test.ts`](../../server/tests/pairs-rules.test.ts) and [`pairs-flow.test.ts`](../../server/tests/pairs-flow.test.ts).
The screens are PR01-PR10 in [the Figma file](../design.md).
