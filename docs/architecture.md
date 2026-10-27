# Architecture

How the code is put together, why, and where it bites.
Game rules live in [games/](games/), one document per game; this document is about the machinery under them.

## Code map

```
client/  React SPA (Vite) ──── socket.io ────► server/  Express + Socket.io
                                               │
                                               ├── room layer: seats, lobbies, chat
                                               │     └── game modules: decide when time runs out
                                               └── all state in memory, one registry
shared/  wire-types.d.ts, and rule code both sides run
tools/   figma-export, figma-bridge, design-tokens: Figma into the repo (see design.md)
         audio: the sound pipeline, masters outside the repo into client/src/audio/generated/
audio/   sounds.json: every sound effect, declared once
```

| Path                                         | What it is                                                           |
| -------------------------------------------- | -------------------------------------------------------------------- |
| `server/app.ts`                              | `createZumpoServer()`: builds a fully wired server without a port    |
| `server/server.ts`                           | Entry point that binds the port                                      |
| `server/libs/rooms/`                         | The generic room layer (table below)                                 |
| `server/socket/<game>/`                      | Each game's module: its engine, state, phases and validation         |
| `server/socket/player-session-handler.ts`    | The identity handshake                                               |
| `server/socket/client-disconnect-handler.ts` | Hands a dropped socket to `membership.ts`                            |
| `server/libs/validation.ts`, `rate-limit.ts` | Inbound validation and per-socket token buckets                      |
| `shared/wire-types.d.ts`                     | Every event name and payload shape                                   |
| `shared/*.ts`                                | Rule code both sides run: board sizes, deals, arithmetic             |
| `client/src/games/`                          | The game catalog, and the cards and artwork that present each game   |
| `client/src/app.tsx`                         | Routes and their guards                                              |
| `client/src/net/`                            | The socket, the session, and the lobby and room hooks                |
| `client/src/shell/`, `client/src/pages/`     | The page frame and the platform pages                                |
| `client/src/room/`                           | What every room shares: seating, layout, panels, dialogs             |
| `client/src/solo/`                           | What every game on your own shares: layout, clock, bests             |
| `client/src/<game>/`                         | Each game's room view, and its solo page under `solo/` if it has one |
| `client/src/ui/`                             | The Zumpo design system: components, base styles, generated tokens   |
| `client/src/ui/gallery/`                     | The development-only `/design` page that reviews it against Figma    |
| `client/src/audio/`                          | The sound engine, its settings and hooks ([sound](#sound))           |
| `client/src/audio/generated/`                | The built sound files and banks; written by `audio:build`            |
| `audio/sounds.json`, `tools/audio/`          | Every sound's declaration, and the build and check that use it       |

There is no database and no business HTTP API.
Everything except serving static files and a health check (`/healthz`, which reports the rooms and connections it holds) happens over Socket.io, and server state is one flat registry of rooms of every game, owned by [`server/libs/rooms/registry.ts`](../server/libs/rooms/registry.ts).
Restarting the server drops every room.
It goes properly, though: on SIGTERM or SIGINT ([`server.ts`](../server/server.ts)) the server sends every connection `server:closing` and then disconnects it, and a room page shows that the room ended in a restart instead of reconnecting to a server that has never heard of it.
The sockets are disconnected before `io.close()`, which would cut the transports with that last packet unsent, and given a second to flush it.
That is a conscious trade for a hobby project, and it also means one process: scaling out needs a decision about where each room's state and clock live, which a Socket.IO Redis adapter alone does not answer.

`createZumpoServer()` exists so the server is testable: when these objects were module-level, importing anything meant taking port 3000.

## The room layer

A room is `Room<TGameState>`: a name, an owner, a password, seats keyed by player id, one clock, and a `game` field the room layer never looks inside.
Each game registers a module implementing `GameModule` in [`libs/rooms/types.ts`](../server/libs/rooms/types.ts), and the layer reaches a game only through it.

| File (`server/libs/rooms/`) | Responsibility                                                          |
| --------------------------- | ----------------------------------------------------------------------- |
| `types.ts`                  | `Room<TGameState>` and the `GameModule` interface                       |
| `registry.ts`               | Every room and its module, added and removed only here; snapshots, chat |
| `membership.ts`             | Seats, departures and the reconnect grace                               |
| `seats.ts`                  | Seats taken and the lobby status, worked out rather than stored         |
| `timers.ts`                 | Timers kept per room, which go when their room does                     |
| `lobby-events.ts`           | List rooms, create a room and seat its creator                          |
| `room-events.ts`            | Join, leave, sync, start and rename, answered through acknowledgements  |
| `names.ts`                  | The name a player goes by in a room, and renaming them everywhere       |
| `chat-events.ts`            | Talking in a room, after the game has had its say                       |
| `emit.ts`                   | Typed emit helpers, and `onClientRequest` for acknowledged requests     |

A module reaches the layer through the `GameContext` it is handed: the typed Socket.IO server and a `RoomLookup` that finds rooms (`ofType` refuses a room of another game), rebroadcasts a lobby (`emitLobby`), sends snapshots (`emitState`), posts to the chat (`announce`) or to one member alone (`sayToSender`), and runs the room's clock (`startPhase`, `stopPhase`) and any other timers (`timers()`).
`GameModule` is what the layer calls back:

| Member                                    | Called when                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `parseSettings`, `createState`            | A room is created, or the next game's settings change; `null` refuses it   |
| `toLobbyInfo(room)`                       | The lobby list is rebuilt                                                  |
| `toRoomState(room, viewerId)`             | A snapshot is sent to one player                                           |
| `syncTo(socket, room, playerId)`          | A page syncs, after its snapshot and chat: anything streamed               |
| `handleChat?(room, playerId, text)`       | A member sends chat; answers `chat`, `consumed`, `blocked` or `spectators` |
| `startGame(room)`                         | The starter presses start, or the table is all ready (see below)           |
| `onDeparture`, `onDisconnect`, `onReturn` | A seat is given up, held, or taken back                                    |
| `registerHandlers(socket)`                | A connection arrives: wire up the game's own events                        |

The layer decides who may start, the same way for every game: only the starter, only while no game is on, and only with `minPlayers` seated.
The starter is the host while they are at the table, or while the host is away or watching the player the crown would pass to (`starterOf` in [`shared/room.ts`](../shared/room.ts)), at once rather than once the host's seat is given up: a room never waits on a host who is not there.
A spectator never starts, changes the settings, says Ready or steps a reveal, even a host who went to watch (`mayStart`).
Between games anybody at the table may say Ready (`room:ready`), and once everybody here but the starter has, the layer starts the next game itself ([`ready.ts`](../server/libs/rooms/ready.ts)); a player away holds nothing up, and the Readies are forgotten when a game starts.
Between games the starter may also change the next game's settings (`room:settings`): the module's `parseSettings` reads them as it reads a create request's, and the layer sets each on the game's state under its own name, which every game keeps them under and its snapshot and lobby row show them by (decided by Ryan on 2026-10-21); Draw & Guess's word categories are in the snapshot alone, since no lobby row reads them.
Each game's seat limits live once in `shared/seats.ts`, which its module and the client's catalog both read.

A room's chat is a log on the room (`Room.chat`), not a stream: every message gets the next id in that room, the last 100 are kept, and a page that syncs is sent them as `chat:history`.
A player's message is posted under the name on their seat; anything else is an announcement with a `kind` (`system`, `alert` or `success`) the client styles it by.

A player's name is written wherever a room records them: the seat, the owner, and any `{ playerId, username }` record in a module's state, such as the last game's standings.
`player:rename` changes it in every one of those at once through `renamePlayer` ([`names.ts`](../server/libs/rooms/names.ts)), which walks the room's plain data, so a module that keeps a player's name in that shape needs nothing else to follow a rename.
The chat is left alone: what was said was said under the old name, and the room is told who became whom.
A room whose creator kept the suggested name is stored without one (`roomName` is `''`), and each client words it after its host at the time ("Ben's room"), so the name follows the crown; a name somebody typed stays as typed.
Two players in a room never go by one name, whatever its case: joining or renaming as a name somebody else has adds the first free number ("Sam 2"), shortening the name to keep it within 18 characters.

Two boundaries had to be drawn for the layer to be an abstraction rather than Draw & Guess wearing a hat:

- **Timers.** A module decides when its timers run and what they do; the layer keeps them, so they go with their room.
  A room has one clock, started by `startPhase`, which sets `phaseEndsAt` and the timer that ends the phase together so the countdown players see cannot disagree with it.
  Anything else a game waits on (a hint to reveal, a drawer to come back) is a set from `timers()`.
  The registry clears a room's timers from every set when it removes the room, and checks the room is still there when one fires, so a timer cannot outlive its room because a game forgot it.
  The layer's own timers are the seat expiries that hold a disconnected player's place.
- **Per-player state.** `PlayerInfo` carries what every game has: a name, a score, whether they are connected.
  Anything else lives in the module's own state, keyed by the same player id.

Minesweeper was added without editing a line of `libs/rooms/`, though it disagrees with Draw & Guess about almost everything a game can:

|                       | Draw & Guess                            | Minesweeper                      |
| --------------------- | --------------------------------------- | -------------------------------- |
| Timers of its own     | Three (phase, drawer hold, hints)       | One (the round window)           |
| Turn structure        | One player at a time, in a rota         | Everybody at once, per round     |
| Per-player state      | Who scored this turn, and how much      | Each player's pick this round    |
| `syncTo`              | The drawing (`dg:canvas:sync`)          | Nothing: the snapshot has it all |
| `handleChat`          | A correct guess is not chat             | None: every message is chat      |
| Private state         | The word, until the reveal              | The mine layout, forever         |
| Private to one viewer | The word and the choices, to the drawer | Your own pick, until the reveal  |

A lobby is a Socket.IO room per game, so a client that has not subscribed to a game is never sent its rooms.
A room has up to five spectator seats beside the table (`MAX_SPECTATORS` in [`shared/room.ts`](../shared/room.ts)), decided by Ryan on 2026-10-20.
A spectator is a member of the room but not of the game: `Room.spectators` holds them apart from `playerList`, so no module counts, deals or scores them, and every module's `toRoomState` already gives an id it does not know the view any player may see.
Anyone joining an open room may pick a seat or a spectator seat (`room:join`'s `seat`); somebody arriving at a game under way, or at a full table, watches it.
Between games a player may move to watch (`room:watch`) and a spectator may take a free seat (`room:sit`); during a game everybody stays where they are, so a game never gains or loses a player except by leaving.
A spectator can talk, through the module's `handleChat` like anybody, so a right guess from the spectator seats is swallowed and scores nobody, and Make 24 keeps spectators quiet while a hand is being solved.
A module may also answer `spectators`, as Draw & Guess does while a word is drawn: the line is posted with `audience: 'spectators'`, sent to the spectator seats alone, and left out of the history (`registry.chatFor`) anybody at the table gets on a refresh.
Draw & Guess also posts a guess close to the word back to its guesser alone (`sayToSender`): the line is marked `audience: 'sender'`, sent to that player, and left out of everybody else's history, so the room never reads the word spelt a letter off or typed inside a sentence.
A spectator's place is held through a refresh like a seat, but quietly: nobody is told they dropped or came back, and the game is never paused for them.
When the owner leaves, the crown passes to a player here, then a player away, and to a spectator only when no player is left; a host who moves to watch hands it to a player at the table if there is one, and a room ends with its last member.
The client offers Watch instead only to a guest, because for a host it is a one-way step.
A game left with too few players ends with one chat line, `game:interrupted`, and no result: nobody finished it, so nobody "wins with 0 points".
A player holds one seat at a time: creating or joining a room gives up any other seat, as leaving it would.
The client leaves a room on its way out, but only while connected, so without this a player who navigated away offline would hold the old seat through its grace period while playing somewhere else.

## Server authority

The server decides everything a player could gain by lying about.

- **The clock lives on the server,** one per room: each module's `game-engine.ts` decides what a phase is and how long it runs, and starts it with `rooms.startPhase`.
  Clients are told how much time is left and render a countdown; nothing they send advances a phase.
  When the drawer's browser used to end each phase, closing that tab hung the room forever.
- **Time is sent as a remaining duration, not a timestamp,** so a client whose clock disagrees with the server's still counts down correctly.
  Every snapshot re-syncs it.
- **Nothing internal is emitted directly.** A module's `toLobbyInfo` and `toRoomState` are the only way a room becomes something a client sees, so the room password and the word being guessed cannot leak through an accidental emit.
- **A snapshot is built per viewer.** `toRoomState(room, viewerId)` leaves out whatever that player may not know (the word for a guesser, another player's pick), and only the registry sends `room:state`, one player at a time.
  A module changes its state and calls `rooms.emitState(room)`; it never emits a snapshot itself, because a room-wide emit would send everybody the same view.
- **A game on your own is the exception, and runs in the browser.**
  With nobody else in it there is nothing to gain by lying, so solo play opens no socket, and keeps its bests in the device's `localStorage` ([`solo/`](../client/src/solo/)).
  Its rules are still one copy: anything a room plays too, such as board sizes or a deal, comes from `shared/*.ts`.
  A solo game keeps its timestamps in its own time (`useSoloTime` in [`solo-time.ts`](../client/src/solo/solo-time.ts)), which `SoloLayout` stops while How to play is open, so reading the rules never costs a run time.
- **Every inbound event is validated** with zod ([`validation.ts`](../server/libs/validation.ts)) before it reaches game state, and **rate-limited** before that ([`rate-limit.ts`](../server/libs/rate-limit.ts)): one token bucket per kind of event, per socket, because a drawing phase is a stream of coordinates and joining a room is a click.
- **What a client can make the server hold is bounded, not only how fast.** A packet may be at most 16 KB (socket.io's default is 1 MB, parsed in full before zod sees it), one player holds one seat, and the server holds at most 500 rooms; past that, `room:create` is refused with `tooManyRooms` ([`app.ts`](../server/app.ts)).
- **One address cannot hold the server.** Before a connection is let in, [`connection-gate.ts`](../server/libs/connection-gate.ts) holds each address to 30 open connections, 60 new ones a minute and 10 rooms it made, and everybody together to 2,000 connections and 10,000 identities; a returning player is always let back.
  Behind a proxy every connection comes from the proxy, so the client's address is read from the header `CLIENT_IP_HEADER` names.
  When that header is missing, only the totals apply: one bucket shared by everybody would shut the site.
- **Every response says what a page may load.** A Content Security Policy allows only this origin (inline styles aside, for React's `style` attributes) and no framing, with `nosniff` and a strict referrer, and Express no longer names itself.
  A built file under `/assets` carries a hash in its name and is cached for a year as immutable; the page is `no-cache`, so the visit after a deploy loads the new build.
- **The UI's rules are enforced, not assumed.** Only the drawer may draw, and only while drawing; only the starter may start, or change the next game; only a member, at the table or in the spectator seats, may read a room's state or talk in it; a guess is checked by the game's `handleChat` for phase, not-the-drawer and not-already-scored.
- **The drawing is server state too.** The stroke list every client builds is built once more on the server, so a player arriving mid-turn gets the board, and undo is "drop the last stroke" rather than a full-canvas image.

## Identity and reconnection

Rooms are keyed by a server-issued player id, not `socket.id`, which changes on every reload.
A client presents the identity it holds, or `null`, in the Socket.IO handshake (`auth`) of every connection, and the server's first event is `session:ready` with its `SessionInfo`: the identity to keep (new, or the one it claimed if that checked out) and `reconnectGraceMs`, how long a dropped seat is held.
Identity is part of the handshake rather than a first event because the client flushes whatever it sent while offline the moment it connects, before its own `connect` handler runs; as an event, a quick first click reached the server before the identity did and was refused.
Each id is paired with a secret token only its owner receives; without it any player could take any seat, because every id in a room is broadcast to everyone in it.
The client keeps both in `sessionStorage`: per tab, surviving a reload, which is exactly the lifetime a seat should have.
The name is the browser's rather than the tab's: it lives in `localStorage`, with whether it is still the one picked on the first visit, so a new tab or a visit next week starts with it.
Two tabs are still two players; they begin with the same name, and a room numbers the second.
There are no accounts: this is a way to be the same player across a refresh, not the same person across a visit.

Which player a connection speaks for is settled in the handshake and kept on the socket (`socket.data.playerId`), so every handler reads it from there and never from a payload.
Each player's socket also sits in a channel of the player's own (`player:<id>`), which is how a snapshot reaches one player and how the room layer moves a player's connection into and out of rooms.
[`player-session.ts`](../server/libs/player-session.ts) keeps only what outlives a socket: the token, and which socket is the current one.

A player is in one place at a time.
A browser's Duplicate tab copies `sessionStorage`, identity included, and the server cannot tell the copy from the original, so the newer connection takes the seat and the older one is sent `session:replaced` and closed.
The seat never went away, so the room hears neither "lost connection" nor "reconnected".
The older tab says the game is open in another tab and does not reconnect by itself, because it would take the identity back and the two tabs would trade it forever; "Use this tab" takes it back on purpose.

A dropped connection is not a departure.
The seat, score, ownership and place in the round are held for thirty seconds ([`membership.ts`](../server/libs/rooms/membership.ts)); leaving deliberately takes effect immediately, and that is the only difference between the two paths.
A drawer's turn is held too, but only for ten seconds and only once drawing has started: long enough for a refresh, short enough that a room whose drawer has really gone is not left watching a frozen canvas.

## The wire contract

Every event name and payload shape is declared once in [`shared/wire-types.d.ts`](../shared/wire-types.d.ts), as the two event maps `ClientToServerEvents` and `ServerToClientEvents`.
The server is `Server<ClientToServerEvents, ServerToClientEvents>`, and its emit helpers in [`emit.ts`](../server/libs/rooms/emit.ts) are generic over the event name, so an event renamed or reshaped on one side stops compiling rather than silently never arriving.
It is types only, imported with `import type`, so nothing resolves at runtime.

Beside it, `shared/*.ts` holds rule code that both sides run: board sizes, card deals, the arithmetic of a hand.
A game you play on your own runs in the browser and a room runs on the server, and both import the same file, so the two cannot drift apart.
The server compiles `shared/` along with its own sources (`rootDir` is the repository root), which is why the server starts from `server/build/server/server.js` and its runtime copy lands in `server/build/shared/`; Vite bundles the same files into the client.
`shared/package.json` only marks the folder as ES modules; it is never installed.
Nothing in `shared/` may import from `server/` or `client/`, or reach for Node or the DOM.
Inbound arguments are still handled as `unknown` and parsed with zod: a type says what a well-behaved client sends, not what arrives.

The protocol is snapshot-driven.
Whenever anything visible in a room changes, every connected member, player or spectator, is sent `room:state`: the whole room as that player may see it.
A client renders the latest snapshot and keeps no game state of its own, so a refresh, a reconnect or a missed event cannot leave it out of step.
Changes made in one synchronous run are coalesced, so a turn that ends and the next that starts arrive as one snapshot; nothing may count snapshots.
Only the drawing (`dg:canvas:*`) and the chat (`chat:message`, `chat:history`) travel as increments, because they are streams.
A chat line is either what a player typed or a `RoomNotice`, the facts of something that happened, which each client words in its own language ([languages](#notices-on-the-wire)).

A request that can fail takes an acknowledgement as its last argument and is answered once with a `Result`: `{ ok: true, ... }` or `{ ok: false, error: { type, message } }`.
`onClientRequest` splits the acknowledgement off (the last argument, if it is a function), answers `invalidRequest` when the arguments do not parse, and does nothing harmful when a client sent none.
Errors are never broadcast; they go to the one request that caused them.
A request dropped by the rate limiter is answered `invalidRequest` too, so a page awaiting it is not left hanging.

Names are namespaced by concern, not by game: `room:`, `lobby:`, `chat:` and `game:start` belong to the layer; `dg:` to Draw & Guess and `ms:` to Minesweeper.
`LobbyRoomInfo` and `RoomState` are the generic halves, and each game extends them (`DrawAndGuessLobbyRoomInfo` adds `rounds`) rather than carrying an untyped settings blob.

## Client

React 19 on the Zumpo design system, with no component library.
Ant Design was removed, decided by Ryan: Paper Pop shares nothing with antd's look, so theming it would have been a permanent fight, and it was most of a 1 MB main bundle.
Zumpo components are built on headless primitives, which bring keyboard and screen-reader behaviour, with our own styles from the Figma tokens.

### The design system

The design system lives in [`client/src/ui/`](../client/src/ui/index.ts), one component per Figma Shared pieces family:

- **[Base UI](https://base-ui.com) for the primitives** (select, dialog, popover, tabs, radio groups, fields, buttons).
  Radix's maintenance has slowed since its authors moved to Base UI, and React Aria is heavier than these few widgets need.
  Base UI exposes state as `data-*` attributes (`data-checked`, `data-highlighted`, `data-popup-open`), which the styles select on.
- **CSS Modules over generated custom properties.**
  `npm run design:tokens` writes `ui/generated/` from the Figma export: `tokens.css` (`--zumpo-*` colours, spacing, radii, text styles as `font` shorthands, shadows), `glyphs.ts` (icon paths), `brushes.ts` (the canvas palette, which JavaScript needs as values) and `drawings.ts` (the sample turtle drawing in the game artwork).
  `npm run verify` fails if they are stale.
- **`zumpo.css`** loads the self-hosted fonts and the tokens; the `.zumpo` class scopes the base styles and `.zumpo-page` adds the page canvas.
  Portals (select menus, dialogs, the header menu) carry `.zumpo` themselves, because they render outside the page.
- **Desktop and Phone variants are container queries**, so a component follows its own width, as Figma's `Layout` variants do, wherever a page puts it.
  Pages switch layouts at `(max-width: 640px)`, the width Figma's phone screens are drawn for, through `useMediaQuery(PHONE)` where the markup itself differs: a room's tabs instead of columns, and `FormPage`, which lays a one-question page's card straight on the page.
  Under 1024 px (`ONE_COLUMN`) a room and a game on your own are one column, and between the widths Figma draws a rigid piece scales down inside `Fit` ([design](design.md#in-code)).
- **States never change size:** hover borders, selection rings and cell outlines are inset shadows, not borders, so nothing shifts and overlays such as the pick marker cover the whole box.
- **Hover only where a pointer hovers:** every `:hover` style sits inside `@media (hover: hover)`, because a touch screen keeps it after a tap, and a card just put back would still look picked.
- **The `/design` gallery** renders every family in the states Figma draws, beside its Figma preview, and measures each specimen against the export.
  It exists only in development (the build drops it), and the Vite dev server serves `design/figma/` at `/__figma` for it.

### Routes

Routes live in [`app.tsx`](../client/src/app.tsx), on a data router so a room can intercept navigation away from it:

| Path                         | Page                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| `/`                          | Home, and every game; `?kind=` filters to one kind          |
| `/games`, `/how-to-play`     | Redirect home, for old links                                |
| `/games/:game`               | A game's page: its ways in, its rooms, live, and its rules  |
| `/games/:game/new`           | Making a room                                               |
| `/games/:game/solo`          | The game on your own; `?board=` and the like pick the setup |
| `/games/:game/rooms/:roomId` | A room, and the link a host shares                          |

Every page opens without asking for anything first: a first visit is given a random name, changed in place from the Name menu ([design](design.md#names)).
The room URL carries the game so that a page which cannot reach the room (a password, a room that moved on) still knows which game it belongs to; a link with the wrong game in it redirects to the right one.
A locked room's invite link also carries its invite key after a `#key=`, which `room:join` takes in place of the password, so a friend with the link sits straight down; Ryan approved this in #62, and the password itself only keeps strangers from the lobby list out.
The key is random, made with the room, and sent only in members' snapshots, so the password a host typed, which they may use elsewhere, never goes into a link or a browser history, and a fragment never reaches a server log.
Once seated the page drops the fragment from the address.

### Talking to the server

[`net/`](../client/src/net/) is the only code that touches the socket, typed on the wire contract's two event maps:

- **`session.tsx`** owns the one socket.
  The first page that needs the server connects it; every handshake presents the stored identity, the session goes online at `session:ready`, and the identity is kept in `sessionStorage` and the name in `localStorage` (see [identity](#identity-and-reconnection)).
  `setName` saves a new name and sends `player:rename`, which Socket.IO holds until it is back online if it is not.
  Its status (`connecting`, `online`, `reconnecting`, `failed`) is what pages show, and `connection` numbers the live connection anew on every `session:ready` (null while offline), so anything the server keeps per connection is set up again by an effect keyed on it.
- **`use-lobby.ts`** subscribes to one game's rooms while online.
- **`use-room.ts`** takes a seat: `room:sync` first, then `room:join` when the server says this player has no seat, with the invite key when the link had one, then the password page if the room still asks for one.
  It keeps the latest snapshot and when it arrived, the chat, and the drawing as a `CanvasStream`, which lives outside React because a stroke grows dozens of times a second.
  A `notRoomMember` answer after the page has held a seat means the seat was released while away, which the page reports rather than quietly rejoining.
- Requests use `emitWithAck` with a 10 second timeout, and a request that times out is treated as a failure the page can show.

A room page renders the latest `room:state` and nothing else: the client keeps no game state, advances no phase, and counts each clock down from the snapshot that carried it.
Leaving is routed through the navigation blocker, whatever started it (the Leave room button, the wordmark, the browser's back button), and it sends `room:leave` before the page goes.
Only Leave room between games goes at once; it marks its navigation with `state.via`, and anything else asks first, mid-game or not ([design](design.md#the-room-bar)).
Leaving is never done in an effect's cleanup, where React's development double-mount would give the seat up on arrival.

In production the client connects to the origin that served the page and ignores `VITE_SOCKET_URL` ([`socket.ts`](../client/src/net/socket.ts)).
Serving the client from a different host than the server needs that changed first, plus CORS.

### The drawing canvas

The canvas bitmap is 798 × 598, scaled to the screen's pixel ratio; pointer positions are mapped into that space.
It takes pointer events, so mouse, pen and touch all draw, and `touch-action: none` keeps a finger drawing rather than scrolling.
The server never echoes a drawer's own strokes, so the drawer's input is applied locally as well as sent.

## Languages

The UI speaks English and Chinese, and the player picks either from the footer's language switch on any page; their choice is kept in `localStorage` (`zumpo:locale`), and a first visit follows the browser's languages.
Everything is built so that a third language is one more catalog file, and so that the server never has to know what language anyone reads.

### The catalog

Every word a player reads comes from [`client/src/i18n/`](../client/src/i18n/index.tsx): `en/` holds the English catalog, one module per area of the app (`shell`, `home`, `games`, `room`, one per game, and so on), and `zh/` mirrors it file for file.
The catalog is plain TypeScript, not JSON: a message with values is a function, so each language orders its own sentence and handles its own plurals.
`Messages` is `typeof en`, so a key missing or misspelled in `zh/` fails `npm run typecheck` rather than showing English at runtime.
There is no runtime library: `useMessages()` returns the current language's catalog, and components read `m.room.leave` with autocomplete.
Code outside React takes the catalog as a parameter rather than importing a language.
English grammar helpers (`plural`, `countWord`) live in `en/` because they are English, and `zh/` writes its own.

What stays English on purpose: the wordmark, the footer's `zumpo. / play a little`, the home hero's FUN tiles, and the games' own content, because the Draw & Guess word bank and Daily Word's words are gameplay content; a Chinese word bank would be its own feature.
A Draw & Guess word category is an id on the wire (`Sea Life`), worded by the catalog's `drawAndGuess.category`, so its name reads 海洋生物 in Chinese while its words stay English.
So the Chinese pages say up front that Draw & Guess's words are English, in its tagline, goal, rules, waiting card and the notice as a game starts, and its artwork's word stays the English one a player would type.
The other words in the games' artwork are the reader's, from `games.artwork` in the catalog: Doodle Chain's lines are in any language.
A player's name is theirs, in any script; a first visit's random name is picked in the visitor's language, so a Chinese visitor starts as 活泼水獭 rather than Sleepy Otter.

Pages switch at once when the language changes: `LocaleProvider` wraps the app above the session, holds the locale, and sets `<html lang>` so fonts and screen readers follow.
The Paper Pop fonts have no Chinese glyphs; the font stacks end in `system-ui`, so Chinese text sets in the system's own sans (PingFang, Microsoft YaHei, Noto Sans CJK) and nothing is loaded for it.
Chinese copy puts a space between a number and the characters around it ("2 轮"), as the common style guides do.
It sets a player's name off with a space too ("Bob 加入了房间"), except 你, which runs into its verb ("你出局了"); the Liar's Dice module's `subject` helper does that where the subject may be either.
A game's terms are the ones its rules in `zh/games.ts` already use (喊“吹牛” and 丢一颗骰子, 条命, 颗雷, 单人模式, 本机记录), so a new string reuses a term rather than coining one.

### Notices on the wire

The server posts to a room's chat, and it has players reading two languages, so it never words anything.
A line nobody said is a `RoomNotice` in `shared/wire-types.d.ts`: what happened and its facts (`{ type: 'room:joined', name }`, `{ type: 'dg:guessed', name, points }`), namespaced like the events, and each client words it from its own catalog with an exhaustive discriminant switch in [`room/notice-text.ts`](../client/src/room/notice-text.ts).
`ChatMessage` is a union: a player's line carries `text`, a notice line carries `notice`, so a client cannot render one as the other.
A notice's `kind` says how loud it is, quietest first: `divider` starts a turn or a step, `system` and `score` are one quiet line (a join, a find, a hand's results), and `success` and `alert` are kept for what matters, a game over, a correct Draw & Guess guess, a mistake or a game cut short.
A game merges what happens at once into one notice, as Make 24 does for a hand and Minesweeper for a round, and the client folds a run of joins into one line ([`room/chat-lines.ts`](../client/src/room/chat-lines.ts)).
Errors stay typed by `RoomError.type` and are worded by the client; `message` is for logs.
The notice payload carries only public facts: Hush cards already discarded, a called bid and count after its reveal, and game standings after the game ends.
Player chat is rendered verbatim in both languages.
Any text the server sends that a player reads is a bug.

Tests run in English by default; the client suite and e2e players take `locale: 'zh'` for Chinese coverage.
The e2e suite includes players reading different languages in one room, history switching language, a refresh preserving the choice, and a Chinese phone visitor creating a room.
The Figma comparison is English because the Figma file is.

### Adding a language

1. Add it to `Locale` and `LOCALE_NAMES` in `i18n/locale.ts`, and teach `detectLocale` its language tags.
2. Copy `en/` to the new folder and translate; `typeof en` on each module keeps the shape honest.
3. Add random name lists in `players/random-name.ts`, each pair within the server's 18 characters.
4. Add it to `MESSAGES` in `i18n/index.tsx`; the footer switch lists `LOCALES`.

## Sound

Sound effects are a client concern from end to end: the server sends no sound events and the wire contract has none.
A page plays a sound because the snapshot it just received differs from the one before, so sound follows the server's authority instead of adding a second source of truth.
There is no music in v1, but settings and the engine are keyed by bus, so a Music bus is one more key rather than a migration.
Decided by Ryan on 2026-10-26: no paid service, no Git LFS, no audio library, AAC and Opus without MP3, effects on by default at 70%.

### The engine

[`audio/engine.ts`](../client/src/audio/engine.ts) is a small engine on the raw Web Audio API, with no library: Howler and Tone bring formats, sprites and scheduling the games do not use, and hide the one thing that matters on phones, when the context is allowed to run.

- **One graph:** each voice is a buffer source into its own gain, into the effects bus, into the master, into a limiter (a `DynamicsCompressorNode` at -1 dB, ratio 20) and out.
  The bus's gain is the volume cubed, so the slider sounds even across its range, and mute ramps the bus to 0 rather than cutting it, so nothing clicks.
- **Locked until a gesture:** no `AudioContext` exists before the first trusted activation anywhere on the page ([`session.ts`](../client/src/audio/session.ts)): a mouse's `pointerdown` or `mousedown`, a finger's or pen's `pointerup` or `touchend`, or a key other than Escape, which is what Safari and Chrome count as activation.
  A finger's `pointerdown` does not count, since a touch that turns into a scroll never activates the page.
  The context is made and resumed inside that gesture, and the listeners come back whenever it stops running (a phone call, Siri, a locked screen), so the next touch resumes it.
  A browser without Web Audio, or one that refuses a context, leaves the engine `unsupported`, and every `play` is a quiet no-op.
- **Ambient on Safari:** before the context exists the engine sets `navigator.audioSession.type = 'ambient'` where it is supported, so effects mix with the player's music, follow the silent switch, and never take over the phone's audio as a media session would.
- **Formats by decoding:** every sound ships as AAC (`.m4a`) and Opus (`.webm`).
  Before there is a context the engine guesses from a media element's `canPlayType`: Opus only where AAC is refused and Opus is not, AAC everywhere else.
  It decodes the guess first and the other format if that fails, and keeps whichever worked; `canPlayType` does not promise what `decodeAudioData` takes, and no browser the games run on lacks both.
- **Fetched ahead, decoded at the gesture:** a page's sounds are fetched as soon as the page retains them, with no context, and kept as bytes until the first gesture decodes them, so the gesture that unlocks sound waits for no network.
  A sound that cannot start soon enough after being asked for is dropped rather than played late, out of step with what caused it; how late is too late grows with the class (`LATE_MS`: `ui` 200 ms, `event` 500 ms, `stinger` 1 s), and a `hiddenTab` sound waits at least 1 s.
  A failed or late play holds back no `minGapMs`, so the next ask can still play.
- **Kept while used:** a bank stays decoded while any page retains it, and is let go 5 s after the last one does (`RELEASE_MS`), so moving between two pages that share a bank, or React's development double mount, fetches and decodes it once.
  A sound played without its bank retained is kept just as long after it plays.
- **Rules per sound:** variants are picked at random but never the same one twice in a row, `pitchSpread` detunes each play by up to that many semitones either way, `minGapMs` drops a repeat that comes too soon, and `maxVoices` stops the oldest copy past the cap with a short fade; 16 voices is the engine's own cap.
- **Steps:** a sound marked `steps` in `sounds.json` has steps for variants rather than takes (the last five seconds of a clock rising up the scale, a streak), and is played with `play(id, { variant: n })`, counting from 1 as its masters do; it may repeat, and past the last it plays the last.
  `useSounds` types such an id to need its step, and in development the engine warns when one plays without it.
  Its `minGapMs` holds a step back only against the same step, so the next step plays however soon it comes.
  Such a sound has no `pitchSpread` (the build refuses one), nor does any sound tuned to the scale, since a detuned note is out of key.
  A clock's last seconds are not derived from snapshots: the page plays them from its own timer as the seconds pass, since a snapshot does not arrive each second.
- **Hidden tabs:** nothing plays while the page is hidden except a sound marked `hiddenTab` ("your turn"), and the context resumes on return only if it ran before.
  At most one sound may be marked `hiddenTab`.
  It plays only where the browser keeps the context running in a hidden tab, as desktop browsers do; iOS suspends the context once the page goes to the background, and nothing can resume it there without a gesture, so on an iPhone it is not heard until the player comes back.
- **Other players:** `play(id, { other: true })` plays 6 dB softer (`OTHER_DB`), so what another player did reads as background to what the viewer did.

Settings are `{ effects: { volume, muted } }`, kept per browser in `localStorage` under `zumpo:sound` through [`net/storage.ts`](../client/src/net/storage.ts), as `{"v":1,...}` so a later shape can tell an old one apart.
A missing or broken bus takes its default, and a bus this build does not know is kept when it saves, so adding a bus never resets another, even from a tab still on an older build.
A change in one tab is followed by the others.

### Playing a sound

[`audio/index.ts`](../client/src/audio/index.ts) is the only import a page needs:

- **`SoundProvider`** sits under `LocaleProvider` in [`app.tsx`](../client/src/app.tsx); it owns the engine, connects it to the page's gestures and visibility, and closes it on unmount.
- **`useSounds(bank)`** keeps a bank decoded while the component is mounted and returns `play(id, options?)`, typed on that bank's ids.
- **`useSoundControls()`** gives what the settings UI needs: `available`, the engine's `state`, `settings`, `setVolume(bus, volume)` and `setMuted(bus, muted)`.
  The speaker before the viewer's avatar takes it through [`shell/sound-menu.ts`](../client/src/shell/sound-menu.ts), which `useViewer` hands to the header and the room bar, and which leaves the speaker out while `available` is false, unless it has already been shown and the engine failed after.
- **`useStateSounds(state, { derive, play, epoch, isNewGame, select?, standing?, cuts? })`** turns snapshots into sounds through a replay guard ([`replay-guard.ts`](../client/src/audio/replay-guard.ts)).
  `derive(prev, next)` returns the events between two snapshots, each with a key naming the thing that happened (`take:12`, `turn:3:bob`), and a `variant` for a step.
  The first snapshot of a page, and the first after `epoch` changes (pass the session's `connection`), only sets the baseline, so arriving, refreshing or reconnecting into a room plays nothing.
  A key that already played never plays again, so a snapshot repeated or flipped back by a reconnect is silent; the keys are kept across a reconnect, and forgotten only when `isNewGame(prev, next)` says a new game began.
  Every game must give `isNewGame`, since its keys (`take:4`) come round again in the next game, and it must work on states that are not consecutive: across a reconnect `prev` may be mid-game 1 and `next` mid-game 2, so it compares what a game leaves behind (the last game's summary, a game number), not a phase change.
  One change plays each sound at most once: events of the same sound in one change are heard once, as the viewer's own if any of them is and another player's only if all are, at the highest step any of them reached, while different sounds in one change all play.
  The server merges a run of events into one snapshot, so two players scoring at once arrive together, and the streak still climbs to the second step.
  An event may give `delayMs`, for a run that one change brings at once and that is heard one beat after another, a guess's pegs dropping in; events of one sound at different delays are each heard, and a beat still waiting when the page goes is dropped.
  A sound `cuts(sound)` says yes to, a stinger or "your turn", drops every beat still waiting as it plays, so no peg lands over it.
  `select(events)` keeps some of a change's events and drops the rest after their keys are heard, so a dropped event never plays later; `standing(state)` names the keys a state stands for on its own, which a baseline counts as heard.
  A key that comes round each round, a streak's point number, names the round too (`score:3:1`).
  The guard lives as long as the component that holds it, so `useStateSounds` belongs in the room's page, never in a component one phase mounts, or every phase change starts it over and the change into that phase is lost.

The words around sound (the settings' labels) come from the i18n catalog like any other; the engine has none.

### Sounds in a room

A room and its game are heard through one replay guard, in `RoomLayout`, which every game renders for as long as the room is open, so one snapshot is heard once, by one rule.

- **The room** ([`room/sounds.ts`](../client/src/room/sounds.ts)): somebody arriving or leaving, Ready (a stamp for yours, a pip for somebody else's), the start, your go, and the end (a win for the winners, a kind cadence for everybody else).
  A dropped connection is not a departure, so another player losing theirs is silent, and `room-leave` plays when they give up the seat or their seat's grace runs out; moving between the table and the spectator seats is neither a join nor a leave.
  Your go is the `yourTurn` a game gives `RoomLayout`, named by the game's `turnOf`, so it sounds once each time a go becomes yours; it opens the game in place of the start for the player whose go it is, since it is the one sound a hidden tab plays.
- **The game** (`<game>/sounds.ts`): a `<GAME>_SOUNDS = gameSounds({ bank, derive, isNewGame, turnOf })`, a module constant handed to `RoomLayout` as `sounds`.
  `bank` spreads `ROOM_SOUNDS` and the game's own; `derive(viewer)` is a pure `(prev, next) => events` over the game's states, which never gives "your turn" or a start or end stinger, the room's alone.
  `turnOf(state)` names the go in play, the same for everybody (`2.5`, Liar's Dice's `3.14.2` with the dice still in, since a round rolled again keeps its number).
  A game whose snapshots cannot name a go gives `newGo(prev, next)` instead: whether a snapshot begins another go.
  The page counts the goes (`useGoCount`), once per snapshot by identity and once more for each new connection, names each go by its count, and hands `derive` the go in play as a third argument (`Go`: its `count`, and the snapshot it `began` on), for keys a go cannot repeat.
  Pairs is that game: a miss leaves the board as it was, so a player's next go can read exactly as their last; its goes are counted as the go passes, a miss turns back or a go runs out, while a pair keeps the go.
  `isNewGame(prev, next)` tells two games apart where both are under way on either side of a reconnection; on one connection the room sees every start and end itself, so a snapshot from earlier in a game is never taken for a new one.
  Every key names its round or turn (`scored:1.3:p2`), the guard keeps the game's apart (`game:`), and a derive hears only what moves a turn on, so a snapshot from earlier in the turn adds nothing.

Four ways a game's sounds go quiet without an error, to keep in mind when adding one:

- A `turnOf` name must never come round again within one game, or "your turn" is silent the second time.
- It must also stay the same for the whole of a go, through every snapshot until the go passes, or "your turn" plays again mid-go: Liar's Dice counts the dice still in, not its cups, since a player already out who leaves takes a cup and no dice.
- It names a go, not a move: where a go holds several moves (a Pairs match keeps the go), a name per move plays "your turn" after each one and, standing alone, drops the move's own sound.
- A game's event with a lead sound (`room-your-turn`, `stinger-*`) is dropped, with a console warning in development, and a game that sounds its own end must be in `OWN_ENDING` in `room/sounds.ts`, or the room's end stinger plays over it (Doodle Chain's album).

On one snapshot, "your turn" and the start and end stingers stand alone: the game's events in that change are dropped, the viewer's own included, and never play later, while the room's joins, leaves and Ready play beside them.
So an opponent's move that hands you the go is heard as your go, and a take that ends a game as its end.
Several sounds of a game at once are heard as the one that matters to the viewer: the last guess and the end of a turn are one snapshot, which the guesser hears as their own and everybody else as the end.
What the viewer did plays at full level, anybody else's with `other`, and a spectator, who has no go, hears the others and the game's start and end.
Keys hold from one game's start or end to the next, so somebody who leaves and comes back, or says Ready again, in that stretch is heard the first time only; the viewer's own Ready counts their presses (`Room.readied`), so each one stamps.
A notice is never played itself: the sound comes from the snapshot change the notice reports, a `success` or `alert` event has one of its own, a dropped connection aside, a quieter one (`divider`, `system`, `score`) at most a soft one, as a join is, and typed chat is silent.
The epoch is the connection the snapshot came on (`Room.epoch`), which changes with the first snapshot after a reconnection rather than with the session, so what happened while away arrives in that snapshot and is only a baseline, and the go a page arrives on counts as heard.
A Draw & Guess close guess is a chat line rather than state, so the game's room hears it from the chat, keyed by the line's id, with `Room.chatEpoch` making each history a baseline.

Two sounds come from no snapshot.
The connection dropping and staying down for 1.5 seconds (`LOST_AFTER_MS`), each time, and the room closing under a seated player, at once, play from the room page (`useConnectionLostSound`), as live edges a refresh never repeats; a phone back from another app, or a laptop waking, reconnects within that and is silent.
The last seconds of a deadline tick from the clock: `useDeadlineTicks({ seconds, deadline, paused })` ticks `room-tick`, step 1 at 5 seconds left to step 5 at 1 (`URGENT_SECONDS`), from the seconds the clock beside it shows, so each tick lands with its digit.
A game names the deadline only for the player who must act in it (`actingDeadline`), never on an Info clock or for a spectator, and passes `paused` while reconnecting; the first seconds seen for a deadline, and after a pause, only set where it stands, and a second never ticks twice.
What the player does with their own hands, the drawer's pencil, undo and clear, plays where they do it.

Known gaps:

- A go that becomes yours during a drop of a second or two, with the tab hidden, arrives in the first snapshot after it, which is only a baseline, so it never chimes.
- Across a reconnection a Draw & Guess game is told from the last one heard by its turn, its category and everybody's points, which only grow within a game; a next game on the same turn and category where nobody's points went down is taken for the same one, and its turn's keys stay silent once. Nothing else the client sees tells two games apart.
- A game that gives no `isNewGame` keeps its keys across a reconnection that spans a whole game, until the next start or end.
- A Pairs go that ran out and came straight back to the same player, to run out again without a card, would leave every snapshot as it was, so that second go would neither chime nor say time up.
  Today's server never hands a go straight back: it passes to the next seat even when its player is away, to run out.

### Sounds on your own

A game on your own is heard by the same rules as a room, through [`solo/sounds.ts`](../client/src/solo/sounds.ts), so a refresh, or a daily puzzle restored from this device, plays nothing, however the game stood.

- **`useSoloSounds(game, end, { bank, derive })`** sits in the component that holds one game, and returns `play` for the player's own handlers.
  `bank` spreads `SOLO_BANK` (the three solo stingers) and the game's own, as `<GAME>_SOLO_BANK` in `<game>/sounds.ts`.
- **What the player does** plays in their own handlers: a key, a delete, a flag, a card or a sign picked, a note, a row turned back.
  A table or a pad shared with the game's room plays it there, so both modes sound alike (Make 24's table, Code Breaker's pad).
- **What the game does in reply** comes from `derive(prev, next)`, a pure function over the game's own state, as `derive<Game>Solo`: cells opened, a pair found, a guess's pegs, a hand solved or skipped, a miss turning back on its timer.
  Its keys name what happened uniquely within the game (`open:31`, `turn:4`), from something that only grows, such as the turns or the guesses so far.
  A pure input that may come and go, such as a flag on one cell, has no key that stays unique, so it plays in its handler instead.
- **The end** is `end`: `'complete'`, `'best'` or `'loss'`, or null while the game is on.
  A game with a best passes `finishEnd(finish)`, from what `recordBest` said: a new best only when it beat one this device kept, as the result's words say, so a first finish is a finish.
  It plays once, standing alone on its change, so the move that ends a game is heard as its end (the last pair, the mine, the code cracked).
- **The first state is only a baseline**, as a room's first snapshot is: arriving on a fresh board, or on a finished daily code, plays nothing, and its end counts as heard.
- **One game, one mount:** Play again, a new board or another code mounts a new game view (`key`), and the guard with it, so a game's keys need not name it and are never forgotten (`isNewGame` is always false).
  A page that kept one component across games would have to say when a new one began.

Four ways a game on your own replays or goes quiet without an error:

- Restore a saved game in the `useState` initialiser, never in an effect.
  A state restored after the first render is a change from the fresh one, so the last row and the end stinger play again on every load.
- Set `end` in the same handler as the move that ends the game, never in an effect.
  An end set a render later is a change of its own, after the move's, so the move plays and the stinger lands over it rather than alone.
- A page that swaps games in one component must key that component per game (`key={seed}`).
  The guard always takes two states for the same game, so a new game's keys are already heard and its moves stay silent.
- Never build a key from a count that can go down, such as Make 24's steps on the table or the digits of a typed row.
  An undo brings the count back, the key is already heard, and the move is silent the second time; count something that only grows, such as the hands played or the guesses made.

A game on your own has no deadline to act in (a run's clock counts up), so nothing ticks, and the daily puzzles are as quiet as the rest.

### The asset pipeline

Masters never enter the repository.
They live in a folder outside it, `~/Documents/assets/zumpo-audio` on the Mac mini or wherever `ZUMPO_AUDIO_DIR` says:

| Folder                       | What it holds                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `sources/<origin>/`          | What a master was made from: downloads, recordings, synth patches                                   |
| `candidates/`                | Takes being auditioned; never built                                                                 |
| `masters/<sound-id>/<n>.wav` | The variants that ship: 48 kHz WAV, 24-bit PCM or float, mono unless it needs two channels, trimmed |

Every shipped sound is one of two or three candidates (`candidates/index.json` records each one's recipe and origin), chosen in an audition page that stores a letter per sound.
Foley and Kenney candidates end in a lookahead peak limiter (1.5 ms ahead, at most 6 dB off), which rounds off an attack so the build can lift the sound closer to its class before it meets the true-peak ceiling.
`candidates/provisional-picks.json` is Claude's choice until Ryan picks, and every description says which candidate it is.
`synth/apply_picks.py PICKS.json --repo <checkout>`, run with the masters folder's own `synth/.venv/bin/python -I`, copies the picked candidates into `masters/`, rewrites those sounds' description, origin and variants in `sounds.json` while keeping their tuning, and records what is applied in `masters/picks.json`; then `npm run audio:build -- --rehash` builds them.
It also places the three solo stingers in the `solo` group and marks a sound whose catalog variants are a sequence as `steps`.

[`audio/sounds.json`](../audio/sounds.json) declares every sound, checked strictly against [`sounds.schema.json`](../audio/sounds.schema.json): its id, its group (`ui` for the shell on every page, `room` for every room, `solo` for what only plays on your own, a game's id, or `test`), the loudness class it is normalised to, a gain in dB the engine adds when it plays (0 at most, since the build already lifts each sound as far as its peak allows; tuning it needs no rebuild of the files), each variant's master and that master's SHA-256, where it came from (`cc0` with its URL and `CC0-1.0`, or `synth` or `foley` as `own`), and the optional `steps`, `pitchSpread`, `minGapMs`, `maxVoices` and `hiddenTab`.
The `ui` bank is fetched on every page before any gesture, so a sound only some pages play belongs in a bank of its own.

`npm run audio:build`, on the machine with the masters and an ffmpeg with `aac_at` and `libopus` (the Mac mini's), builds [`client/src/audio/generated/`](../client/src/audio/generated/):

- It refuses a master whose hash is not the declared one, that is not 48 kHz, that stays below -50 dBFS for more than its first 20 ms, or that is longer than its class allows.
  `--rehash` takes the masters as they are and writes their hashes into `sounds.json`.
- It normalises each variant's loudest 400 ms to its class (`ui` -22 LUFS, `event` -16, `stinger` -15), and holds the gain back where the true peak would pass -1.5 dBTP.
  It ends with a summary, per class, of how far under its target each sound lands (its worst variant, as decoded), and warns for each past 6 dB.
  The 400 ms window undercounts a click or a die that is over in 30 ms, so a gap there overstates how much quieter it sounds; judge such a sound by ear in the lab before tuning it.
- It encodes AAC with Apple's encoder and Opus with libopus, decodes both back, and refuses a file that peaks above -1 dBTP, decodes to a different length, is not its master (under 0.8 alike, by normalised correlation, where it lines up best), starts more than 2 ms away from it, or is bigger than its class allows.
  Where a file would peak too high it is encoded again a little quieter, and the manifest records the gain each format really got (`appliedGainDb`).
  Encoding is deterministic, so an unchanged master builds byte for byte the same files, and a variant whose master and processing (pipeline, loudness target, channels, bitrates, peak ceilings) have not changed is kept rather than re-encoded (`--force` re-encodes all); a class's length or size limit is checked, not hashed, so changing one re-encodes nothing.
- It writes the files, `manifest.json` (every measurement, encoder and hash) and one TypeScript bank per group, so a page imports only its own sounds and their files land in its own chunk.
  The new folder is staged in `.audio-build/` at the repository's root, outside `client/src`, and replaces the old one in one rename, and `--rehash` writes `sounds.json`, only once every sound built, so a failed or interrupted build leaves the last one whole and no stray TypeScript for the typecheck to find.

`npm run audio:check` runs in `npm run verify` and in CI, which have neither ffmpeg nor the masters: it validates `sounds.json` (with at most one `hiddenTab` sound, and the `test` group holding exactly the `test-` ids), checks that the manifest matches every declaration, that every file is named for its sound, variant and format, starts as an MP4 or WebM file does, and matches the manifest's hash and size and its class's size limit, that no file is missing or left over, and that the banks are what the manifest would write.
A failure names what drifted and says to run `audio:build` where the masters are.

The files are served as files: Vite's `assetsInlineLimit` never inlines `.m4a` or `.webm`, since the CSP's `connect-src 'self'` would refuse the `data:` URL `fetch` asks for.
The `test` group holds fixtures for the pipeline and the engine (`test-blip`), and its ids start with `test-`; only the development sound lab imports it, so the build drops it with its files, and a build that would still emit a `test-` file fails ([`vite.config.ts`](../client/vite.config.ts)).

### The sound lab

`/dev/sound`, in development only like `/design`, plays every declared sound through the real engine and settings, with a volume slider, a mute and an "as another player's" button for each.
`?bank=hush,ui` keeps only those banks, as a game's page keeps only its own; an empty `?bank=`, or a name no bank has, is said on the page rather than loading nothing quietly.
A stepped sound has a button per step.
It is where a new sound is auditioned in place, and what `npm run e2e:sound` drives on the test bank alone: Chromium and WebKit, against the Vite dev server on port 3601 (`SOUND_PORT`), checking that a page's files are fetched before any gesture and nothing plays before a real one, that the first gesture plays its sound on a slow network, that the gain reaching the speakers follows volume, mute and the other-player cut, that settings survive a reload, and that a browser without Web Audio throws nothing.
It is not in CI, to save Actions minutes; run it when the engine changes, after `npx playwright install webkit` once.
What it cannot hear is real phones: the silent switch, a call interrupting, and Bluetooth latency need an iPhone and an Android in hand.

## Configuration

Environment variables for the server are listed in [`server/README.md`](../server/README.md) and for the client in [`client/README.md`](../client/README.md).
Phase lengths are server settings because the server owns the clock; each game documents its own under "Configuration".
The test suite passes durations straight to `createZumpoServer()`, so an environment variable cannot change a suite's timing.

Production is one Node process: Vite builds into `server/build/public` and Express serves it, with Socket.IO on the same HTTP server.
`npm run build -w server` empties `server/build/` including the client bundle, so the server must build first; the root `npm run build` does it in that order.
It empties the folder rather than deleting it, and `server/tsconfig.json` names its source folders instead of `**/*.ts`, because TypeScript 7's watcher restarts on any change under a folder it watches: otherwise every e2e or design run restarts a running `npm run dev` server and loses its rooms.

### Deployment

Zumpo runs on [Render](https://render.com) as one free web service, described by [`render.yaml`](../render.yaml), at `zumpo.ryangan.me`; the steps are in the [README](../README.md#deployment).
Chosen by Ryan on 2026-10-05 to put it in front of a few testers.
The host has to keep one Node process running with open WebSockets, so serverless platforms such as Vercel or Lambda do not fit, and there must be exactly one instance, because rooms and clocks live in its memory.
Render's free plan does that with a custom domain, managed TLS and deploys from GitHub, for no money and no server to run.

What the free plan costs in behaviour:

- **It sleeps after 15 minutes without traffic**, and the next visitor waits about a minute while it starts.
  Socket.IO traffic counts as activity, so a room in play keeps it awake.
- **Every deploy and restart drops every room**, as any restart does; avoid deploying while people are playing.
  A page left open across a deploy still holds the old build: when a chunk it loads later, such as Daily Word's, is gone, it reloads once for the new one, and a missing built file is a 404 rather than the page, so a page that still fails shows the crash page with a Reload button.
- **750 instance hours a month**, enough for one service running all month.

`autoDeployTrigger: checksPass` deploys a commit on `main` only after CI has passed on it.
Render polls `/healthz` rather than `/`, so a deploy is healthy when the server answers, not merely when it can send a file.
The Node version comes from `.nvmrc`, like CI's.
Cloudflare serves the DNS for `ryangan.me`: the `zumpo` record is a CNAME to the service's `onrender.com` host, left "DNS only" so Render can issue its certificate.

## Adding a game

1. One `createXModule(ctx, ...)` returning a `GameModule`, and one line in `app.ts` registering it.
   Its engine changes state and calls `ctx.rooms.emitState(room)`; its `toRoomState(room, viewerId)` decides what each player sees.
2. A member added to `GameType`, the game's room state, lobby info and settings interfaces in the shared contract, and its event names in the two unions.
3. An entry in [`games/catalog.ts`](../client/src/games/catalog.ts), the game's fields in [`create-room.tsx`](../client/src/pages/create-room.tsx), which puts them into `settings` (the only part of a create request the server hands to a module), and a room view rendered by [`room-page.tsx`](../client/src/room/room-page.tsx) inside the shared `RoomLayout`.
4. For a game that can be played on your own: its `solo` rules in the catalog, a page in [`solo/solo-page.tsx`](../client/src/solo/solo-page.tsx) built on `SoloLayout`, and any rule code a room also runs in `shared/`.

Nothing in `libs/rooms/` should need editing.
If it does, the abstraction is wrong rather than the game unusual, and that is worth fixing rather than working around.

## Testing

Vitest on both sides.
The server suite runs real Socket.IO clients against a real server on an ephemeral port per suite, because that is where the interesting behaviour lives, and phase durations are parameters so a whole game runs in milliseconds.
Because it binds ports, it times out in sandboxes that forbid listening on localhost; run it where that is allowed before concluding a test is broken.
The client suite renders the whole app in jsdom against a fake socket ([`tests/fake-socket.ts`](../client/src/tests/fake-socket.ts)), with each test playing the server; jsdom has no 2D context, so canvas rendering is verified in a browser only.

Two serious bugs were found only by playing in a browser (a redundant hint, and the lost identity under [pitfalls](#pitfalls)), so UI and flow changes are verified end to end, not just by the suites.
`npm run e2e` does the repeatable part: [Playwright](../e2e/) builds the app, serves it as production does on port 3310 (`E2E_PORT`), and plays the main flows with each player in a browser context of their own.
Reveals are cut to a second so a whole game fits in a test, any error in a browser console fails it, and a player made `droppable` can lose the connection mid-game through `dropConnection`, which cuts both Socket.IO transports; browser offline emulation leaves an open WebSocket alone.
A state that lasts a reveal or a flash is too short to catch under the load of the full suite, so an e2e test waits for what follows it or what stays (the next round, a count, a chat line), and the page tests, whose clocks hold still, check what the passing state says.
A select menu is picked through `choose`, which waits for the menu to finish sliding in and checks that the field took the pick: a click Playwright retries scrolls the page, the menu follows, and the release can land on the backdrop and pick nothing.
A board's labels are read through `labelsIn`, in one evaluation, because `evaluateAll` finds and reads in two steps and a card can turn in between.
It checks behaviour, not looks, except for [`widths.spec.ts`](../e2e/widths.spec.ts), which plays each game and checks at seven window widths that nothing reaches out of what holds it.
`npm run e2e:sound` plays the sound engine in Chromium and WebKit, on a config of its own ([sound lab](#the-sound-lab)).
`npm run design:compare` covers looks: it drives the app into the state of each Figma screen and puts the capture beside Figma's preview ([design](design.md#comparing-with-figma)).

## Tooling

- **Vite** replaced Create React App, which pinned eslint 8 and webpack 5 and blocked React 19 and TypeScript 5+.
- **`react-router`, not `react-router-dom`:** since v7 the `-dom` package is a re-export shim, and its 7.x line pulled in a core with a high-severity advisory.
- **oxlint, not ESLint:** `typescript-eslint` refuses TypeScript 7 (support tracked for TS ≥ 7.1 in typescript-eslint#10940).
  Keeping the Go compiler beats keeping a linter, `tsc --strict` already rejects what the type-aware rules would catch, and switching back is a config file because the rule names are ESLint's.
  Revisit when typescript-eslint supports TS 7.
- **npm workspaces:** `client/` and `server/` are workspaces, each declaring its own dependencies, with one lockfile and one `node_modules` at the root.
  One `npm ci` installs everything, one dependency tree means one copy of TypeScript and Vitest, and the root scripts run either package with `-w`.
  The root `package.json` carries lint, format, orchestration and the design tools; `shared/` is not a workspace, because both sides import it by path.
- **`concurrently` for `npm run dev`:** one terminal runs the server's `tsc-watch` and Vite side by side, with labelled output, and stops both together.
- **Dependabot** opens grouped pull requests once a month for npm and the GitHub Actions ([`dependabot.yml`](../.github/dependabot.yml)): minor and patch versions together, each npm major on its own.
  CI vets each one like any other pull request.
- **Strict TypeScript** with `noImplicitAny`, `verbatimModuleSyntax` and `noUnusedLocals`.

## Pitfalls

- **`room:state` is per viewer.** Emitting it to a Socket.IO room would send the drawer's word to every guesser; call `rooms.emitState(room)` and let the registry build each player's view.
- **Snapshots are coalesced.** `emitState` sends at the end of the synchronous run, so a test waits for a snapshot that satisfies a condition rather than for the next one.
- **`socket.off(event)` without a handler removes everyone's listeners.**
  The Gamehub once cleaned up with `socket.off('connect')`, which also removed the provider's identity handshake: the socket connected, never identified, and every create, join and start was silently dropped until a hard reload.
  Today the same mistake on `session:ready` would leave the session connecting forever.
  Always pass the handler.
- **Build order:** see [configuration](#configuration).
- **Port-binding tests in sandboxes:** see [testing](#testing).
- **DM Sans has no tabular figures**, so `font-variant-numeric: tabular-nums` does nothing.
  A number that ticks in place, like the countdown, sets each digit in a fixed `1ch` cell instead, or it shifts its neighbours every second.
- **Chrome snaps an SVG box at a half pixel to a whole one**, which moves a stroke by a device pixel.
  Keep an SVG's box on whole pixels (cover the parent with `inset: 0`) and place the geometry inside it, as the pick marker's ring does with CSS `x`, `y`, `width` and `height` on its `rect`.
