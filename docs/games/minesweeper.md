# Minesweeper

Everybody plays the same minefield at once.
Each round you pick one cell, and what it pays is **exactly how dangerous it was**: a cell you could prove was safe is worth almost nothing, and a coin-flip you survive is worth a lot.

Hitting a mine costs you points.
It does not end the game, and it does not end anybody else's.

2–8 players, three board sizes, about 15 seconds a round.
Or play classic Minesweeper [on your own](#on-your-own), with flags and a clock.

---

## The game loop

A **round** is one window, the same for everyone:

1. **Pick** (`picking`), 15s: every player chooses one hidden cell.
   You cannot see what anybody else chose, only that they have chosen.
2. **Resolve**: all the picks are scored against the board _as it was when the round opened_, and only then are the cells uncovered.
3. **Reveal** (`reveal`), 4s: what everybody picked, what it risked and what it paid.

Between games the room is in `waiting`.
The pick window ends early the moment everybody has locked in.
When a round ends with a mine hit, the room is told in one quiet chat line for the round, `Round <n>: <name> hit a mine (−<points>).`, or `Round <n>: <name> (−<points>) and <name> (−<points>) hit mines.`

Rounds repeat until the board is resolved.
That always happens: every round uncovers at least one cell, so a finite board runs out.

## Winning and losing

**The winner is whoever has the most points when the board runs out.**
Players who share the top score share the win, and the results screen ranks a shared score in one place (1, 1, 3).
The game ends when nothing is left to pick (every safe cell uncovered, every mine found, or some of each), and the room announces `Game over: <name> wins with <n> points!`, or `Game over: <names> tie with <n> points!`.

**There is no lose condition.**
Hitting a mine costs points; it does not remove you, end the round, or end the game.
This is the single biggest departure from single-player Minesweeper, and it is deliberate: a shared board where one player's mistake ends everyone's game has a fatal exploit, because whoever is ahead wants to detonate on purpose and lock their lead in.

You can absolutely finish on a negative score.

## Scoring

Every cell has a **risk**: its probability of being a mine, worked out from what everybody can see, immediately before the round opens.

```
safe   →  +10 + 90 × risk
mine   →  −20 − 100 × (1 − risk)
```

So surviving a 50/50 pays 55, clearing a provably-safe cell pays 10, and clearing a cell that was 90% likely to kill you pays 91.

**The penalty is inverted: it grows as the risk falls.**
Detonating a cell you should have read as safe costs 120.
Detonating a forced coin-flip costs 70.
Detonating a cell the board had _proved_ was a mine costs only 20.
You are punished for how wrong you were, not for how unlucky, which is what stops the endgame, where the free cells run out and everybody must guess, from being a dice roll that decides the match.

Because the expected value falls as risk rises, playing safe is the better move and gambling is what you do when you are behind.
The leader consolidates; the trailer has to swing.

### Why risk, and not something simpler

Scoring by risk does three things at once:

- **It is verifiable.**
  Everyone could have computed it, from what everyone could see, before anybody clicked.
  The server works it out from the public board: it is not allowed to look at the mine layout, so it cannot score you on whether you were lucky.
- **Deduction pays indirectly.**
  Working out which cells are safe earns you nothing on its own; what it earns you is knowing which risks are cheap.
- **It makes turn order irrelevant.**
  The opening pick is maximum uncertainty and is worth the most.
  Later picks inherit the information earlier ones bought and are worth less.
  Nobody is disadvantaged by when they play.

### Two players, one cell

If several players pick the same cell they **share the reward, and each pays the full penalty**.

That asymmetry is on purpose.
The reward is for _claiming_ a cell, a finite thing, and three players claiming it have between them uncovered one cell's worth of board.
The penalty is for _the decision_, which is individually yours; splitting it too would let you hide in a crowd, and make piling onto a coin-flip cheaper than taking it alone.
As it stands, crowding a safe cell is mildly wasteful and crowding a risky one is punished, so players spread out.

### Running out of time

If the clock beats you, the server picks **the safest cell on the board** for you and you forfeit the +10 base, so an auto-play is never better than turning up, but a dropped connection does not wreck your game.
A player who is disconnected sits the round out entirely.

## How to play

1. Pick Minesweeper from the games, which opens its page.
2. **Create a room** (name, 2–8 seats, a board size, and an optional password) or join one of the open rooms listed under it.
3. The host (the crown in the player list) presses **Start game**.
   It needs at least two players.
4. Each round, **click one cell**.
   Your pick locks in at once; the player list shows **Locked in** beside everybody who has picked.
5. When the round resolves, every pick is marked on the board, and the results under it show each player's pick: what it risked, and what it paid.
6. Read the numbers the way you always have (a `3` has three mines among its eight neighbours) and pick again.

**The risk of a cell is not shown before you pick it.**
You are scored by the solver, not played for by it: working out which cells are safe is the game.
What you see afterwards is what your pick was actually worth.

## Board sizes

| Size       | Board   | Mines | Density | Roughly    |
| ---------- | ------- | ----- | ------- | ---------- |
| **Small**  | 9 × 9   | 10    | 12%     | 2 minutes  |
| **Medium** | 16 × 16 | 40    | 16%     | 8 minutes  |
| **Large**  | 30 × 16 | 99    | 21%     | 20 minutes |

Two single-player conventions are deliberately **not** used in rooms (a game [on your own](#on-your-own) keeps the first one):

- **No first-click safety.**
  That rule exists so an opening click cannot end the game, and here a mine ends nothing, so the reason for it is gone.
  Keeping it would also make the first pick's score a lie: the risk is computed from public information, which says the opening cell is exactly as dangerous as the board's density, and it would not have been.
- **No guaranteed-solvable boards.**
  Modern generators promise a board can be cleared without guessing.
  Here guessing _is_ the scoring mechanism, so a board that forces one is working as intended.

## On your own

Classic single-player Minesweeper on the same three boards, with no name, no room and no server: it runs in the browser.

1. Pick a board; the last one you played is picked for you.
2. Your **first click is always safe**, and so are its eight neighbours, so it always opens an area.
   The mines are laid only after that click, which is also when the clock starts.
3. Click a hidden cell to open it; opening a cell with no mines around it opens its neighbours too.
4. **Right-click or long-press** a hidden cell to plant a flag, and again to take it off.
   **Reveal / Flag** under the board switches what a plain click or tap does, for phones and trackpads.
   A flagged cell cannot be opened until its flag is taken off.
5. Click an opened number whose flags around it add up to that number to open all its other neighbours (a **chord**).
   If a flag was wrong, that opens a mine.
6. The turn bar shows the mines left (mines minus flags, which can go below zero) and the run time.
   The run time stops while **How to play** is open, and the board is put away behind it until it closes.

**Opening a mine loses.**
The mine you hit turns solid red, every other mine shows, flags with no mine under them are crossed out, the turn bar says how many of the safe cells you cleared, and Try again starts a new board of the same size.

**Opening every safe cell wins**, whatever is flagged; the mines left are flagged for you.
The time is shown and kept as the best for that board **on this device** (in `localStorage`) when it beats the last one.

There is no challenge link: the mines depend on where the first click lands, so two people could not play the same board.

The rules are covered by [`game.test.ts`](../../client/src/minesweeper/solo/game.test.ts), and the screens are MS01-MS05 in [the Figma file](../design.md).

## Rules the server enforces

- **One pick per player per round, and it is final.**
  You cannot watch who locks in and then change your mind: that is what keeps a simultaneous window honest.
- **Which cell you picked is never sent to anybody else**, only that you have picked.
  Publishing it would let a late chooser follow the crowd.
- **The mine layout never leaves the server.**
  A client only ever receives hidden, a number, or a mine somebody hit.
- **Every pick in a round is scored against the same board**: the one everybody could see when they chose.
  Cells are uncovered only after scoring, so a cell another player's cascade would have opened still pays what it was worth.
- **Only the host may start a game**, or while they are away the player next in line, and only with two or more players.
  Between games anybody else at the table may say Ready, which tells the starter who is ready; the starter still starts the next game ([the room layer](../architecture.md#the-room-layer)).
- **A cell that is already resolved cannot be picked**, and neither can a cell outside the board.

## Leaving, dropping and coming back

A dropped connection keeps your seat, score and the crown for 30 seconds, as in every room here.
There is no turn to hold, because a round belongs to everybody, so the only effect is that the room stops waiting for you: rounds resolve without your pick, and you score nothing until you are back.

A refresh does not hold the round either, decided by Ryan on 2026-10-20: if everyone else has locked in while you reload, the round resolves without your pick.
Otherwise a refresh loses nothing.
Reloading during the pick window brings back the open round and, if you had already picked, your own pick (`myPick`), so you are not asked again.
Reloading during the reveal brings back the reveal: the uncovered board and what the round came to.

If the room falls below two players the game ends, and its summary says it ended early.

## What a client is sent

Every change reaches a player as `room:state`, the whole room as that player may see it ([the wire contract](../architecture.md#the-wire-contract)).
Minesweeper has no other events of its own to send: the snapshot has it all.

| Field                 | What it is                                                                     |
| --------------------- | ------------------------------------------------------------------------------ |
| `phase`               | `waiting`, `picking` or `reveal`                                               |
| `round`               | Counts from 1 during a game; 0 between games                                   |
| `board`, `minesFound` | The public board: -1 hidden, 0-8 a number, 9 a mine somebody hit               |
| `lockedIn`            | Who has picked this round; empty outside the pick window                       |
| `myPick`              | Your own pick during the pick window, in your snapshot alone; otherwise `null` |
| `lastRound`           | Every pick of the last resolved round, with its risk and points                |
| `lastGame`            | The summary of the last finished game, until the next one starts               |

When a game ends the final board and its last round stay up, for the results screen and for a refresh.
The results screen shows the final board alone under the standings, which already count the last round, so its results are not repeated.
`lastGame` holds the standings best first, the board size, how many rounds were played (a round still open for picks when the game stopped does not count), and whether it ended early.

## Configuration

| Variable                     | Default | Purpose                                    |
| ---------------------------- | ------- | ------------------------------------------ |
| `MINESWEEPER_ROUND_SECONDS`  | `15`    | How long everybody has to pick             |
| `MINESWEEPER_REVEAL_SECONDS` | `4`     | How long the outcome stays up              |
| `RECONNECT_GRACE_SECONDS`    | `30`    | How long a dropped player keeps their seat |

## Where the code lives

Minesweeper is a **game module** on the generic room layer: seats, ownership, the reconnect grace, chat and the lobby are not its code.
See [the room layer](../architecture.md#the-room-layer).

| File                                                               | Responsibility                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------ |
| [`module.ts`](../../server/socket/minesweeper/module.ts)           | What the room layer calls, and all it calls            |
| [`game-engine.ts`](../../server/socket/minesweeper/game-engine.ts) | The round loop, and what a round resolves to           |
| [`probability.ts`](../../server/socket/minesweeper/probability.ts) | The exact solver: every score comes from it            |
| [`scoring.ts`](../../server/socket/minesweeper/scoring.ts)         | The payout curves, and why they are that shape         |
| [`board.ts`](../../server/socket/minesweeper/board.ts)             | The minefield, and the public view of it               |
| [`state.ts`](../../server/socket/minesweeper/state.ts)             | The game's state, and the snapshot each player is sent |

Its one event of its own is `ms:pick`.

### The solver

[`probability.ts`](../../server/socket/minesweeper/probability.ts) computes the true posterior, not an estimate.
Every revealed number constrains its hidden neighbours; the **frontier** (cells touching a number) splits into independent components, each component's satisfying assignments are enumerated by backtracking, and the **sea** (cells touching nothing) is folded in by weighting each frontier mine-count by `C(|sea|, remaining − t)`.

The counts are `bigint` because they genuinely overflow: `C(300, 99)` has 82 digits, and on a Large board a double would turn every score into `NaN`.

It matters that this is exact rather than a per-constraint heuristic.
The classic **1-2-1** pattern (three numbers reading 1, 2, 1 over three hidden cells) has exactly one solution, mine-safe-mine, and a local estimate puts the middle cell at 2/3 where the truth is 0.
Getting that wrong would not crash anything; it would just quietly pay people the wrong amount forever.
It is pinned down by [`minesweeper-probability.test.ts`](../../server/tests/minesweeper-probability.test.ts), including the invariant that the risks of all hidden cells must sum to the number of mines still out there, which they do, on hand-built boards and on real ones part-way through a game.
