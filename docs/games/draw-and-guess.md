# Draw & Guess

One player draws a word; everyone else races to type it.
The faster you guess, the more it is worth, and the drawer takes a cut of whatever you earn, so a drawing people get quickly is a good drawing.

2–8 players, 1–4 rounds, about 90 seconds a turn.

---

## The game loop

A **game** is a number of **rounds**, chosen when the room is created.
In each round every player draws exactly once, in a random order, so a 2-round game with 4 players is 8 turns.

One word category (Fruits, Animals, League of Legends, Electronics, Sports or Food) is drawn at random for the whole game and shown to everyone.
The words are English in every language, and a guess is matched in English, ignoring case and the spaces around it.

Each **turn** has three phases, and the server decides when each one ends:

| Phase           | Wire name  | Length | What happens                                                                  |
| --------------- | ---------- | ------ | ----------------------------------------------------------------------------- |
| **Word select** | `choosing` | 15s    | The drawer picks one of three words from the category. Nobody else sees them. |
| **Drawing**     | `drawing`  | 90s    | The drawer draws; everyone else guesses in the chat box.                      |
| **Review**      | `reveal`   | 10s    | The word is revealed to the room.                                             |

Between games the room is in `waiting`.
If the drawer lets the word-select clock run out, the server picks the first of their three words for them and the turn says so (`wordAutoPicked`).

The drawing phase ends early the moment everybody has guessed: there is nothing left to draw for, and the rest of the clock would be dead time.

When the last turn of the last round finishes, the game ends and the room reopens for a new one.
Scores are shown throughout, in the player list, ranked.

Each round is summed up as it ends, at Ryan's request on 2026-10-20: what every player made in it, best first, beside their total.
The summary goes up with the reveal of the round's last turn and stays through the next round's word select, so it changes no timing; a last turn skipped before its reveal is summed as the next round starts.
The last round's summary gives way to the results when the game ends.

## Winning and losing

**There is no lose condition.**
Draw & Guess is a race for points, not an elimination game: a turn you guess nothing on costs you nothing but the points you did not take.

**The winner is whoever has the most points when the last round ends.**
Players who share the top score share the win, and the results screen ranks a shared score in one place (1, 1, 3).
The room snapshot keeps a summary of the finished game (`lastGame`: the standings best first, the category, how many rounds and turns were played, and whether it ended early) until the next game starts, which is what a results screen is drawn from.

## Scoring

A correct guess is worth **50 points for getting there at all, plus up to 100 more for how much of the drawing phase is left**:

```
guesser = 50 + round(100 × fraction of the drawing phase remaining)
drawer  = round(guesser × 0.4)
```

So a guess in the first second is worth about 150 and one in the last second about 50, and the drawer takes two fifths of whatever the guesser earned.
Every guesser is scored independently, so the drawer's total for a turn grows with how many people got it.

You can only score **once per turn**.
The drawer cannot guess their own word.

## How to play

1. Pick Draw & Guess from the games, which opens its page.
2. **Create a room** (name, 2–8 seats, 1–4 rounds, and an optional password) or join one of the open rooms listed under it.
   A locked room asks for its password.
3. The host (the crown in the player list) presses **Start game**.
   It needs at least two players.
4. **When it is your turn**, pick one of three words within 15 seconds, then draw it.
   You have twelve brush colours, four brush sizes, undo and clear.
5. **When it is not**, type guesses into the chat box.
   Matching is case-insensitive and ignores surrounding spaces, so `steak`, `Steak` and `STEAK` all count.
6. A wrong guess is just chat: everyone at the table sees it, which is half the fun.
   A guess a letter or two off the word, or with the word inside it, is the exception, because it all but spells the word: only you see it, marked "So close!", and the room is told `<name> is close!`.
   On a phone the newest three lines of the chat show under the board, so the guesses can be followed without leaving the drawing, and your own guess lights up as it lands.
7. Each turn starts with a quiet divider in the chat, `Round <n> · <name> draws`, so it is clear which turn a guess belonged to.

## Rules the server enforces

None of these are UI-only.
The client shows them, and the server checks them, so a modified client gains nothing:

- **Only the drawer may draw**, and only during a drawing phase.
  That covers drawing, undo and clear: a stranger with a room id off the lobby broadcast used to be able to wipe a room's canvas with one event.
