# Code Breaker

Crack a hidden code of four different digits in ten guesses: after each guess, you are told how many of its digits are in the right place, and how many are in the code but somewhere else.
On your own it is one code a day, the same for everybody, with practice codes after it; in a room everybody races the same code at the same time, and fewer guesses score more.

Solo, or 2–8 players with 1 or 3 codes of 3 minutes each.

---

## The name

The classic game is called Bulls and Cows in English and 猜数字 (or 1A2B, after its marks) in Chinese.
Zumpo calls it **Code Breaker** in English and **猜数字** in Chinese, decided on 2026-10-20 by the session that designed it, with Ryan's delegation.
"Bulls and cows" is a farmyard joke that the game never shows and that many players have not heard of, while "Code Breaker" says what you do, reads at once on a game card, and sits beside Daily Word and Make 24 as a plain two-word name.
猜数字 is what Chinese players already call it.
Code uses `code-breaker` (the game type, folders and routes) and `cb:` (its events).

## A code

The **code** is four digits from 0 to 9, **all different**, and it may start with 0: 10 × 9 × 8 × 7 = **5,040 codes**.
A **guess** follows the same rule: four different digits.
You have **ten guesses**.

Four digits is the classic size: three are cracked by luck too often, and five make a round longer than a few minutes.
Different digits keep the marks simple to read, because each digit of a guess can match at most one digit of the code, and they are the rule players of 1A2B already know.
Ten guesses is generous on purpose: the best possible play never needs more than seven, a casual player without pen and paper usually needs six to nine, so a miss is rare but real, as with the ten rows of the board games this comes from.

After a guess, it gets a **mark**, two counts:

| Count      | Wire name | Means                               | Peg                |
| ---------- | --------- | ----------------------------------- | ------------------ |
| **Right**  | `right`   | A digit of the code, in this place  | A green square     |
| **Moved**  | `moved`   | A digit of the code, somewhere else | A coral circle     |
| **Not in** | none      | The rest of the guess's four digits | A flat grey square |

Exactly, for a guess against a code: `right` is the number of places where the two have the same digit, and `moved` is the number of digits they share, less `right`.
So against **4071**:

- **1234** is 0 right, 2 moved: the 1 and the 4 are in the code, both in other places.
- **5678** is 1 right, 0 moved: the 7 is in its place.
- **4170** is 2 right, 2 moved: 4 and 7 are in place, and 1 and 0 are swapped.
- **5689** is 0 right, 0 moved: none of these digits is in the code.

Three right and one moved cannot happen: if three digits are in place and the fourth is in the code, its place is the one left.
The code is **cracked** when a guess is 4 right.
Ten guesses without cracking it, and it is **missed**.

### Reading a mark

A mark is **four pegs beside the guess**, in a 2 × 2 square: first a green square for each right digit, then a coral circle for each moved one, then a grey square for each of the rest.
The pegs are always in that order and never line up with the digits, because a mark counts digits and never says which ones; the square cluster, as on the board games, keeps a player from reading the first peg as the first digit.
The shapes are Daily Word's: a square is in its place, a circle belongs elsewhere, a flat tile does not belong, so the marks read the same without colour.
A guess's accessible name says its digits and its mark ("4 1 7 0: 2 in place, 2 elsewhere").

Where there are no digits to sit beside, in the others' boards and the shared result, the four pegs stand in a row, in the same order.

The marks are the game's whole language: the board is digits and pegs, so the game plays the same in every language, and only the screens' own words are translated.

### Typing

A pad of the ten digits, with Enter and a delete key, and a physical keyboard's digit keys (top row and number pad) both type into the next empty tile; Enter submits and Backspace deletes.
A digit already in the row cannot be typed again: the key does nothing, and the tile that holds that digit gives a short nudge, so a repeated digit never reaches Enter.
In a room the physical keyboard types into the board unless the chat input has focus.

A guess that cannot be used is turned back with a short note, and costs nothing; the row stays as typed so it can be fixed.
The note sits where Daily Word's does: under the board on your own on a wide screen, and over the board, across the row under the one being fixed, on a phone and in a room.

- **Four digits, please**: Enter with fewer than four.
- **Already guessed**: the same four digits in the same order as an earlier row, which would only waste a guess.

### Notes

The pad's keys never colour themselves, unlike Daily Word's keyboard: a mark counts digits without naming them, so there is nothing certain to show, and working that out is the game.
Instead the player keeps their own **notes** on the pad.

