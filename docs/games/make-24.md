# Make 24

Four numbers, four signs, one target: use each number once with plus, minus, times and divide to make 24.
On your own it is a run of ten hands against the clock; in a room everybody gets the same hand at the same time, and the quick score more.

Solo, or 2–8 players with 5 or 10 hands of 60 seconds each.

---

## A hand

A **hand** is four cards from 1 to 13, dealt smallest first.
Every hand can be solved: the deal draws again until it can.

You make 24 one step at a time:

1. Pick a card, then a sign (+ − × ÷), then another card.
2. The two cards become one new card in the first card's place, showing the result and, under it, the step that made it (`4`, with `8 − 4` under it).
3. Keep going until one card is left.
   If it is 24, the hand is **solved**.
   If not, the card says **Not 24**, and you can Undo a step or Start over.

Results can be fractions (`8/3`) or below zero, and are kept exact, so `(5 − 1 ÷ 5) × 5` is 24.
A division by zero is not allowed: a card worth 0 cannot be picked after ÷.

A keyboard plays a hand too, on your own and in a room, unless the chat has the focus: **1 to 4** pick a card by its place from the left, **+ − \* x /** pick a sign, **Backspace** undoes a step and **Esc** starts over.
A wide screen with a pointer says so in one line under the hand.
There is no wrong answer to be punished for, only a hand that is not solved yet: Undo and Start over are free.

A finished hand reads as one expression with only the brackets it needs, such as `(8 − 4) × (7 − 1)`.

## On your own

A **run** is ten hands, with no name, no room and no server: it runs in the browser.

- The **run time** counts up while a hand is in front of you, and stops for the moment between hands.
  It also stops while **How to play** is open, and the hand is put away behind it until it closes.
- **Skip** gives up a hand: one way to solve it shows, off the clock, until you press **Next hand** (T13), and 30 seconds are added to the run time.
  The way shown is the one a person would most likely write: whole numbers all along where possible, a 1 multiplied in last rather than mid-sum, then the shortest.
- A solved hand shows **24! Nice.** and the next one follows a moment later.
- After the tenth hand: the run time, how many hands were solved and skipped, the fastest solved hand, and every hand with how you solved it (or, for a skipped one, a way to).
- The best run time is kept **on this device** (in `localStorage`), with the best of each of the last few days.

**Challenge a friend** copies a link to the same ten hands (`/games/make-24/solo?seed=k3f9x2`).
A run is dealt from its seed alone, so whoever opens the link plays exactly those hands and can compare times.
A run without a link gets a new seed, and Play again starts another.

## In a room

A **game** is 5 or 10 hands, chosen when the room is created.
Every player gets the same hand at the same time and solves it on their own.

| Phase       | Wire name | Length | What happens                                        |
| ----------- | --------- | ------ | --------------------------------------------------- |
| **Solving** | `solving` | 60s    | Everybody works on the hand.                        |
| **Reveal**  | `reveal`  | 5s     | Every player's expression and points for that hand. |

Between games the room is in `waiting`.
A hand ends early once every connected player has solved it.
After the last hand's reveal the game ends, and the room reopens for a new one.

### Scoring

Solving a hand is worth **50 points for getting there at all, plus up to 100 more for how much of the 60 seconds is left**, as a correct guess is in Draw & Guess:

```
points = 50 + round(100 × seconds left / 60)
```

So a hand solved with 45 seconds left is worth 125, and one solved in the last second about 52.
A hand not solved is worth nothing, and nothing is ever taken away.

**The winner is whoever has the most points after the last hand.**
Players who share the top score share the win, and the results rank a shared score in one place (1, 1, 3).

## Rules the server enforces

- **The deal, the clock and the score are the server's.**
  The client sends the steps of a solution; the server replays them on the hand it dealt, and only steps that use every card once and end on 24 count.
- **What somebody else did is not shown while the hand is open.**
  Everybody can see who has solved it and for how many points, never how; an expression would give the hand away.
- **A player who has solved the hand cannot chat until it ends,** for the same reason.
- **One solve per player per hand**, and only while the hand is open.
- **Only the room owner may start a game**, and only with two or more players.

## Leaving, dropping and coming back

A dropped connection keeps your seat and score for 30 seconds, as in every room here.
The hand does not wait for you: it ends when everybody still connected has solved it, or when time runs out.

A refresh keeps a hand you already solved, with its points.
Steps you had taken towards a solution live only in the page, so a refresh mid-hand starts that hand over; the clock keeps running.

If the room falls below two players the game ends, and its summary says it ended early.

## What a client is sent

Every change reaches a player as `room:state`, the whole room as that player may see it ([the wire contract](../architecture.md#the-wire-contract)).

| Field          | What it is                                                                |
| -------------- | ------------------------------------------------------------------------- |
| `phase`        | `waiting`, `solving` or `reveal`                                          |
| `hands`        | How many hands a game has: 5 or 10                                        |
| `hand`         | The hand open or being revealed, from 1; 0 between games                  |
| `deal`         | The hand's four cards; empty between games                                |
| `solved`       | Who has solved the open hand, and for how many points; never how          |
| `mySolve`      | Your own solve of the open hand, with its expression, or `null`           |
| `lastHand`     | Every player's result for the latest finished hand, with their expression |
| `lastDeal`     | That hand's cards, still on the table after the game ends                 |
| `lastSolution` | One way to solve the latest finished hand, for when nobody did            |
| `lastGame`     | The summary of the last finished game, until the next one starts          |

Make 24's one event of its own is `t24:solve`, with the room and the steps.

## Configuration

| Variable                  | Default | Purpose                                    |
| ------------------------- | ------- | ------------------------------------------ |
| `MAKE24_HAND_SECONDS`     | `60`    | How long everybody has to solve a hand     |
| `MAKE24_REVEAL_SECONDS`   | `5`     | How long a hand's results stay up          |
| `RECONNECT_GRACE_SECONDS` | `30`    | How long a dropped player keeps their seat |

## Where the code lives

| File                                                           | Responsibility                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`shared/make-24.ts`](../../shared/make-24.ts)                 | Fractions, steps, the solver and the deal: the rules both sides run |
| [`module.ts`](../../server/socket/make-24/module.ts)           | What the room layer calls, and all it calls                         |
| [`game-engine.ts`](../../server/socket/make-24/game-engine.ts) | The hand loop, solves and scores                                    |
| [`state.ts`](../../server/socket/make-24/state.ts)             | The game's state, and the snapshot each player is sent              |
| [`make-24/solo/`](../../client/src/make-24/solo/)              | A run on your own                                                   |

The rules are covered by [`make-24-rules.test.ts`](../../server/tests/make-24-rules.test.ts) and [`make-24-flow.test.ts`](../../server/tests/make-24-flow.test.ts).
The screens are T01-T13 in [the Figma file](../design.md).
