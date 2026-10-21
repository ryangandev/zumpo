# Zumpo

Little browser games, on your own or in real-time rooms (Draw & Guess, Minesweeper, Make 24, Pairs, Trios, Snap, Liar's Dice, Hush, Daily Word): a React SPA in `client/`, an Express + Socket.IO server in `server/`, shared wire types in `shared/`, all room state in server memory.
[docs/status.md](docs/status.md) says where the project stands and what comes next.

Find anything else through [docs/README.md](docs/README.md), and read only the section it points to.

## Commands

| Command                          | What it does                                                    |
| -------------------------------- | --------------------------------------------------------------- |
| `npm ci`                         | Install everything: one lockfile for `client/` and `server/`    |
| `npm run dev`                    | Server on 3000 and client on 3001, both reloading on change     |
| `npm run verify`                 | Lint, typecheck, format check, tests, build: what CI runs       |
| `npm run e2e`                    | Build, then play the main flows with two players in Chromium    |
| `npm run build` / `npm start`    | Build for production, then serve it all from one port (3000)    |
| `npm run design:compare`         | Build, then capture every Figma screen's state for side by side |
| `npm run design:import`          | Unpack the newest Figma export into `design/figma/`             |
| `npm run design:export`          | Export the Figma file through the bridge and import it          |
| `npm run design:tokens`          | Regenerate `client/src/ui/generated/` from the export           |
| `npm run figma:run -- script.js` | Run a Plugin API script in Figma through the bridge             |

Run one package's script with `-w`, for example `npm test -w server`.

## Rules that fail silently

- The server is authoritative: clocks, scoring and permissions live in `server/`, and the client never advances a phase ([why](docs/architecture.md#server-authority)).
- Rooms reach clients only through a module's `toLobbyInfo` / `toRoomState`, and `room:state` only through `rooms.emitState`, which builds each player's own view; never emit an internal room object or a room-wide snapshot, or secrets leak ([why](docs/architecture.md#server-authority)).
- Every event name and payload is declared once in `shared/wire-types.d.ts`; change both sides through it ([why](docs/architecture.md#the-wire-contract)).
- `socket.off(event)` without a handler removes every listener, including the session's own `session:ready` handler; always pass the handler ([why](docs/architecture.md#pitfalls)).
- Every word a player reads comes from the catalog in `client/src/i18n/`, typed on English so `zh/` cannot fall behind, and the server words nothing: a chat line nobody said is a `RoomNotice` the client words ([why](docs/architecture.md#languages)).
- `docs/games/` is the behaviour contract for each game; UI work must not change a rule or timing by accident ([design](docs/design.md#what-the-screens-are-and-are-not)).
- Figma is the design source of truth and `design/figma/` and `client/src/ui/generated/` are generated from it; never hand-edit either ([why](docs/design.md#figma-export)).
- Zumpo UI takes every colour, size, font and shadow from the generated `--zumpo-*` tokens; a value missing there is added in Figma, not typed into CSS ([design system](docs/design.md#in-code)).
- Server tests bind real localhost ports; a sandbox that forbids listening makes them time out, which is not a test failure ([testing](docs/architecture.md#testing)).
- Verify UI and flow changes in a real browser with two players, not just with the suites ([why](docs/architecture.md#testing)).
