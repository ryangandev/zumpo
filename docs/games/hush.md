# Hush

A cooperative timing game without words: everybody holds numbered cards, and together the table plays all of them onto one pile, lowest first, with no turns and no talking.
Nobody may say what they hold; you play your lowest card when it feels like its moment, and the others read your waiting.

2–4 players, in rooms only: the whole game is reading the others, so there is nothing to play on your own.

---

## A level

The deck is the cards **1 to 100**.
At **level N** every player is dealt **N cards**, shuffled from the whole deck again for each level, so every card is different.
Your cards are yours alone: everybody else sees only how many you hold.

The table plays every card onto one **pile**, in ascending order:

- There are no turns.
  Anybody may play their **lowest card** at any moment, and only their lowest.
- **Nobody may say anything** about their numbers.
  The chat is locked while a level is played; that is the hush.
- There is **no clock** while a level is played, and none is shown.
  The waiting is the game: a long pause says "my card is high", and a quick play says "mine is next".
  A shared clock would turn it into a lookup table, because a team could agree between levels to play each number at its second.

A **mistake** is a card played while somebody still holds a lower one:

1. The team loses **one life**.
2. Every card lower than the one just played, in every hand, is shown to everybody and **discarded**.
3. Play stops for 3 seconds, so everybody sees what happened and settles again, then goes on.

The card that was played stays on the pile, so after a mistake every card still held is higher than the pile.
One play costs at most one life, however many cards it discards.

A level is **cleared** when every card has been played or discarded.
A level that cost no life is **clean**, and wins back **one lost life**, never more than the team started with.

## A game

| Players | Levels | Cards dealt in all |
| ------- | ------ | ------------------ |
| 2       | 7      | 56                 |
| 3       | 6      | 63                 |
| 4       | 5      | 60                 |

A game is **9 minus the number of players** levels, fixed by the players seated when it starts, so every game deals about 60 cards and lasts 5–10 minutes.
A level of any size takes about a minute, because a team plays at the pace of the numbers, not of the cards, and the moments between levels add about 10 seconds each.

The team starts with **3 lives**, whatever its size; the level count already scales with the players.
The team **wins** by clearing the last level, and **loses** when it loses its last life.

There is no team "star" (everybody agreeing to throw away their lowest card).
It would need a second way to act together mid-level, a proposal everybody must accept: a vote with its own controls, and a way to hint at your cards without words.
With 5–7 levels and a clean level giving a life back, the game does not need a way out of a stuck level; it can be added later if play shows it does.

## On your own

There is no game on your own.
Its page offers only **Create a room** and the open rooms to join, and How to play describes rooms only.

## In a room

The room has 2–4 seats and no other settings.
The room owner starts a game with two or more players seated; then every level runs through these phases:

| Phase         | Wire name   | Length              | What happens                                                                                   |
| ------------- | ----------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| **Ready**     | `ready`     | Until all are ready | Nobody holds cards yet. Each player presses Ready when they are settled. The chat is open.     |
| **Countdown** | `countdown` | 3s                  | Everybody is ready: the hands are dealt and the chat locks. Nobody can play yet.               |
| **Playing**   | `playing`   | No limit            | Anybody plays their lowest card at any moment. The chat stays locked.                          |
| **Mistake**   | `mistake`   | 3s                  | A card was played over a lower one: a life is lost and the lower cards show. Nobody can play.  |
| **Paused**    | `paused`    | Up to 30s           | A player who still holds cards has dropped. Nobody can play, and the chat stays locked.        |
| **Cleared**   | `cleared`   | 4s                  | The level is cleared: the full pile shows, with a life back if it was clean. The chat is open. |

Between games the room is in `waiting`.
After a mistake play resumes in `playing` (or `paused`, if somebody dropped meanwhile).
After `cleared` the next level starts in `ready`; after the last level, or the last life, the game ends and the room reopens for a new one.
The last pile stays on the table under the results until the next game starts.

- **Ready** is pressed once per level and cannot be taken back.
  The level waits for every seated player, including one who is away, whose seat comes back or goes within 30 seconds.
  There is no time limit: settling is part of the game, and the chat is open to nudge a slow friend.
  Before level 1 the line beside Ready says the game's one rule, no turns and no talking, lowest card first, and a spectator's line says it too; from level 2 on it says only when the chat locks.
- **The hands are dealt when the countdown starts, not before,** because the chat is open during `ready`: a hand you could see while the chat is open is a hand you could talk about.
  The countdown gives everybody one shared moment to start from, which matters in a game played on timing.
- **The chat is locked in `countdown`, `playing`, `mistake` and `paused`,** for everybody, and open in `waiting`, `ready` and `cleared`.

### Two plays at once

Plays are ordered by when they reach the server, which handles them one at a time.
Arrival order is the only fair order there is: network delays are tens of milliseconds, far below the pauses the game is played at, and it is what happens at a real table when two cards land together: whichever lands first is underneath.

If Maya plays 40 and Ryan plays 38 a few milliseconds later:

- Maya's 40 arrives first and is played.
  Ryan still holds 38, so it is a mistake: a life is lost, and Ryan's 38 (and any other card under 40) is discarded.
- Ryan's play then arrives, and is ignored: 38 is no longer in his hand, and nobody may play during `mistake` anyway.

So one slip costs one life, never two.
A play names the card it means (`hush:play` carries it), and the server accepts it only if that card is still the player's lowest, so a double tap never plays the next card by accident.

### The result

Hush is won or lost together, so the score is the **team's**, not anybody's own:

