# Doodle Chain

A drawing telephone: everybody writes a line, the next player draws it, the next says in words what the drawing shows, and so on round the table, each seeing only the step before theirs.
At the end the room watches every chain unfold from its first line to its last, which is the whole point: nobody wins, and everybody laughs at what "a cat on a bike" became.

3–8 players, in rooms only, about 5–8 minutes a game, the reveal included.
Its Chinese name is 传话画画.

---

## The name

The working name was Telephone, after the children's game.
On its own that word reads as a phone call, and it says nothing about drawing, which is what this game adds to the whispers.
**Doodle Chain** says both halves, the doodles and the chain they are passed along, in two short words that sit beside Draw & Guess and Daily Word.
Its wire id is `doodle-chain`, its events start with `dc:`, and its Figma screens are DC01-DC20.

## Chains and steps

When a game starts, the seated players are put in an **order**: the order of the scoreboard, which is the order they sat down.
Each player starts one **chain**, so a game of N players has N chains.

A game is a number of **steps**, played by everybody at the same time.
In every step each player works on a different chain, and when the step ends every chain moves one place on: you always get a chain from the player before you in the order, and pass yours to the player after you, the last player passing to the first.

| Step    | You are given                    | You make                     |
| ------- | -------------------------------- | ---------------------------- |
| 1       | Nothing                          | A **prompt**: a line to draw |
| 2, 4, 6 | The words from the step before   | A **drawing** of them        |
| 3, 5    | The drawing from the step before | A **description** of it      |

So a chain alternates words and drawings: prompt, drawing, description, drawing, description, drawing.

**A game has one step per player, but never more than six:**

| Players | Steps | Each chain ends on |
| ------- | ----- | ------------------ |
| 3       | 3     | A description      |
| 4       | 4     | A drawing          |
| 5       | 5     | A description      |
| 6–8     | 6     | A drawing          |

With at most as many steps as players, nobody ever works on the same chain twice: at step k the player in place p works on the chain started by the player in place p − k + 1, counted round the order.
Six is the cap because the reveal is the game's longest part and grows with chains × steps: eight chains of six entries are 48 to watch, about three minutes, and eight of eight would be 64.
Six steps is also as far as a line travels before it is unrecognisable, which is where the joke lands; more steps only add drawings nobody remembers.

## Phases and timings

| Phase        | Wire name  | Length                             | What happens                                                                            |
| ------------ | ---------- | ---------------------------------- | --------------------------------------------------------------------------------------- |
| **Write**    | `write`    | 30s                                | Everybody writes a prompt, up to 80 characters.                                         |
| **Draw**     | `draw`     | The room's drawing time, 60s first | Everybody draws the words they were given.                                              |
| **Describe** | `describe` | 45s                                | Everybody writes what the drawing they were given shows, up to 80 characters.           |
| **Passing**  | `passing`  | 3s                                 | The step is over: what everybody made is kept, the inputs close and the chains move on. |
| **Reveal**   | `reveal`   | No clock: the host steps through   | The chains are shown to the whole room, one entry at a time.                            |

Between games the room is in `waiting`.
The steps run `write`, then `draw` and `describe` in turn, with `passing` after every step, the last one included; after the last `passing` comes the `reveal`, and after the reveal the room is back in `waiting` with the album.