- **Notes** is a toggle beside the pad.
  While it is on, a digit key, clicked, tapped or pressed, marks that digit instead of typing it, cycling **plain → out → in → plain**.
  Enter and delete still act on the row.
- An **out** digit's key is a flat grey key, as an absent letter is in Daily Word; an **in** digit's key is green.
  The notes show whether Notes is on or off, so they help while typing too, and a noted digit can still be typed.
- Notes are the player's own: the game never fills them in, checks them or corrects them.
- The only thing the game works out is what is **certain**: on your own, a desktop's turn bar says how many guesses are in and which digits the marks settle, "Three guesses in. 5, 6 and 8 are out." (CB03).
  A row with no pegs rules its four digits out; a row with four pegs, or six digits ruled out, settles every digit as in or out.
  Anything less than certain, which is most of the game, stays the player's to work out, and a phone's turn bar shows the peg legend instead.
- They are kept with the guesses for the daily code (on the device, so a refresh keeps them), and live only in the page for practice and in a room, where a new code clears them.

## On your own

A game on your own needs no name, no room and no server: it runs in the browser.

### The daily code

Everybody gets **the same code on the same calendar day**, and a new one at their own midnight.
The day is the device's **local date**, as in [Daily Word](daily-word.md#the-daily-word), for the same reason.

- The puzzle number counts days: **#1 is the day the game first goes live**, fixed as `FIRST_DAY` in `shared/code-breaker.ts` then and never moved.
  A device whose clock is before that plays #1.
- Puzzle _n_ is entry _n_ − 1 of the **code calendar**: all 5,040 codes in one fixed shuffled order, so a code comes back only after nearly fourteen years.
  The calendar is dealt by a seeded shuffle in `shared/code-breaker.ts` from a constant seed; a test pins its first entries, and neither the seed nor the shuffle ever changes once a day has been played.
- **One game a day.**
  Guesses and notes are kept on this device as they are made, so a refresh, a closed tab or another visit later that day continues the same game, and a finished game stays finished until midnight.
- There is no clock: it is not a race, and nothing is timed.

When the code is cracked or missed, the board stays, and beside it:

- **The result**: cracked in _n_, or missed, with the code.
- **Stats on this device**: games played, the share of them cracked, the current streak, the best streak, and how many were cracked in each number of guesses, with today's bar picked out.
  The bars are **1–4, 5, 6, 7, 8, 9 and 10**: four or fewer is rare enough to share one bar, and ten bars would be mostly empty.
- **Next code in**, a countdown to local midnight.
- **Share**, which copies a result with no digits in it, and **Practice code**.

A **streak** is daily codes cracked on consecutive days, counted as Daily Word counts its streaks.
Stats count finished games only, and are kept **on this device** (in `localStorage`) as one record of guesses per puzzle number, so they can always be worked out again from the records.

**Share** copies, for example:

```
Code Breaker #12 6/10

🟠🟠⬜⬜
🟩⬜⬜⬜
🟠🟠⬜⬜
🟩🟠🟠⬜
🟩🟩🟠🟠
🟩🟩🟩🟩
https://zumpo.ryangan.me/games/code-breaker/solo
```

The first line is the game, the puzzle number and the guesses used (`X/10` when missed).
Each row is a guess's mark as four pegs in the board's order: 🟩 right, 🟠 moved, ⬜ the rest, so a cracked code ends on a full green row.
In Chinese the first line reads `猜数字 #12 6/10`.
The link is the page's own origin, so a local or test build shares its own address.

### Practice codes

After the daily code, **Practice code** starts extra codes, one at a time, as many as you like.

- A practice code is dealt from a **seed**, like Daily Word's practice words: the seed alone picks one of the 5,040 codes.
- It plays exactly like the daily code, and keeps no stats and no streak.
- When it ends: cracked in _n_ or missed, with the code; **Another code** deals a new seed; **Challenge a friend** copies the result grid with a link to the same code (`/games/code-breaker/solo?seed=k3f9x2`); and **Today's code** goes back to the daily result.
- Whoever opens a challenge link plays that code straight away, whether or not they have played today's.
  A practice code lives only in the page: a refresh deals it again from the link's seed, and without a link goes back to today's result.

Practice is offered only after today's code, so the daily code stays the first thing on the page.

## In a room

The room owner picks **1 or 3 codes** when creating the room (3 by default), and 2–8 seats.
Every player gets the same hidden code at the same time and guesses on their own board.

