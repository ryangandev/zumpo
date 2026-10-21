# Liar's Dice

A bluffing game: everybody rolls dice nobody else can see, then bids on what the whole table holds.
Raise the bid or call Liar; whoever is wrong loses a die, and the last player with dice wins.
On your own it is a table of bots; in a room it is your friends, one turn at a time.

Solo against 1-5 bots, or 2-6 players with 3 or 5 dice each.

---

## A round

Every player has a **cup** of dice: 3 or 5 at the start of a game, fewer as they lose them.
A player sees only their own dice until somebody calls Liar.

1. Everybody rolls, in secret.
2. The starting player opens with a **bid**: "at least _N_ dice on the whole table show _F_", such as **three 5s**.
3. In turn, each player either **raises** the bid or calls **Liar** on it.
4. On Liar, every cup is revealed and the bid is counted.
   If the table has at least _N_ dice showing _F_, the bid stands and the **caller loses a die**.
   If not, it was a lie and the **bidder loses a die**.
5. The player who lost the die starts the next round.
   A player with no dice left is **out**, and the next player still in starts instead.

The game ends when one player has dice left: they win.

### Ones are wild

A 1 counts as whatever face is bid, so three 5s is three dice showing 5 or 1.
Nobody bids on ones: a bid's face is 2 to 6.

This keeps the classic game's wild ones without Perudo's rule for bidding on them (halve the count to switch to ones, double it and add one to switch back), which is the part a newcomer stumbles on.
It also gives the one rule of thumb the game needs: **about a third of the dice show any face**, so 12 dice on the table hold about four of each face.

### The raise

A raise is **more dice, of any face**, or **the same number of dice with a higher face**.
After three 5s, three 6s or four 2s are raises; three 4s is not.

- The opening bid is any face from 2 to 6, and any number of dice from 1.
- No bid may count more dice than are on the table.
  So the highest bid there is, every die showing 6, can only be called.
- Only the player whose turn it is may call, and only on the bid just made.

There is no **Spot on** (exact) call.

### Your turn

The bid picker, on your own and in a room, opens on the face you hold most of, your ones counted, at the smallest count that face may be bid at; on a tie, the higher face.
So pressing Bid straight away makes a bid about your own dice, never an unrelated one 2.
The picker only ever offers raises; where it opens changes nothing else.
Your ones show as wild in your cup while you bid, as they do at the reveal.
The turn bar says what beats the bid in front of you: "Beat four 5s: more dice, or a higher face", or only more dice after a bid of 6s.
Liar's Dice is complete without it; leaving it out keeps every turn a choice of two (raise or call), keeps the bid picker small on a phone, and keeps games short, since Spot on's usual reward is a die back.

### How long a game takes

One die is lost a round, so a game is at most one round fewer than the dice on the table: four players with 3 dice each play at most 11 rounds, about six to eight minutes.
3 dice each is the default and the quick game; 5 is the classic game, best with two to four players.

## On your own

A game on your own needs no name, no room and no server: it runs in the browser, against bots.

- Pick how many bots (1 to 5) and how many dice each (3 or 5); the last picks are offered first next time, and a first game is 3 bots with 3 dice.
- The bots are **Pip, Juno, Otto, Remy and Wren**; a game with fewer takes some of them at random.
  Everybody, you included, sits in a random order, and a random player opens the first round.
- **Your turn waits for you**: there is no clock on your own.
  A bot takes about a second over its turn, so every bid can be read as it is made.
- After a call the reveal stays up until you press **Next round**.
- If you lose your last die the game ends for you, with your place ("Out in 3rd of 4"); the bots' game is not played out.
- Your **wins and games played**, and your current run of wins, are kept **on this device** (in `localStorage`).
  A game left unfinished does not count.
- **Leave** goes to the game's page; while a game is under way, any way out asks first, since it ends the game uncounted.

There is no Challenge a friend: the bots answer what you bid, so the same dice would not make the same game for a friend.
A room, made or joined from the game's page, is the way to play with friends.

### The bots

A bot plays a simple, believable game, from its own dice and the dice it cannot see:

- **It calls Liar** when the bid looks unlikely: when the chance that the hidden dice make up what its own do not, each hidden die matching with a chance of 1 in 3, is below its own threshold (between about 30% and 45%, so some bots are bolder than others).
- **Otherwise it raises** on the face it believes the table holds most of, which is usually the face it holds most of.
  It bids one short of as many as it believes (at least an even chance), and never less than the smallest raise, so the bidding climbs without the bot overreaching.
  When it believes no raise at all, it takes whichever is likelier to come out right: calling Liar, or the likeliest raise.
- **About one turn in five it bluffs**: it raises on a face it does not hold, or opens higher than its dice support.

The bots' code is the browser's alone (`client/src/liars-dice/solo/bot.ts`): `shared/` holds only rules both sides run, and the server never plays for anybody.

## In a room

The room owner picks 3 or 5 dice each when creating the room, and 2-6 seats.
At the start of a game every player gets their dice, and the players are put in a random order, kept for the game; the first in it opens the first round.

| Phase       | Wire name | Length     | What happens                                                     |
| ----------- | --------- | ---------- | ---------------------------------------------------------------- |
| **Bidding** | `bidding` | 20s a turn | The player whose turn it is raises the bid or calls Liar.        |
| **Reveal**  | `reveal`  | 5s         | Every cup is open, the bid is counted, and somebody loses a die. |

Between games the room is in `waiting`.

- **A raise** passes the turn to the next player still in, with a fresh 20 seconds.
- **Liar** ends the round: the reveal shows every cup, the dice that count (wild ones marked), and who loses a die.
  Then everybody rolls again and the next round starts, opened by the player who lost the die (or, if they are out, the next player still in).