- Every player's points are the **levels the team has cleared**, the same for everybody.
- The results say what the team did ("All 6 levels cleared, with 2 lives to spare." or "Out of lives on level 5: 4 of 6 levels cleared.") show every level played with the lives it cost or won back, and list the players without ranks.
- At the end of a lost game, the cards still held are shown to everybody: nothing is secret once the game is over.
- The scoreboard during a game shows what each player holds (how many cards, or whether they are ready) instead of points, since everybody's points are the same.

The chat says what happened: a mistake as an alert naming the card and the cards under it ("Maya played 52, but Ryan held 47."), a cleared level as a quiet score line ("Level 3 cleared!", or "Level 3 cleared without a slip: a life back!"), and the end of the game.
It never names who played a card that went well.

## Rules the server enforces

- **The deal is the server's.**
  Each player is sent their own cards and nobody else's; the others' are only counts.
- **Only your lowest card can be played,** only during `playing`, and only if the card named is still in your hand.
- **The pile, the lives and the levels are the server's,** and so is deciding what a play was: a play is a mistake exactly when a lower card is held anywhere at the moment it arrives.
- **The chat is locked during a level,** by the server, not only by the client: a message sent in `countdown`, `playing`, `mistake` or `paused` is dropped.
- **Ready once per level,** only during `ready`.
- **Only the host may start a game**, or while they are away the player next in line, and only with two or more players.
  Between games anybody else at the table may say Ready, and the next game starts once everybody has ([the room layer](../architecture.md#the-room-layer)).

## Leaving, dropping and coming back

A dropped connection keeps your seat and your cards for 30 seconds, as in every room here.

- **During a level, the game waits for a player who still holds cards** (`paused`), because the others cannot play around a hand that is not there: any card they played could be over one of yours, and cost a life that was nobody's fault.
  When you come back, the level resumes with a fresh countdown.
  A player whose hand is already empty does not pause anything.
- **If your seat goes** (you left, or 30 seconds passed), your cards are shown to everybody and discarded, and **no life is lost**: it was nobody's mistake, and the level can still be clean.
  The level then resumes with a countdown.
- **During `ready`**, a player who is away holds up the level until they come back or their seat goes.

- **A player who is connected but idle can hold up a level for as long as they like.**
  Playing has no time limit on purpose, and gets no deadline or auto-play for an idle player: a deadline would be a clock to read, and an auto-play an exploit (wait it out, and the server plays your card at a moment you did not have to judge).
  The remedy is leaving: whoever is tired of waiting can leave, and so can the idle player, whose cards are then shown and discarded with no life lost, as for a lost seat.

A game keeps the level count it started with if somebody leaves.
If the room falls below two players the game ends, and its summary says it ended early, with the levels cleared until then.

## What a client is sent

Every change reaches a player as `room:state`, the whole room as that player may see it ([the wire contract](../architecture.md#the-wire-contract)).

| Field         | What it is                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `phase`       | `waiting`, `ready`, `countdown`, `playing`, `mistake`, `paused` or `cleared`                                                          |
| `level`       | The level being played, from 1; 0 between games                                                                                       |
| `levels`      | How many levels this game has; between games, how many a game would have with the players seated now                                  |
| `lives`       | Lives left, from 3; 3 between games                                                                                                   |
| `hand`        | Your own cards, lowest first; empty outside a level                                                                                   |
| `table`       | For every player: how many cards they hold, and whether they are ready                                                                |
| `pile`        | The cards played this level, lowest first, each with who played it                                                                    |
| `discards`    | The cards discarded this level, each with whose it was and why: a mistake, or a player who left                                       |
| `lastMistake` | While `mistake` shows: the card that cost a life, who played it, and what it discarded                                                |
| `lastLevel`   | While `cleared` shows: the level just cleared, whether it was clean, and whether it won a life back                                   |
| `lastGame`    | The last finished game, until the next starts: levels, levels cleared, won or not, lives left, what each level cost, cards still held |

`phaseEndsInMs` counts down `countdown`, `mistake` and `cleared`, and in `paused` the seat of the player who dropped last; in `ready` and `playing` it is 0, and no clock is shown.
The room layer keeps the clock of `countdown`, `mistake` and `cleared`.
A pause has no timer of its own, because the seat's expiry ends it, so the game keeps when that is (`pausedUntil`), as Draw & Guess keeps the drawer's hold.

Hush's two events of its own are `hush:ready`, with the room, and `hush:play`, with the room and the card.

## Configuration

| Variable                  | Default | Purpose                                    |
| ------------------------- | ------- | ------------------------------------------ |
| `HUSH_COUNTDOWN_SECONDS`  | `3`     | The countdown before a level is played     |
| `HUSH_MISTAKE_SECONDS`    | `3`     | How long play stops after a mistake        |
| `HUSH_CLEARED_SECONDS`    | `4`     | How long a cleared level shows             |
| `RECONNECT_GRACE_SECONDS` | `30`    | How long a dropped player keeps their seat |

## Where the code lives

| File                                                        | Responsibility                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------- |
| [`shared/hush.ts`](../../shared/hush.ts)                    | The deck, the deal, levels for a player count and the lives |
| [`module.ts`](../../server/socket/hush/module.ts)           | What the room layer calls, and all it calls                 |
| [`game-engine.ts`](../../server/socket/hush/game-engine.ts) | Levels, plays, mistakes, pauses and lives                   |
| [`state.ts`](../../server/socket/hush/state.ts)             | The game's state, and the snapshot each player is sent      |
| [`hush/room.tsx`](../../client/src/hush/room.tsx)           | A room's screens                                            |
| [`hush/table.tsx`](../../client/src/hush/table.tsx)         | The table: the pile, the lives and the viewer's hand        |

The rules are covered by [`hush-rules.test.ts`](../../server/tests/hush-rules.test.ts) and [`hush-flow.test.ts`](../../server/tests/hush-flow.test.ts).
The screens are HU01-HU11 in [the Figma file](../design.md).