| Phase        | Wire name  | Length | What happens                                                |
| ------------ | ---------- | ------ | ----------------------------------------------------------- |
| **Guessing** | `guessing` | 180s   | Everybody cracks the code, with ten guesses each.           |
| **Reveal**   | `reveal`   | 8s     | The code, every player's board with its digits, and points. |

Between games the room is in `waiting`.
A round ends early once every connected player has cracked the code or used all ten guesses.
After the last code's reveal the game ends, and the room reopens for a new one.

Three minutes is a little longer than Daily Word's two: a player who cracks a code takes about six guesses, each needing more thought than a word, so two minutes would end most rounds before most players finish.
One code is a three-minute game for a quick round; three, about ten minutes, let a lucky guess even out.

Each round's code is drawn at random from the 5,040, never twice in a game, and never the daily code of yesterday, today or tomorrow by the UTC date, which covers every time zone's today, so a room cannot spoil anybody's daily code.

**The race view.**
While a round runs, every player sees everybody else's board as marks only: each row's pegs, how many guesses they have made, and whether they have cracked the code or are out of guesses, never a digit.
This goes a step past a guess count on purpose: a mark without its digits tells nobody anything about the code, and watching a friend reach three greens is the race.
Your own board has your digits, your notes and the pad.
Once you have cracked the code or used your ten guesses, you watch the others' boards until the round ends.

### Scoring

Cracking the code is worth **100 points, plus 100 for every guess you had left over, plus up to 50 for how much of the 3 minutes is left**:

```
points = 100 × (11 − guesses) + round(50 × seconds left / 180)
```

Fewer guesses always win: the most the clock can add, 50, is half of one guess's 100, so standings go by fewest guesses, then time.
So a code cracked in 5 guesses with 120 seconds left is worth 600 + 33 = 633, in 6 with 64 seconds left 500 + 18 = 518, in 8 with 21 seconds left 300 + 6 = 306, and in 10 in the last second about 100.
Seconds left are measured to the millisecond when the server receives the guess.
A code not cracked is worth nothing, and nothing is ever taken away.

**The winner is whoever has the most points after the last code.**
Players who share the top score share the win, and the results rank a shared score in one place (1, 1, 3).
The results also say how many of the codes each player cracked.

The chat says when somebody cracks the code ("Maya cracked it in 5! (+633)"), what the code was at each reveal, and who won.

## Rules the server enforces

- **The code is the server's** until the reveal.
  It is not in any snapshot while the round runs, and another player's digits are never sent before the reveal: a client is sent only the marks of other players' rows.
- **A guess is checked on the server**: four different digits, not already guessed, during `guessing`, by a player who has neither cracked the code nor used ten guesses.
  The server marks it; the client never sends marks.
- **A player who has cracked the code cannot chat until the round ends,** because they could type it.
  A player who is out of guesses does not know the code and can talk.
  Leaving and coming back to watch does not open it early.
- **The deal, the clock and the score are the server's.**
- **Only the room owner may start a game**, and only with two or more players.

## Spectators