`passing` is there so the change of step is something you see rather than a jolt: your drawing stops, the screen says why the step ended and whom your entry goes to, and three seconds later the next thing to draw or describe arrives.
It says "Time's up!" only when the clock ran out, "Everyone's done!" when everybody finished early, and that there was nothing to play when the step was skipped (see [Sitting a step out](#sitting-a-step-out)).
A step that ends because everybody with something to do left the table says only "This step is over", since nobody finished it.

### Done

You press **Done** when your entry is finished, and **Keep editing** takes it back, at any time until the step ends.
**Done does not send an empty entry**: a blank line, or a canvas with no strokes.
The button stays pressable, and pressing it on an empty entry says what to do instead ("Write something first, then press Done."); the server refuses a Done for an empty entry too.
So an empty entry in a chain always means the time ran out or its player left, and the reveal can say which.
**A step ends early once every player who has something to do in it has pressed Done**, because the rest of the clock would be dead time, as in Draw & Guess.
A player who is away and has not pressed Done keeps the step running to its clock; a drop never shortens anybody's time.

### Nothing is lost to the clock

Your work reaches the server as you make it: your text as you type, a few times a second at most, and your drawing stroke by stroke, the way a Draw & Guess drawing does.
So when the clock runs out, **whatever you have is your entry**, finished or not, whether or not you pressed Done.
There is no "submit or lose it", which would punish exactly the slow, careful players a drawing game wants.

### Suggestions and empty entries

**Suggest** in the write step fills your box with a prompt picked from a list of about sixty short, drawable lines ("a cat riding a bicycle", "a dragon at the dentist").
The list is in the client's catalog, the same lines in every language, and a suggestion travels as its number in that list, not as text, so each player reads it in their own language.
Once you edit a suggested line it is your own text, and travels as text.
Players write their own prompts, so the game works in any language without a word bank; Suggest is only for a blank mind.

An entry with nothing in it is **empty**:

- **An empty prompt** when the write step ends is given a suggestion by the server, so every chain starts with something.
- **An empty drawing or description** stays empty, and the chain carries on as described in [Sitting a step out](#sitting-a-step-out).
  The reveal shows it as a short line ("Leo ran out of time"), because a chain that jumps should say why.

Text is trimmed, and a text of only spaces is empty.
A drawing is empty when it has no strokes left, after undo or clear.

### Sitting a step out

A drawing step needs words to draw, and a describing step needs a drawing to describe.
At each step, a chain is played from **its last entry that is not empty**.
If that entry is the kind the step needs, the player whose turn it is works from it, as usual.
If it is not, because the entry before was empty or its player has left, **that player sits this chain out for one step**: they are told why and wait, and the chain moves on unchanged.

Two steps in a row restore the alternation, so a chain never waits more than one step.
With Maya, Ryan, Leo and Sam playing in that order:

- Ryan's chain: Ryan writes a prompt, Leo's drawing is empty, Sam sits out the describing step, and Maya draws Ryan's original prompt.
- Maya's chain: Maya writes, Ryan draws, Leo's description is empty, and Sam sits out the last step, so the chain ends on Ryan's drawing.

Sitting out is rare, since it needs an empty entry or a player who left, and it is better than its alternatives: describing words or drawing a drawing breaks the game, and reshuffling who works on what mid-game would put a player on a chain twice.

**When every player sits out a step, the step is skipped**: it ends at once, with no clock, and the chat says why under its divider ("Step 4 is skipped: every description came back empty, so nobody had words to draw."), as does the pause after it.
A game that jumped to its next step or to the reveal without a word looked broken.

### How long a game takes

At the default 60 seconds of drawing, with nobody finishing early:

| Players | Write | Draw    | Describe | Passing | Steps in all | Reveal        |
| ------- | ----- | ------- | -------- | ------- | ------------ | ------------- |
| 3       | 30s   | 1 × 60s | 1 × 45s  | 3 × 3s  | about 2 min  | 9 entries     |
| 4       | 30s   | 2 × 60s | 1 × 45s  | 4 × 3s  | about 3 min  | 16 entries    |
| 5       | 30s   | 2 × 60s | 2 × 45s  | 5 × 3s  | about 4 min  | 25 entries    |
| 6–8     | 30s   | 3 × 60s | 2 × 45s  | 6 × 3s  | about 5 min  | 36-48 entries |

A revealed entry takes a few seconds to read and laugh at, so a reveal takes one to three minutes, and a whole game 5–8 minutes for four players and more.
A game of three is shorter, which suits it: the room plays again.

## Who sees what

The game is only funny if nobody sees a chain before the reveal, so the server sends each viewer exactly what their step needs and nothing more:

- **During a step, your snapshot carries your own task only:** the kind of step, the entry you were given (words, or a drawing), and your own work so far.
  It never carries another chain, another player's work, or the entries further back in your own chain.
- **You see the step before yours, and only during your step.**
  Once a step ends you cannot look back at what you were given or what you made; both come back in the reveal.
- **Everybody sees the table:** who has pressed Done, who sits this step out, and who is away.
- **A spectator sees the step and the table, and nothing of any chain**, until the reveal: a spectator can talk, and would otherwise be the one person in the room who could read every chain.
- **During the reveal, everybody sees the same entries:** the ones the host has shown so far, and nothing past them.
  The rest stay on the server until shown, so a page cannot read ahead.
- **After the game, everybody sees everything,** in the album.

### The chat

The chat is open to everybody, spectators too, through the whole game.
There is no score to protect: telling the next player what you drew only spoils your own joke, and the reveal is where a room wants to talk most.
So Doodle Chain has no `handleChat`: every message is chat.
Each step starts with a quiet divider in it (`Step 2 · Draw`), so the talk reads in steps.

## The reveal

After the last step everybody, spectators included, watches the chains together:

- **One chain at a time**, in the order of play, starting with the first player's.
  The chain is headed by whose it is ("Maya's chain") and how far it has got ("3 of 6").
- **One entry at a time:** the host presses **Next** and the next entry appears at the foot of the chain, under the ones before it, each with its author's avatar and name, like a conversation.
  A drawing is shown at the canvas's ratio, replayed from its strokes.
- At the end of a chain, Next becomes **Next chain**; at the end of the last chain it becomes **See the album**, which ends the game.
- Everybody else is told who is showing the chains ("Maya is showing the chains"), so the wait has a face.
- **There is no clock.**
  The laughing is the point, and the host is in the room laughing too, so the host sets the pace.

Next names the entry it means to show (`dc:reveal:next` carries how many are shown), so a double tap shows one entry, never two.
There is no Back: the album is where chains are read again, at each player's own pace.

**A host who is away does not hold the reveal:** at once the player next in line steps it on from the same entry, as they may start a game (`starterOf` in [`shared/room.ts`](../../shared/room.ts)), and is told "Maya isn’t at the table, so you show the chains."
The host takes it back the moment they return; if their seat goes, the crown passes and the new host carries on.

### Hearts

The light competition is a **heart**, given during the reveal:

- Every player may give **one heart per chain**, to any shown entry that is not their own and not empty.
  Giving it to another entry of the same chain moves it, and pressing it again takes it back.
- Everybody sees each entry's hearts as they are given; on your own entry the count is all there is, 0 included.
- Spectators watch, but do not give hearts: they are not in the game.
- A heart scores nothing in the game, but a player's **score** is the hearts their entries received this game, which the scoreboard shows during the reveal and the album ranks.
- The album names the **crowd favourite**, the entry with the most hearts; entries that tie share it, and a game nobody hearted has none.

One heart per chain makes a heart a choice, the best moment of that chain, where hearts without a limit would be pressed on everything.
There is no vote with a clock of its own, because it would interrupt the reveal at the moment it is funniest.

## The album

When the reveal ends the game is over: the room is back in `waiting`, and the finished chains stay on the table as the **album** until the next game starts.

- Every member, spectators and anybody who joins later included, may read any chain, at their own pace, by picking it by whose it is.
- The album shows every entry with its hearts, the crowd favourite marked, and each player's hearts, most first; players who share a count share a place (1, 1, 3).
  A player given no hearts has no place, and reads "No hearts"; with no hearts at all, nobody is the crowd favourite.
- The host's Start game plays again with whoever is seated.

The album is the game's result, so a game that ended early has one too.

## How to play

1. Pick Doodle Chain from the games, which opens its page.
2. **Create a room** (name, 3–8 seats, the drawing time, and an optional password) or join one of the open rooms listed under it.
3. The host presses **Start game**; it needs at least three players.
4. **Write a prompt**: anything drawable, in any language.
   Stuck? Press Suggest.
5. **Draw the words you are given**, then **describe the drawing you are given**, in turn, until the chains are done.
   Press Done when you are finished, or let the clock take what you have.
6. **Watch the reveal** as the host steps through every chain, and give your heart to the best moment in each.

## Settings

| Setting      | Options       | Default | Why                                                                           |
| ------------ | ------------- | ------- | ----------------------------------------------------------------------------- |
| Seats        | 3–8           | 8       | The game needs three to be a chain at all; past eight the reveal is too long. |
| Drawing time | 45s, 60s, 90s | 60s     | Groups differ: friends who only scribble, and friends who draw shading.       |
| Password     | Optional      |         | As in every room.                                                             |

Writing takes 30 seconds and describing 45, because a line takes about as long for anybody, and putting somebody else's drawing into words takes longer than a first line.
Describing had 30 seconds until 2026-10-21, when a three-player room ran out of time on every description and so sat out the whole next drawing step.
There is no setting for the number of steps: the players are the length, as in Hush.

## Rules the server enforces

- **Only you may make your entry**, only during its step, and only on the chain the step gave you.
  Text, strokes, undo and clear for anything else are dropped.
- **Text is at most 80 characters**, trimmed; a drawing holds at most as many points as a Draw & Guess drawing.
- **The deal of chains is the server's:** the order is fixed when the game starts, and which chain each player works on, and who sits out, follows from it.
- **Nothing a client sends ends a step**, except that the server ends it early once everybody who has something to do has pressed Done.
  The clock is the server's; a client is told how many milliseconds are left and renders a countdown from it.
- **Only the host steps the reveal**, or while they are away the player next in line, one entry at a time, and only to the entry it names.
- **A heart is a player's,** only during the reveal, only on a shown entry, never on their own, and one per chain.
- **Only the host may start a game**, or while they are away the player next in line, and only with three or more players.
  Between games anybody else at the table may say Ready, and the next game starts once everybody has ([the room layer](../architecture.md#the-room-layer)).

## Leaving, dropping and coming back

**A dropped connection is not a departure.**
Your seat, your place in the order and your work are kept for 30 seconds, as in every room here, and others see you marked away (📴).
**The game never waits for anybody:** a step runs to its clock whoever is away.
Come back in the same step and you carry on where you were, your text and your drawing given back to you; come back later and you get that step's task.
If the step ends while you are away, whatever you had made is your entry.

**When your seat goes**, because you left or 30 seconds passed, the game goes on without you:

- What you had made in the current step is kept, if it is not empty.
- Your later steps are never played: each chain that would have reached you is empty at that step, so the next player sits out and the chain goes on from the entry before, as in [Sitting a step out](#sitting-a-step-out).
- The order is not reshuffled, so every chain still moves to the same next player.
- Your chain and your entries stay in the reveal and the album, under your name.

**If fewer than two players are left**, the steps still to come are dropped and the game goes straight to the reveal, so what was made is still seen; its summary says it ended early.
Once the last step is passing on, every step has been played: the reveal comes as it would have, and nothing ended early.
A room with nobody left in it is deleted.

**If the host leaves**, the crown passes to another player, as in every room, and during the reveal the new host carries on stepping it.

## Spectators

A room has up to five spectator seats, as every room does ([the room layer](../architecture.md#the-room-layer)).

- Somebody who arrives at a game under way, or at a full table, watches it.
- A spectator sees each step and the table, but no chain until the reveal (see [Who sees what](#who-sees-what)).
- A spectator watches the reveal with the room and reads the album, but gives no hearts.
- Between games a spectator may take a free seat, and a player may move to watch.

## What a client is sent

Every change reaches a player as `room:state`, the whole room as that player may see it ([the wire contract](../architecture.md#the-wire-contract)).
The Doodle Chain snapshot adds:

| Field            | What it is                                                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `phase`          | `waiting`, `write`, `draw`, `describe`, `passing` or `reveal`                                                                                                                |
| `step`, `steps`  | The step being played, from 1, and how many the game has; 0 and the count for the players seated between games                                                               |
| `drawingSeconds` | The room's drawing time                                                                                                                                                      |
| `order`          | The players in the order of play                                                                                                                                             |
| `table`          | For every player in the order: whether they have pressed Done, and whether they sit this step out                                                                            |
| `task`           | The viewer's own task this step: its kind, the chain, the entry given (absent at step 1) and whether they sit out                                                            |
| `draft`          | The viewer's own text this step, or the number of a suggestion                                                                                                               |
| `stepEnd`        | While the chains pass on: why the step ended, `time`, `done` (everybody was done early) or `skipped` (nobody had anything to do)                                             |
| `reveal`         | During the reveal: the chain being shown, how many of its entries are shown, every chain's owner, and the entries shown so far with their hearts and the viewer's own hearts |
| `lastGame`       | The album, until the next game starts: every chain and entry, hearts, the crowd favourite, standings by hearts, and whether it ended early                                   |

An entry is its chain, its step, its kind (`prompt`, `drawing` or `description`), its author (`{ playerId, username }`, so a rename follows it), and its text, suggestion number, or drawing id, or `empty`.
A field a viewer may not see is left out of their snapshot altogether, not blanked: a spectator's snapshot has no `task` and no `draft`, and nobody's has an entry the reveal has not reached.

`phaseEndsInMs` counts down `write`, `draw`, `describe` and `passing`; in `reveal` and `waiting` it is 0, and no clock is shown.

**Drawings are not in the snapshot**, because the room's state is rebuilt for every change and a game's drawings are tens of thousands of points.
They are sent once, to whoever may see them, by `dc:drawing` (the room, the drawing id and its strokes): the drawing you are given, as a describing step starts; each drawing the reveal shows, as it is shown, which by the album is every one; and the album's, when a page syncs.
Your own drawing in progress comes back to you on sync by `dc:canvas:sync`, as a Draw & Guess drawer's does.

Doodle Chain's events of its own:

| Event                                           | Payload                                       | Sent by                        |
| ----------------------------------------------- | --------------------------------------------- | ------------------------------ |
| `dc:text`                                       | The room, and the text or a suggestion number | A player writing or describing |
| `dc:done`                                       | The room, and Done or not                     | A player                       |
| `dc:draw:start`, `move`, `end`, `undo`, `clear` | As Draw & Guess's, for your own drawing       | A player drawing               |
| `dc:reveal:next`                                | The room, and how many entries are shown      | The starter                    |
| `dc:heart`                                      | The room, the chain, and an entry or none     | A player, in the reveal        |
| `dc:drawing`                                    | The room, a drawing id and its strokes        | The server                     |
| `dc:canvas:sync`                                | The room, and your own strokes                | The server                     |

## Configuration

| Variable                  | Default | Purpose                                                                              |
| ------------------------- | ------- | ------------------------------------------------------------------------------------ |
| `DC_WRITE_SECONDS`        | `30`    | Length of the write step                                                             |
| `DC_DESCRIBE_SECONDS`     | `45`    | Length of a describing step                                                          |
| `DC_PASSING_SECONDS`      | `3`     | The pause between steps                                                              |
| `DC_DRAW_SECONDS`         | unset   | When set, every room's drawing time, to play a game through quickly while developing |
| `RECONNECT_GRACE_SECONDS` | `30`    | How long a dropped player keeps their seat                                           |

## Where the code lives

| File                                                                  | Responsibility                                                                                                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`shared/doodle-chain.ts`](../../shared/doodle-chain.ts)              | Steps for a player count, which chain a place works on, the kind a step needs, the sit-out rule, the text limit, the drawing times, how many suggestions there are |
| [`module.ts`](../../server/socket/doodle-chain/module.ts)             | What the room layer calls, and all it calls                                                                                                                        |
| [`game-engine.ts`](../../server/socket/doodle-chain/game-engine.ts)   | Steps, Done, passing, departures, the reveal and hearts                                                                                                            |
| [`state.ts`](../../server/socket/doodle-chain/state.ts)               | The game's state, its finished drawings, and the snapshot each viewer is sent                                                                                      |
| [`validation.ts`](../../server/socket/doodle-chain/validation.ts)     | This game's inbound shapes                                                                                                                                         |
| [`libs/drawing/`](../../server/libs/drawing/canvas.ts)                | A bounded stroke list and its inbound shapes, shared with Draw & Guess                                                                                             |
| [`doodle-chain/room.tsx`](../../client/src/doodle-chain/room.tsx)     | A room's screens: waiting, the reveal and the album                                                                                                                |
| [`doodle-chain/task.tsx`](../../client/src/doodle-chain/task.tsx)     | The step in hand: write, draw or describe, passing, and sitting out                                                                                                |
| [`doodle-chain/chain.tsx`](../../client/src/doodle-chain/chain.tsx)   | A chain as a column of entries, shared by the reveal and the album                                                                                                 |
| [`drawing/`](../../client/src/drawing/canvas.tsx)                     | The canvas, shared with Draw & Guess, and a finished drawing as a picture                                                                                          |
| [`net/drawing-store.ts`](../../client/src/net/drawing-store.ts)       | The finished drawings `dc:drawing` has sent, by id                                                                                                                 |
| [`i18n/en/doodle-chain.ts`](../../client/src/i18n/en/doodle-chain.ts) | The game's words, and the suggestions, the same list in every language                                                                                             |

The rules are covered by [`doodle-chain-rules.test.ts`](../../server/tests/doodle-chain-rules.test.ts) and [`doodle-chain-flow.test.ts`](../../server/tests/doodle-chain-flow.test.ts), the screens by [`room.test.tsx`](../../client/src/doodle-chain/room.test.tsx), and a whole game with three players by [`doodle-chain.spec.ts`](../../e2e/doodle-chain.spec.ts).
The screens are DC01-DC14 (game page, create room and room, desktop) and DC15-DC20 (phone) in [the Figma file](../design.md), section 12.
Its new pieces are in Shared pieces under Doodle Chain pieces: `Zumpo/Chain entry` (one entry of a chain, by kind and layout), `Zumpo/Chain composer` (writing a line, and Done), `Zumpo/Heart button`, and `Sample / Chain drawing`, the example drawings.
Its artwork is `Zumpo/Game artwork`'s `Game=Doodle Chain` variant, and its intro and card are the Doodle Chain variants of `Zumpo/Game intro` and `Zumpo/Game card`.