- **Out of time:** Liar is called for you on the bid in front of you; with no bid yet, the lowest bid, **one 2**, is made for you.
  A call rather than the smallest raise, because a raise would be a bet the player never chose, pushed onto whoever comes next, while a call ends the round at once with a real count: a room is never held up by somebody who is not there, and the risk stays with the player who ran out.

A player who is out stays in the room, watching, and sees no more of the cups than anybody else.
When a call leaves one player with dice the game ends at once, and the room reopens for a new one.
That last reveal stays on the table under the results until the next game starts.

### Places

**The winner is the last player with dice.**
Everybody else is placed by how long they lasted: whoever went out later is placed higher.
Only one die is lost a round, so two players never share a place.

A player's points are the dice they have left, which the scoreboard shows during a game.

The chat says what each call found ("Leo called Liar on four 5s: there were five. Leo loses a die."), who is out, and who won.
Everybody may chat at any time: table talk is part of bluffing.

## Rules the server enforces

- **The dice are the server's.**
  They are rolled on the server, from the operating system's generator rather than one whose state a player could work out from their own dice, and a client is sent only its own until a call; the reveal sends every cup, and a player who is out sees no more than anybody else.
- **Only the player whose turn it is may bid or call,** and only during `bidding`.
- **A bid must be a raise:** a face from 2 to 6, a count from 1 to the dice on the table, higher than the bid in front of it.
  Liar needs a bid to call.
- **The clock, the count and who loses a die are the server's.**
- **Only the room owner may start a game**, and only with two or more players.

## Leaving, dropping and coming back

A dropped connection keeps your seat and your dice for 30 seconds, as in every room here.
Your turn does not wait for you, and is not skipped: its 20 seconds keep running, which is long enough for a refresh, and then it is played for you as when anybody runs out of time.
Skipping, as Pairs does, could hand the bid back to the player who made it, which the game has no move for.

A player who leaves, or whose 30 seconds run out, is out of the game at once, and their dice leave the table.

- **During bidding,** a player still in calls the round off: nobody loses a die, everybody still in rolls again, and the new round is opened by the player whose turn it was, or the next one still in if that was the leaver.
  The bids were about dice that are no longer there.
- **During a reveal,** the reveal stands, and the next round starts as usual without them.
- **A player already out** had no dice in the round, so it goes on as it was.

If one player with dice is left, they win.
If the room falls below two players the game ends, and its summary says it ended early, placing those left by the dice they hold.

## What a client is sent

Every change reaches a player as `room:state`, the whole room as that player may see it ([the wire contract](../architecture.md#the-wire-contract)).

| Field           | What it is                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dicePerPlayer` | 3 or 5                                                                                                                                                                    |
| `phase`         | `waiting`, `bidding` or `reveal`                                                                                                                                          |
| `round`         | The round in play or being revealed, from 1; 0 before the first game                                                                                                      |
| `cups`          | Every seated player in turn order: dice left, the round they went out in, and the dice themselves (your own during bidding, everybody's during a reveal and after a game) |
| `bids`          | This round's bids in order, each with who made it; the last is the bid in front of the player whose turn it is                                                            |
| `turnPlayerId`  | Whose turn it is; `null` during a reveal and between games                                                                                                                |
| `nextPlayerId`  | Whose turn comes next, the next player still in; `null` during a reveal and between games                                                                                 |
| `reveal`        | During a reveal and after a game: the bid called, who called it, how many dice matched, and who lost a die                                                                |
| `lastGame`      | The summary of the last finished game, in finishing order, until the next one starts                                                                                      |

Liar's Dice's two events of its own are `ld:bid`, with the room, the count and the face, and `ld:call`, with the room.

## Configuration

| Variable                    | Default | Purpose                                    |
| --------------------------- | ------- | ------------------------------------------ |
| `LIARS_DICE_TURN_SECONDS`   | `20`    | How long a player has to bid or call       |
| `LIARS_DICE_REVEAL_SECONDS` | `5`     | How long a call's reveal stays up          |
| `RECONNECT_GRACE_SECONDS`   | `30`    | How long a dropped player keeps their seat |

## Where the code lives

| File                                                              | Responsibility                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------- |
| [`shared/liars-dice.ts`](../../shared/liars-dice.ts)              | Rolls, the raise rule and the count: the rules both sides run |
| [`module.ts`](../../server/socket/liars-dice/module.ts)           | What the room layer calls, and all it calls                   |
| [`game-engine.ts`](../../server/socket/liars-dice/game-engine.ts) | Rounds, turns, calls and who loses a die                      |
| [`state.ts`](../../server/socket/liars-dice/state.ts)             | The game's state, and the snapshot each player is sent        |
| [`liars-dice/solo/`](../../client/src/liars-dice/solo/)           | A game on your own, and the bots                              |
| [`liars-dice/table.tsx`](../../client/src/liars-dice/table.tsx)   | The cups, the bids and the count, for a room and on your own  |
| [`liars-dice/words.ts`](../../client/src/liars-dice/words.ts)     | How the screens say a bid, a count and who was right          |
| [`liars-dice/room.tsx`](../../client/src/liars-dice/room.tsx)     | A room's screens                                              |

The rules are covered by [`liars-dice-rules.test.ts`](../../server/tests/liars-dice-rules.test.ts) and [`liars-dice-flow.test.ts`](../../server/tests/liars-dice-flow.test.ts).
The screens are LD01-LD15 in [the Figma file](../design.md).