Spectators watch beside the table as in every room ([the room layer](../architecture.md#the-room-layer)).
They see what a player sees of the others: every board as marks only while the round runs, and every board with its digits at the reveal.
They never see the code before the reveal, so they may talk at any time.

## Leaving, dropping and coming back

A dropped connection keeps your seat, score and board for 30 seconds, as in every room here.
The round does not wait for you: it ends when everybody still connected is done, or when time runs out.

Guesses are server state, so a refresh keeps every row you submitted, with its marks.
Digits typed into a row but not submitted, and notes, live only in the page, and a refresh clears them; the clock keeps running.

If the room falls below two players the game ends, and its summary says it ended early.

## What a client is sent

Every change reaches a player as `room:state`, the whole room as that player may see it ([the wire contract](../architecture.md#the-wire-contract)).

| Field       | What it is                                                                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phase`     | `waiting`, `guessing` or `reveal`                                                                                                                    |
| `rounds`    | How many codes a game has: 1 or 3                                                                                                                    |
| `round`     | The code open or being revealed, from 1; 0 between games                                                                                             |
| `boards`    | Every player's board for the open round, in seat order: each row's mark, cracked or out of guesses, and points once cracked; digits only on your own |
| `lastRound` | The latest finished round: the code, and every player's board with its digits and points, best first                                                 |
| `lastGame`  | The summary of the last finished game, with how many codes each player cracked, until the next one starts                                            |

A mark on the wire is `{ right, moved }`.
Code Breaker's one event of its own is `cb:guess`, with the room and the four digits as a string, acknowledged: a guess the server refuses is answered `invalidRequest` with the reason, and an accepted one arrives in the next snapshot.
The client checks the digits before sending, so only a stale or modified client is refused in practice.

## Configuration

| Variable                      | Default | Purpose                                    |
| ----------------------------- | ------- | ------------------------------------------ |
| `CODE_BREAKER_ROUND_SECONDS`  | `180`   | How long everybody has to crack a code     |
| `CODE_BREAKER_REVEAL_SECONDS` | `8`     | How long a round's results stay up         |
| `CODE_BREAKER_SEED`           | unset   | Deals every game's codes from this seed    |
| `RECONNECT_GRACE_SECONDS`     | `30`    | How long a dropped player keeps their seat |

`CODE_BREAKER_SEED` is for test runs, never production: `npm run design:compare` sets it so a room plays Figma's story on codes it knows.
The codes are still drawn by the rules above, never twice in a game and never a daily code near today; only the randomness is fixed.

## Where the code lives

| File                                                                                        | Responsibility                                                                               |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`shared/code-breaker.ts`](../../shared/code-breaker.ts)                                    | Marks, guess checks, puzzle numbers, the code calendar, the practice deal and the share grid |
| [`shared/daily.ts`](../../shared/daily.ts)                                                  | Counting puzzle days by the local or UTC date, as Daily Word does too                        |
| [`module.ts`](../../server/socket/code-breaker/module.ts)                                   | What the room layer calls, and all it calls                                                  |
| [`game-engine.ts`](../../server/socket/code-breaker/game-engine.ts)                         | The round loop, guesses and scores                                                           |
| [`state.ts`](../../server/socket/code-breaker/state.ts)                                     | The game's state, and the snapshot each player is sent                                       |
| [`code-breaker/draft.ts`](../../client/src/code-breaker/draft.ts)                           | The row being typed and the notes, as both modes keep them                                   |
| [`code-breaker/play.tsx`](../../client/src/code-breaker/play.tsx)                           | Your board, the line under it, and the pad with its notes                                    |
| [`code-breaker/panel.tsx`](../../client/src/code-breaker/panel.tsx)                         | The board's paper panel and the legend of the pegs                                           |
| [`code-breaker/solo/`](../../client/src/code-breaker/solo/)                                 | The daily code and practice codes on your own, and the records kept on the device            |
| [`code-breaker/room.tsx`](../../client/src/code-breaker/room.tsx)                           | A room's screens                                                                             |
| [`shell/board-typing.ts`](../../client/src/shell/board-typing.ts)                           | Typing on a real keyboard, and the note over the board, shared with Daily Word               |
| [`solo/daily.tsx`](../../client/src/solo/daily.tsx)                                         | The wait for the next code, the distribution and the copy button, shared with Daily Word     |
| [`ui/components/code-board.tsx`](../../client/src/ui/components/code-board.tsx)             | `Zumpo/Code board`, drawn from Digit tiles and Code marks                                    |
| [`ui/components/digit-tile.tsx`](../../client/src/ui/components/digit-tile.tsx)             | `Zumpo/Digit tile`                                                                           |
| [`ui/components/code-marks.tsx`](../../client/src/ui/components/code-marks.tsx)             | `Zumpo/Code marks`, a guess's four pegs                                                      |
| [`ui/components/digit-pad.tsx`](../../client/src/ui/components/digit-pad.tsx)               | `Zumpo/Digit pad`, with its notes                                                            |
| [`ui/components/toggle-chip.tsx`](../../client/src/ui/components/toggle-chip.tsx)           | `Zumpo/Toggle chip`, the Notes toggle                                                        |
| [`ui/components/code-race-board.tsx`](../../client/src/ui/components/code-race-board.tsx)   | `Zumpo/Code race board`, a board in a round's results                                        |
| [`ui/components/code-marks-board.tsx`](../../client/src/ui/components/code-marks-board.tsx) | `Zumpo/Code marks board`, another player's pegs while a code is open                         |

The rules are covered by [`code-breaker-rules.test.ts`](../../server/tests/code-breaker-rules.test.ts) and [`code-breaker-flow.test.ts`](../../server/tests/code-breaker-flow.test.ts), and a two-player game and a solo day by [`e2e/code-breaker.spec.ts`](../../e2e/code-breaker.spec.ts), guessing as a player would, from the marks.
The screens are CB01-CB21 in [the Figma file](../design.md).