- **Only the host may start a game**, or while they are away the player next in line, and only with two or more players.
  Between games anybody else at the table may say Ready, and the next game starts once everybody has ([the room layer](../architecture.md#the-room-layer)).
- **Only a member may read a room's state**, a player or a spectator, so a locked room's player list is not readable by anyone who has a room id.
- **Only a member may talk** in a room, and a spectator's right guess is swallowed and scores nobody.
- **During drawing, a spectator talks only to the other spectators.**
  Someone watching sees the drawing and the hint and can work the word out like anybody else, so a line from a spectator then reaches the spectators alone, never the drawer or a guesser, and the input says so.
  The line is marked `audience: 'spectators'`, and a player's history on a refresh leaves it out.
  In choosing, review and between games a spectator's message is ordinary chat.
- **Nothing a client sends advances a phase.**
  The clock lives on the server; a client is told how many milliseconds are left and renders a countdown from it.

Chat is also where guesses arrive, so every message passes the game before it is posted:

- **The drawer is silent while the word is in play.**
  During word select and drawing, nothing the drawer types is shown to anyone, because anything they type could be the word or a hint at it.
  They can talk again in the review phase and between games.
- **During drawing, a guesser's message is a guess.**
  A correct one is never shown: it is scored, and the room is told `<name> guessed the word, +<points>.` as a `success` message.
  A close one is not posted to the room, because it almost spells the word or holds it (see below).
  Any other wrong one is ordinary chat.
- **A close guess is the guesser's alone**, added at Ryan's request on 2026-10-26.
  A guess is close when it is not correct but nearly is, or carries the word, by either of two rules.
  Both read the guess and the word the same way: full-width and other compatibility forms folded to plain ones (NFKC), case set aside, and every character but a letter, a digit or a space read as a space.
  - **A letter or two off.** With the spaces dropped too, it is one edit from a word of 4 to 7 letters, or two from a word of 8 or more, where an edit inserts, deletes or changes a letter or swaps two side by side (the optimal string alignment distance).
    So `turtel`, `turtle!!`, `ｔｕｒｔｌｅ` and `a turtle?` are close to "Turtle", and `icecream` or `ice-cream` to "Ice Cream".
    A word under 4 letters is never close by this rule.
  - **The word inside.** Its words hold the word's words in a row, whole and in order, at any length of word, so `i think its a turtle` and `turtle turtle` are close to "Turtle", and `a dog?` to "Dog"; `hotdog` is not.
    This keeps a 3-letter word typed inside a sentence from reaching the room.

  Correct-guess matching is unchanged: only the word itself, ignoring case and the spaces around it, scores, so each guess above is close, not correct.
  Only a seated guesser who has not scored this turn can be close, and only while drawing; the drawer and anyone who has scored are silent as ever, and a spectator's line stays among the spectators.
  The guess goes back to the guesser alone, marked close (`audience: 'sender'`, `close: true`), and a refresh gives it back to them and nobody else.
  The first close guess of a turn from each guesser tells the room `<name> is close!` as a `system` notice (`dg:close`); later ones that turn are the guesser's line alone.
  It scores nothing and changes no timing or hint.

- **A player who has scored is silent until the next turn starts**, the review phase included, because they know the word and could type it.
- **Everyone else may say anything in the other phases**, spectators included.
  Typing the word during the review phase is chat, and so is a guess close to it, because the word is on screen by then.
- A correct guess in a turn whose drawer has left is swallowed rather than shown.

## Hints

The row of underscores gets easier as the drawing clock runs down: two reveals, evenly spaced through the phase, uncovering up to a third of the letters between them.
Spaces are kept as they are, so "Ice Cream" hints as `___ _____` and a two-word answer looks like one.
Short words give up less: "Pear" reveals one letter, never two.
The hint is empty during word select and between games, and stays at what it reached through the review phase.

## Leaving, dropping and coming back

**A dropped connection is not a departure.**
If your connection drops you keep your seat, your score, the crown and your place in the round for 30 seconds.
Others see you marked away (📴) rather than gone.
Reload the page and you are the same player, in the same seat.
A turn is only ever dealt to somebody present, so the players owed a turn who are away are passed over; if only they are left in the round, their turns are skipped and the game goes on to the next round, which deals them in again.
If every player at the table is away when a new drawer's turn begins, nobody can draw, so the game stops there with the interrupted notice and its summary says it ended early.

**A drawer who drops keeps their turn too**, but only for 10 seconds and only once the drawing has started: long enough for a refresh, short enough that a room whose drawer has actually gone is not left watching a frozen canvas.
While the room waits, the snapshot carries how long it will wait (`drawerHoldEndsInMs`).
The drawer comes back to the same board, the same word and the same clock.

**Leaving deliberately takes effect at once.**
If the drawer leaves, the turn is skipped; if the owner leaves, the crown passes to another player; if the room drops below two players mid-game, the game ends rather than stalling, and its summary says it ended early.

A room with nobody left in it is deleted.

## What a client is sent

Every change reaches a player as `room:state`, the whole room as that player may see it ([the wire contract](../architecture.md#the-wire-contract)).
The Draw & Guess snapshot adds:

| Field                           | What it is                                                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `phase`                         | `waiting`, `choosing`, `drawing` or `reveal`                                             |
| `currentRound`, `turn`          | Both count from 1 during a game and are 0 between games; `turn` counts turns skipped too |
| `currentDrawer`, `wordCategory` | Who draws, and the game's category; empty between games                                  |
| `wordChoices`                   | The three words, in the drawer's snapshot alone, during word select                      |
| `word`                          | In the drawer's snapshot during drawing, and in everyone's during the review             |
| `hint`                          | The underscores, for everyone                                                            |
| `wordAutoPicked`                | True when the clock chose the word                                                       |
| `scoredThisTurn`, `turnPoints`  | Who has scored this turn, and what each player has made this turn                        |
| `drawerHoldEndsInMs`            | How long the turn still waits for a dropped drawer; 0 when it is not waiting             |
| `lastRound`                     | The round that just ended, what each player made in it, while its summary is up          |
| `lastGame`                      | The summary of the last finished game, until the next one starts                         |

A field a player may not see is left out of their snapshot altogether, not blanked.
The drawing is a stream rather than state: `dg:canvas:start`, `move`, `end`, `undo` and `clear` are relayed as they happen, and `dg:canvas:sync` sends the whole drawing to a page that syncs.
A close guess is a chat line rather than state: it is sent to its guesser alone, and the snapshot carries nothing about who was close.

## What the server owns

Everything that decides an outcome:

- **The clock:** one per room, kept by the room layer and started from [`game-engine.ts`](../../server/socket/draw-and-guess/game-engine.ts).
- **The word:** in the drawer's snapshot alone until the reveal, and left out of everyone else's.
- **The drawing:** the same replayable stroke list every client builds, kept server-side so that a player arriving mid-turn is sent the board rather than a blank one.
- **The scores:** awarded where the clock is known, because what a guess is worth depends on how much of the phase is left.

## Configuration

Phase lengths are server-side settings, because the server is what enforces them.
Shorten them to play a whole game through in seconds while developing:

| Variable                  | Default | Purpose                                        |
| ------------------------- | ------- | ---------------------------------------------- |
| `WORD_SELECT_SECONDS`     | `15`    | How long the drawer has to pick a word         |
| `DRAWING_SECONDS`         | `90`    | Length of the drawing phase                    |
| `REVIEW_SECONDS`          | `10`    | How long the word is shown after a turn        |
| `DRAWER_HOLD_SECONDS`     | `10`    | How long a turn waits for a drawer who dropped |
| `RECONNECT_GRACE_SECONDS` | `30`    | How long a dropped player keeps their seat     |

## Where the code lives

Draw & Guess is a **game module** on the generic room layer: seats, ownership, the reconnect grace, the chat log and the lobby are not its code.
See [the room layer](../architecture.md#the-room-layer) for the split.

| File                                                                                                            | Responsibility                                                |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`module.ts`](../../server/socket/draw-and-guess/module.ts)                                                     | What the room layer calls, and all it calls                   |
| [`game-engine.ts`](../../server/socket/draw-and-guess/game-engine.ts)                                           | The turn state machine, the phase clock and chat rules        |
| [`state.ts`](../../server/socket/draw-and-guess/state.ts)                                                       | The game's state, and the snapshot each player is sent        |
| [`game-events-handler.ts`](../../server/socket/draw-and-guess/game-events-handler.ts)                           | The drawer's word choice                                      |
| [`whiteboard-canvas-events-handler.ts`](../../server/socket/draw-and-guess/whiteboard-canvas-events-handler.ts) | Relay draw, undo and clear                                    |
| [`libs/drawing/canvas.ts`](../../server/libs/drawing/canvas.ts)                                                 | The room's drawing, as a replayable stroke list               |
| [`words.ts`](../../server/socket/draw-and-guess/words.ts)                                                       | Picking words, hiding them, and matching guesses to them      |
| [`validation.ts`](../../server/socket/draw-and-guess/validation.ts)                                             | This game's inbound shapes; a stroke's are in `libs/drawing/` |

Its own events are all prefixed `dg:`.
Everything generic (`session:`, `room:`, `lobby:`, `chat:`, `game:start`) belongs to the room layer, and every event is declared in [`shared/wire-types.d.ts`](../../shared/wire-types.d.ts).
