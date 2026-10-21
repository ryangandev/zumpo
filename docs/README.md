# Docs

Where to find the answer, without searching the repository.

## Routes

| Question                                               | Read                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| What is happening now, what is next, what is undecided | [status.md](status.md)                                                                                                          |
| Product direction                                      | [status.md#product-direction](status.md#product-direction)                                                                      |
| Known bugs and gaps                                    | [status.md#known-issues](status.md#known-issues)                                                                                |
| How client, server and shared fit together             | [architecture.md#code-map](architecture.md#code-map)                                                                            |
| Rooms, seats, lobbies, game modules                    | [architecture.md#the-room-layer](architecture.md#the-room-layer)                                                                |
| What the server enforces and why                       | [architecture.md#server-authority](architecture.md#server-authority)                                                            |
| Player identity, refresh and disconnects               | [architecture.md#identity-and-reconnection](architecture.md#identity-and-reconnection)                                          |
| Event names and payload types                          | [architecture.md#the-wire-contract](architecture.md#the-wire-contract)                                                          |
| Routes, guards and the socket on the client            | [architecture.md#client](architecture.md#client)                                                                                |
| Languages, the message catalog, notices on the wire    | [architecture.md#languages](architecture.md#languages)                                                                          |
| Environment variables, production build                | [architecture.md#configuration](architecture.md#configuration)                                                                  |
| Adding a new game                                      | [architecture.md#adding-a-game](architecture.md#adding-a-game)                                                                  |
| How to test, and what the suites cannot see            | [architecture.md#testing](architecture.md#testing)                                                                              |
| Why Vite, oxlint, react-router, separate packages      | [architecture.md#tooling](architecture.md#tooling)                                                                              |
| Draw & Guess rules, scoring, timings, code             | [games/draw-and-guess.md](games/draw-and-guess.md)                                                                              |
| Minesweeper rules, scoring, solver, code               | [games/minesweeper.md](games/minesweeper.md)                                                                                    |
| Make 24 rules, scoring, solo runs, code                | [games/make-24.md](games/make-24.md)                                                                                            |
| Pairs rules, turns, solo games, code                   | [games/pairs.md](games/pairs.md)                                                                                                |
| Trios rules, claims, hints, solo runs, code            | [games/trios.md](games/trios.md)                                                                                                |
| Snap rules, claims, lockouts, solo runs, code          | [games/snap.md](games/snap.md)                                                                                                  |
| Liar's Dice rules, the raise, the bots, code           | [games/liars-dice.md](games/liars-dice.md)                                                                                      |
| Hush rules, levels, lives, pauses, code                | [games/hush.md](games/hush.md)                                                                                                  |
| Daily Word rules, word lists, scoring, code            | [games/daily-word.md](games/daily-word.md)                                                                                      |
| Doodle Chain rules, steps, the reveal, hearts, code    | [games/doodle-chain.md](games/doodle-chain.md)                                                                                  |
| Brand, visual direction, the Figma file                | [design.md](design.md)                                                                                                          |
| The design system in code, reviewing it against Figma  | [design.md#in-code](design.md#in-code), then [architecture.md#client](architecture.md#client)                                   |
| What the Figma screens do and do not promise           | [design.md#what-the-screens-are-and-are-not](design.md#what-the-screens-are-and-are-not)                                        |
| Exporting Figma into the repo                          | [design.md#figma-export](design.md#figma-export), then [the plugin README](../tools/figma-export/README.md)                     |
| Editing the Figma file safely                          | [design.md#editing-the-figma-file](design.md#editing-the-figma-file), then [the bridge README](../tools/figma-bridge/README.md) |
| Running and deploying the app                          | [README.md](../README.md), [server/README.md](../server/README.md), [client/README.md](../client/README.md)                     |
| Where it is hosted, and why                            | [architecture.md#deployment](architecture.md#deployment), then [the README](../README.md#deployment)                            |

## Ownership

Each fact has one home; everywhere else links to it.

| Document          | Owns                                                                              |
| ----------------- | --------------------------------------------------------------------------------- |
| `AGENTS.md`       | Commands and rules that fail silently, each linking to its reason                 |
| `status.md`       | Current phase, direction, waiting items, next steps, open decisions, known issues |
| `architecture.md` | How the code works and why, per subsystem, and its pitfalls                       |
| `games/*.md`      | Each game's rules, scoring, settings and code map: the behaviour contract         |
| `design.md`       | Brand, the Figma file, the export pipeline, editing rules                         |
| `design/figma/`   | Generated design snapshot; never edited by hand                                   |

## Keeping it true

- Update the owning document in the same commit as the change it describes.
- Delete status items when they are resolved; git keeps the history.
- Keep headings stable: this table links to them.
- Put the reason for a design choice next to the subsystem in `architecture.md`, not in a separate decision log.
- Write one sentence per line in Markdown, and never use em dashes.
