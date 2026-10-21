# Daily Word

Find a hidden five-letter word in six guesses: after each guess, every letter says whether it is in the right place, somewhere else in the word, or not in it at all.
On your own it is one word a day, the same for everybody, with practice words after it; in a room everybody races the same word at the same time, and fewer guesses score more.

Solo, or 2–8 players with 3 or 5 words of 2 minutes each.

---

## A word

The **answer** is a five-letter English word.
A **guess** is any real five-letter word: it must be in the list of valid guesses, which is much longer than the list of answers ([word lists](#word-lists)).
Letters are A to Z only, case does not matter, and they are shown in capitals.
You have **six guesses**.

After a guess, each of its five letters gets a **mark**:

| Mark       | Wire name | Means                                         | Tile               |
| ---------- | --------- | --------------------------------------------- | ------------------ |
| **Right**  | `correct` | This letter, in this place                    | A green square     |
| **Moved**  | `present` | In the word, but not in this place            | A coral circle     |
| **Not in** | `absent`  | Not in the word, or not as many times as this | A flat grey square |

The shape says as much as the colour: a square is a letter in its place, a circle is a letter that belongs elsewhere, and a flat tile is a letter that does not belong, so the marks read the same without colour.
A tile's accessible name says its letter and mark ("C, right place").

### Repeated letters

A letter is marked at most as many times as it appears in the answer, and a letter in its right place is counted first.
Exactly, for a guess against an answer:

1. Every position where the guess and the answer have the same letter is `correct`.
2. Count the answer's letters that are left over, the ones not matched in step 1.
3. Go through the remaining positions of the guess from left to right.
   If the leftover count of that letter is above zero, the position is `present` and the count goes down by one; otherwise it is `absent`.

So against **CRANE**, the guess **EERIE** is marked absent, absent, present, absent, correct: the last E takes the answer's only E, so the first two have none left.
Against **SPEED**, **ERASE** is marked present, absent, absent, present, present: the answer has two Es, so both of the guess's Es are present.
Against **ABBEY**, **BABES** is marked present, present, correct, correct, absent.

The word is **found** when all five marks are `correct`.
Six guesses without finding it, and it is **missed**.

### Typing

An on-screen keyboard (three rows, QWERTY, with Enter and a delete key) and a physical keyboard both type into the next empty tile; Enter submits and Backspace deletes.
Each key shows the best mark its letter has had so far (`correct` over `present` over `absent`), and an unused letter is plain.
In a room the physical keyboard types into the board unless the chat input has focus.

A guess that cannot be used is turned back with a short note, and costs nothing; the row stays as typed so it can be fixed.
The note is under the board on your own on a wide screen, and over the board, across the row under the one being fixed, on a phone and in a room, where nothing else is under the board while you guess:

- **Not enough letters**: fewer than five.
- **Not in the word list**: five letters that are not a valid guess.
- **Already guessed**: the same word as an earlier row, which would only waste a guess.

There is no hard mode: any valid word may be guessed at any time.

## Word lists

Both lists live in [`shared/`](../../shared/), so the browser and the server check guesses against the same words.
They are loaded only with the game: the client imports them in the game's own lazily loaded chunk, never in the main bundle.

- **Valid guesses: every five-letter word of [ENABLE](https://github.com/dolph/dictionary)** (the Enhanced North American Benchmark Lexicon, about 8,600 five-letter words), plus every answer.
  ENABLE is in the public domain.
- **Answers: 1,982 common words**, the five-letter words of [SCOWL](http://wordlist.aspell.net/) up to size 35 (its common-word levels, American and shared English spellings) that are also in ENABLE, without plurals of shorter words (BOATS), past tenses (BAKED), proper nouns, abbreviations and a short list of offensive words.
  SCOWL is © Kevin Atkinson and others, under a permissive licence that allows copying, changing and redistributing it with its copyright notice; the notice is kept in a comment beside the list.

The source and licence of each list sit in a comment at its top, and [the build script](../../tools/daily-word-words/build.mjs) says where to download the sources.
The valid guesses are generated output; the answers were made once, by the same script, and are data from then on.
The answer list is stored **in puzzle order**: it is the calendar of daily words, so its order never changes once a day has been played.
A word found unfit later is replaced in place by another, never removed, so no other day moves.

## On your own

A game on your own needs no name, no room and no server: it runs in the browser.

### The daily word

Everybody gets **the same word on the same calendar day**, and a new one at their own midnight.
The day is the device's **local date**, so a day starts when the player's own day does, wherever they are.
The puzzle number in a shared result says which day it was, so friends in two time zones can tell that they played different words for a few hours.
A server-wide date (UTC) was the alternative; it was rejected because the word would change mid-afternoon or mid-evening for most of the world.

- The puzzle number counts days: **#1 is 5 October 2026**, and each local date after it is one more.
  A device whose clock is before that plays #1.
- Puzzle _n_ is entry _n_ − 1 of the answer list; after the last entry the list starts again.
- **One game a day.**
  Guesses are kept on this device as they are made, so a refresh, a closed tab or another visit later that day continues the same game, and a finished game stays finished until midnight.
- There is no clock: it is not a race, and nothing is timed.

When the word is found or missed, the board stays, and beside it:

- **The result**: found in _n_, or missed, with the word; a missed word is spelled out in tiles under the result.
- **Stats on this device**: games played, the share of them found, the current streak, the best streak, and how many were found in 1, 2, 3, 4, 5 and 6 guesses, with today's bar picked out.
- **Next word in**, a countdown to local midnight.
- **Share**, which copies a result with no letters in it, and **Practice word**.

A **streak** is daily words found on consecutive days.
The current streak runs up to today's word if it is found, or else up to yesterday's; a missed word or a day not played ends it.
Stats count finished games only, and are kept **on this device** (in `localStorage`) as one record of guesses per puzzle number, so they can always be worked out again from the records.

**Share** copies, for example:

```
Daily Word #12 4/6

⬜🟠⬜⬜⬜
⬜🟩🟠⬜⬜
🟩🟩⬜🟩⬜
🟩🟩🟩🟩🟩
https://zumpo.ryangan.me/games/daily-word/solo
```

The first line is the game, the puzzle number and the guesses used (`X/6` when missed).
Each row is a guess: 🟩 right, 🟠 moved, ⬜ not in, so the shapes match the tiles'.
The link is the page's own origin, so a local or test build shares its own address.

### Practice words

After the daily word, **Practice word** starts extra words, one at a time, as many as you like.

- A practice word is dealt from a **seed**, like Make 24's runs and Pairs' decks: the seed alone picks one word from the answer list.
- It plays exactly like the daily word, and keeps no stats and no streak: practice is practice.
- When it ends: found in _n_ or missed, with the word; **Another word** deals a new seed; **Challenge a friend** copies the result grid with a link to the same word (`/games/daily-word/solo?seed=k3f9x2`); and **Today's word** goes back to the daily result.
- Whoever opens a challenge link plays that word straight away, whether or not they have played today's.
  A practice word lives only in the page: a refresh deals it again from the link's seed, and without a link goes back to today's result.

Practice is offered only after today's word, so the daily word stays the first thing on the page.

## In a room

The room owner picks **3 or 5 words** when creating the room, and 2–8 seats.
Every player gets the same hidden word at the same time and guesses on their own board.

| Phase        | Wire name  | Length | What happens                                                 |
| ------------ | ---------- | ------ | ------------------------------------------------------------ |
| **Guessing** | `guessing` | 120s   | Everybody guesses the word, with six guesses each.           |
| **Reveal**   | `reveal`   | 8s     | The word, every player's board with its letters, and points. |

Between games the room is in `waiting`.
A round ends early once every connected player has found the word or used all six guesses.
After the last word's reveal the game ends, and the room reopens for a new one.

Each round's word is drawn at random from the answer list, never twice in a game, and never the daily word of yesterday, today or tomorrow by the UTC date, which covers every time zone's today, so a room cannot spoil anybody's daily word.

**The race view.**
While a round runs, every player sees everybody else's board as marks only: the colours and shapes of each row, how many guesses they have made, and whether they have found the word or are out of guesses, never a letter.
Your own board has your letters and the keyboard.
Once you have found the word or used your six guesses, you watch the others' boards until the round ends.
On a desktop, How to read it sits under the others' boards, the same legend of marks as on your own (DW07, DW08); a phone has no room beside the board, so while you are still guessing, and while you watch as a spectator, its turn bar says how to read the marks instead; who has found it is on the Players tab, or on the boards a spectator watches (DW13).

### Scoring

Finding the word is worth **100 points for every guess you had left over, plus up to 50 for how much of the 2 minutes is left**:

```
points = 100 × (7 − guesses) + round(50 × seconds left / 120)
```

Fewer guesses always win: the most the clock can add, 50, is half of one guess's 100.
So a word found in 3 guesses with 74 seconds left is worth 400 + 31 = 431, in 4 with 52 seconds left 300 + 22 = 322, in 5 with 18 seconds left 200 + 8 = 208, and in 6 in the last second about 100.
Seconds left are measured to the millisecond when the server receives the guess.
A word not found is worth nothing, and nothing is ever taken away.

**The winner is whoever has the most points after the last word.**
Players who share the top score share the win, and the results rank a shared score in one place (1, 1, 3).
The results also say how many of the words each player found.

The chat says when somebody finds the word ("Maya got it in 3! (+431)"), as a quiet score line, what the word was at each reveal, and who won.

## Rules the server enforces

- **The word is the server's** until the reveal.
  It is not in any snapshot while the round runs, and another player's letters are never sent before the reveal: a client is sent only the marks of other players' rows.
- **A guess is checked on the server**: five letters, a valid word, not already guessed, during `guessing`, by a player who has neither found the word nor used six guesses.
  The server marks it; the client never sends marks.
- **A player who has found the word cannot chat until the round ends,** because they could type it.
  A player who is out of guesses does not know the word and can talk.
  Leaving and coming back to watch does not open it early.
- **The deal, the clock and the score are the server's.**
- **Only the host may start a game**, or while they are away the player next in line, and only with two or more players.
  Between games anybody else at the table may say Ready, which tells the starter who is ready; the starter still starts the next game ([the room layer](../architecture.md#the-room-layer)).

## Leaving, dropping and coming back

A dropped connection keeps your seat, score and board for 30 seconds, as in every room here.
The round does not wait for you: it ends when everybody still connected is done, or when time runs out.

Guesses are server state, so a refresh keeps every row you submitted, with its marks.
Letters typed into a row but not submitted live only in the page, and a refresh clears them; the clock keeps running.

If the room falls below two players the game ends, and its summary says it ended early.

## What a client is sent

Every change reaches a player as `room:state`, the whole room as that player may see it ([the wire contract](../architecture.md#the-wire-contract)).

| Field       | What it is                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phase`     | `waiting`, `guessing` or `reveal`                                                                                                                  |
| `rounds`    | How many words a game has: 3 or 5                                                                                                                  |
| `round`     | The word open or being revealed, from 1; 0 between games                                                                                           |
| `boards`    | Every player's board for the open round, in seat order: each row's marks, found or out of guesses, and points once found; letters only on your own |
| `lastRound` | The latest finished round: the word, and every player's board with its letters and points, best first                                              |
| `lastGame`  | The summary of the last finished game, with how many words each player found, until the next one starts                                            |

Daily Word's one event of its own is `dw:guess`, with the room and the word, acknowledged: a guess the server refuses is answered `invalidRequest` with the reason, and an accepted one arrives in the next snapshot.
The client checks the word list before sending, so only a stale or modified client is refused in practice.

## Configuration

| Variable                    | Default | Purpose                                    |
| --------------------------- | ------- | ------------------------------------------ |
| `DAILY_WORD_ROUND_SECONDS`  | `120`   | How long everybody has to find a word      |
| `DAILY_WORD_REVEAL_SECONDS` | `8`     | How long a round's results stay up         |
| `DAILY_WORD_SEED`           | unset   | Deals every game's words from this seed    |
| `RECONNECT_GRACE_SECONDS`   | `30`    | How long a dropped player keeps their seat |

`DAILY_WORD_SEED` is for test runs, never production: `npm run design:compare` sets it so a room plays Figma's story on words it knows.
The words are still drawn by the rules above, never twice in a game and never a daily word; only the randomness is fixed.

## Where the code lives

| File                                                                 | Responsibility                                                                                |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| [`shared/daily-word.ts`](../../shared/daily-word.ts)                 | Marks, guess checks, puzzle numbers, the practice deal and the share grid: the rules both run |
| [`shared/daily.ts`](../../shared/daily.ts)                           | Counting puzzle days by the local or UTC date, as Code Breaker does too                       |
| [`shared/daily-word-answers.ts`](../../shared/daily-word-answers.ts) | The answers in puzzle order, with SCOWL's notice                                              |
| [`shared/daily-word-guesses.ts`](../../shared/daily-word-guesses.ts) | The valid guesses, generated from ENABLE                                                      |
| [`tools/daily-word-words/`](../../tools/daily-word-words/build.mjs)  | Builds the guesses from their sources, and made the answers once                              |
| [`module.ts`](../../server/socket/daily-word/module.ts)              | What the room layer calls, and all it calls                                                   |
| [`game-engine.ts`](../../server/socket/daily-word/game-engine.ts)    | The round loop, guesses and scores                                                            |
| [`state.ts`](../../server/socket/daily-word/state.ts)                | The game's state, and the snapshot each player is sent                                        |
| [`daily-word/solo/`](../../client/src/daily-word/solo/)              | The daily word and practice words on your own                                                 |
| [`daily-word/play.tsx`](../../client/src/daily-word/play.tsx)        | Your board, the line under it, and the keyboard                                               |
| [`shell/board-typing.ts`](../../client/src/shell/board-typing.ts)    | Typing on a real keyboard, and the note over the board, shared with Code Breaker              |
| [`daily-word/room.tsx`](../../client/src/daily-word/room.tsx)        | A room's screens                                                                              |

The rules are covered by `daily-word-rules.test.ts` and `daily-word-flow.test.ts` in `server/tests/`.
[`e2e/daily-word.spec.ts`](../../e2e/daily-word.spec.ts) plays a two-player game and a solo day in a browser, guessing as a player would, from the marks.
The screens are DW01-DW14 in [the Figma file](../design.md).
