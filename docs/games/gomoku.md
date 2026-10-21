# Gomoku

Two players take turns placing stones on a grid, black then white, and the first to make an unbroken line of five wins.
On your own it is you against the computer, at three levels; in a room it is two friends at one board, with anybody else watching.

Solo against the computer, or 2 players and up to five spectators.
Its kind is **Strategy**, a new kind that says "Think a few moves ahead." and comes last on the home page, as kinds sort by name; its tone is blue.

---

## The board

The board is **15 × 15 lines**, and a stone sits on a **point** where two lines cross, as on a Go board.
That is 225 points, and the standard size for Gomoku: big enough that the edges rarely matter, small enough to draw at 22 px a point on a 390 px phone.

- Columns are lettered **A to O** from the left, and rows numbered **1 to 15** from the bottom, so the centre point is **H8**.
  The letters are not drawn; they name a point for a screen reader and in the code.
- Five points are marked with a small dot, the centre and the four points three lines in from each corner (D4, D12, L4, L12 and H8), so the eye can find its place on a big empty grid.
- A point is a number from 0 to 224, read row by row from the top left: `point = (15 - row) × 15 + column`, the column counted from 0 for A.

A stone, once placed, never moves and is never taken.

## A game

1. **Black moves first**, with a stone on any point, the centre included.
2. Then the players take turns, one stone a turn, on any empty point.
3. **Five or more in a row wins**: a line of at least five stones of one colour, side by side along a row, a column or either diagonal.
   The game ends on the move that makes it.
4. If all 225 points are filled and nobody has five, the game is a **draw**.

This is **freestyle** Gomoku: an overline of six or more wins too, and black has no forbidden moves.
Renju's restrictions on black (no double three, no double four, no overline) and the tournament openings that balance the first move are the part a newcomer cannot see coming: a move that looks fine is suddenly illegal.
Black's head start is real but small at this level, and rooms take turns at it instead (see [rematches](#a-rematch)).

The **winning line** is drawn through the five (or more) stones that made it, a coral bar from the first stone to the last, and every stone in it is ringed in coral.
One move can finish two lines at once; then both are drawn.

The **last stone placed** carries a small coral dot, so after a glance away you can see where the other player went.

### Nothing else to learn

There are no captures, no passes you can choose and no draw offers, and a room has no take-backs; only against the computer can you take a move back.
A player who sees the game is lost may **resign**, which asks first and gives the other player the win.
A game is about 20 to 40 stones each, and five to ten minutes in a room.

## On your own

A game on your own needs no room and no server: it runs in the browser, against the computer.

- Play solo starts a game at once with the last picks, or Medium, playing Black, on a first visit.
  **Change level**, beside Play again when a game ends, picks the **level**, Easy, Medium or Hard, and your **stones**, Black (you move first) or White (GM02).
- **Your turn waits for you**: there is no clock on your own.
- **Take back**, on your turn once you have a stone down, takes back your last stone and the computer's answer to it, as many times as you like, back to the start; Ryan approved it on 2026-10-21 so a newcomer can try again from the mistake.
  A finished game stays as it ended, and a game with take-backs counts like any other.
- The computer takes about half a second over each move, at least, so every stone can be seen landing, and the turn bar says it is thinking.
  On Black it opens on the centre point.
- After the game the board stays as it ended, with the winning line drawn, and beside it (under it on a phone) the result: who won and on which move, and your record at that level.
  **Play again** starts a new game at the same level, with the colours swapped, so black's head start alternates; **Change level** opens the picks over the finished board.
- Your **wins, losses and draws** at each level, and your current run of wins, are kept **on this device** (in `localStorage`).
  A game left unfinished does not count, and neither does one you resign; resigning is a room's way to save a friend's time, so solo has no Resign: you leave or play on.

There is no Challenge a friend: the computer answers what you play, so the same opening would not make the same game for a friend.
A room, made or joined from the game's page, is the way to play a friend.

### The computer

The computer reads the board the way people do, as lines of stones with open or blocked ends, and never searches the whole game:

- **Its candidate moves** are the empty points within two of any stone; on an empty board, the centre.
- **Each candidate is scored** by what it makes along each of the four directions through it, for itself (attack) and for you (defence): a five, an open four (both ends free: it cannot be stopped), a four (one end free), an open three, a three, an open two.
  The scores fall steeply, so that a five outweighs everything, an open four outweighs any number of threes, and two threats made at once (a four and an open three, or two open threes) count as nearly an open four.
  Defence is weighed a little below attack, so it would rather make its own four than block your three.
- **It always plays its own five, and always blocks a four of yours** that would be five next move, at every level.

The levels differ in how far they look and how often they slip:

| Level      | How it plays                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Easy**   | Scores its own attack alone, then picks at random among its four best moves. Of your threats it stops only a four, as every level does, so it lets most open threes through, and a newcomer wins by making one.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Medium** | Plays the best-scoring move, choosing at random among moves within a few percent of the best, so games do not repeat. It blocks open threes, but not a threat built two moves ahead.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Hard**   | Medium's scoring, then a search. First it looks for a forced win by fours (a run of fours you must answer, ending in five) up to eight of its own moves deep, and for yours, which it stops. Then it searches its twelve best moves, your best answers to each, its best answers to those, and so on, up to six stones ahead, weighing each position by the shapes of every stone on the board. It counts its work in positions looked at, so a move is the same on any machine, and stops at 800 ms in a Web Worker at most, so the page never freezes; where no worker runs, it stops at 50 ms. A game left while it thinks stops its search. |

Easy is meant to be beaten in a first few games, Medium by a player who has learned to make two threats at once, and Hard rarely.
The computer's code is the browser's alone (`client/src/gomoku/solo/`): `shared/` holds only the rules both sides run, and the server never plays for anybody.

## In a room

A Gomoku room has **two seats**, always: the create-room page has no seat count or other setting for it, so making a room is one click.
Up to five more people may watch from the [spectator seats](../architecture.md#the-room-layer), and between games anyone may move between the table and the spectator seats.

The game starts when the room owner starts it, with both seats taken.
The first game's colours are drawn at random; after that, see [rematches](#a-rematch).

| Phase       | Wire name | Length     | What happens                                |
| ----------- | --------- | ---------- | ------------------------------------------- |
| **Playing** | `playing` | 30s a move | The player whose turn it is places a stone. |

Between games the room is in `waiting`.

- **A stone** that makes no five passes the turn to the other player, with a fresh 30 seconds.
- **Five or more in a row** ends the game at once: the winning line is drawn, and the room reopens.
- **A full board** without five ends the game as a draw.
- **Resign** ends the game at once, as a win for the other player.
- **Out of time:** the turn passes to the other player with no stone placed, and the chat says so.
  A player who runs out of time on **two turns in a row** loses the game.

A lost turn is already a heavy price in Gomoku, which is why one is enough for a slip: a fresh player thinking too long is not thrown out of a game for it.
Placing a random stone for them, as Liar's Dice calls for a player, would be a move they never chose, and on this board a random stone is almost always a wasted one anyway.
Two in a row means the player is not there; the game ends within a minute instead of the other player waiting out a board of empty turns.

30 seconds is enough for any move a casual game needs and keeps a game short; a board of 40 stones is at most twenty minutes, and most moves take a few seconds.

When a game ends, the last board stays on the table under the result until the next game starts, with the winning line drawn and the last stone marked unless it is in that line.

### A rematch

The owner starts the next game from the result, as in every room.
**The colours swap every game**: whoever played White plays Black, so over two games each player has the first move once.
A player who moves to watch, or leaves, takes their turn at Black with them: a new pair starts on a fresh draw.

### Points and the scoreboard

A player's points are the **games they have won** in this room, which the scoreboard shows beside a stone of their colour this game.
A draw gives nobody a point.

The chat says who won and how ("Maya made five in a row.", "Leo resigned.", "Leo ran out of time twice; Maya wins.") and each lost turn ("Leo ran out of time.").
Everybody may chat at any time, spectators included.

### Spectators

A spectator sees the board, both players and their colours, the clock and the last stone, live, exactly as the players do, and nothing of a move before it is placed.
They cannot place a stone, and a Notice under the board says they can take a seat once the game ends, as in every room with spectators ([on purpose](../design.md#on-purpose)).

## Placing a stone

- **With a mouse**, hovering an empty point shows a faint stone of your colour there, and a click places it.
- **On a phone's touch screen** a point is only 22 px, so a tap could land on its neighbour: the first tap puts a faint stone there and shows **Place stone** under the board, and a second tap on the same point, or the button, places it.
  Tapping another point moves the faint stone.
- **With a keyboard**, the board is one control: the arrow keys move a focus ring between points, starting at the last stone or the centre, and Enter or Space places a stone.
  Each point's accessible label names it and what is on it ("H8, black stone"; "J9, empty").
- Nothing is shown on a point you cannot play, and while it is not your turn the board takes no input; a request in flight shows the stone faint until the server answers.

## Rules the server enforces

- **Only the player whose turn it is may place a stone,** and only during `playing`, one stone a turn, on an empty point from 0 to 224.
- **The win, the draw, the clock and the lost turns are the server's.**
  A client never says that a game is over; it is told.
- **Only a player at the table may resign,** and only during `playing`.
- **Only the room owner may start a game**, and only with both seats taken.
- **The colours are the server's:** drawn at random for a new pair, then swapped each game.

## Leaving, dropping and coming back

A dropped connection keeps your seat for 30 seconds, as in every room here.
Your turn does not wait for you, and the board is as you left it when you come back: the move clock keeps running, which is long enough for a refresh, and runs out as it would for anybody.

A player who leaves mid-game, or whose 30 seconds run out, **loses the game**, and the other player wins it, with a point.
With two seats there is nobody else to play on with; the result says the game ended because they left.
Between games, a player who leaves frees the seat for anybody, a spectator included, and the next pair starts on a fresh draw of colours.

A spectator who drops or leaves changes nothing.

## What a client is sent

Every change reaches a player as `room:state`, the whole room as that player may see it ([the wire contract](../architecture.md#the-wire-contract)).
Nothing in Gomoku is hidden, so every viewer, spectators included, is sent the same game.

| Field          | What it is                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `phase`        | `waiting` or `playing`                                                                                                                    |
| `colors`       | Who plays Black and who plays White this game (or the last, between games); `null` before the first                                       |
| `moves`        | This game's turns in order: the colour, and the point, or `null` for a turn lost to the clock; between games, the last game's             |
| `turnPlayerId` | Whose turn it is; `null` between games                                                                                                    |
| `missedTurns`  | Each player's lost turns in a row, 0 or 1 while a game is on, so the screen can warn that the next one loses; 2 after a game lost on time |
| `gameNumber`   | Which of this pair's games this is, or the last was, counted from 1 for each new pair; 0 before any                                       |
| `samePair`     | Whether the next game is this pair's next: both of the last game's players are at the table, and neither has left or moved to watch since |
| `winLines`     | When a game was won by five: the points of each winning line, in order along it; otherwise `null`                                         |
| `lastGame`     | The summary of the last finished game until the next one starts: the winner or a draw, how it ended, and how many stones                  |

How a game ended is one of `five`, `draw`, `resigned`, `timeout` (two turns in a row) and `left`.
The board itself is not sent: it is the `moves` played in order, so the last stone is the last of them.

Gomoku's two events of its own are `gomoku:place`, with the room and the point, and `gomoku:resign`, with the room.

## Configuration

| Variable                  | Default | Purpose                                    |
| ------------------------- | ------- | ------------------------------------------ |
| `GOMOKU_TURN_SECONDS`     | `30`    | How long a player has to place a stone     |
| `RECONNECT_GRACE_SECONDS` | `30`    | How long a dropped player keeps their seat |

## Where the code lives

| File                                                                  | Responsibility                                                                     |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`shared/gomoku.ts`](../../shared/gomoku.ts)                          | The board, points and their names, and finding five: the rules both sides run      |
| [`module.ts`](../../server/socket/gomoku/module.ts)                   | What the room layer calls, and all it calls                                        |
| [`game-engine.ts`](../../server/socket/gomoku/game-engine.ts)         | Turns, the clock, lost turns, colours, the win and the draw                        |
| [`state.ts`](../../server/socket/gomoku/state.ts)                     | The game's state, and the snapshot each viewer is sent                             |
| [`validation.ts`](../../server/socket/gomoku/validation.ts)           | Checking what a client sends before the engine sees it                             |
| [`gomoku/solo/`](../../client/src/gomoku/solo/)                       | A game on your own, the computer and its worker, and the record                    |
| [`gomoku-board.tsx`](../../client/src/ui/components/gomoku-board.tsx) | The board, the faint stone, the last stone, the win line and moving between points |
| [`stone.tsx`](../../client/src/ui/components/stone.tsx)               | A stone of either colour, faint, last placed or in the winning line                |
| [`gomoku-seat.tsx`](../../client/src/ui/components/gomoku-seat.tsx)   | A player's seat beside the board: stone, name, clock and what they are doing       |
| [`gomoku/table.tsx`](../../client/src/gomoku/table.tsx)               | The board and the seats together, side by side or one under the other              |
| [`gomoku/room.tsx`](../../client/src/gomoku/room.tsx)                 | A room's screens                                                                   |

The rules are covered by [`gomoku-rules.test.ts`](../../server/tests/gomoku-rules.test.ts) (five in every direction and along the edges, overlines, the full board) and [`gomoku-flow.test.ts`](../../server/tests/gomoku-flow.test.ts) (turns, seats, the clock, resigning, leaving and dropping mid-game, and spectators).
The computer is covered by [`computer.test.ts`](../../client/src/gomoku/solo/computer.test.ts): it plays a five, blocks a four, at Easy lets most open threes through, and at Hard finds a forced win by fours.
Whole seeded games there keep the levels in order: Medium beats Easy and Hard beats Medium, with either colour.
The screens are covered by [`room.test.tsx`](../../client/src/gomoku/room.test.tsx) and [`solo-page.test.tsx`](../../client/src/gomoku/solo/solo-page.test.tsx), and two players in a browser by [`gomoku.spec.ts`](../../e2e/gomoku.spec.ts).
The screens are GM01-GM21 in [the Figma file](../design.md), section 14: the game page (GM01, GM20), solo (GM02-GM06, GM17), a room (GM07-GM16, GM18, GM19) and every state a point can show (GM21).
Its pieces are in Shared pieces' Gomoku pieces: `Zumpo/Gomoku board` (Desktop: 36 px points, Phone: 22 px), `Zumpo/Stone` (32 px, or 18 px on a phone), `Zumpo/Last move marker`, `Zumpo/Win line`, `Zumpo/Point focus` and `Zumpo/Gomoku seat`.
Its artwork, card and intro are the Gomoku variants of `Zumpo/Game artwork`, `Zumpo/Game card` and `Zumpo/Game intro`, and its rules are in the How to play panel of its game page (GM01, GM20).
