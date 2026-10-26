# Status

Where the project stands, what is waiting on whom, and what comes next.
Resolved items are deleted, not archived; history is in git.

## Now

The project is rebranded and redesigned as **Zumpo**; the code, packages, folder and repository carry the name.
The redesign is an editable Figma file of 259 screens and its shared component families (see [design.md](design.md)), with a snapshot in `design/figma/`.
Ryan approved it in review round two on 2026-10-03, after one fix (icons centred on their line of text).

The implementation was built on `rework` and merged into `main` on 2026-10-05 ([#26](https://github.com/ryangandev/zumpo/pull/26)).
Every page, desktop and phone, is rebuilt on the Zumpo design system in `client/src/ui/`, and Ant Design is gone ([architecture](architecture.md#client)).
Both sides speak the snapshot-driven wire contract in `shared/wire-types.d.ts` ([architecture](architecture.md#the-wire-contract)).
`npm run e2e` plays the main flows with two players, and `npm run design:compare` captures every Figma screen's state beside its preview; where code differs on purpose, [design.md](design.md#on-purpose) says so.

Four more games, chosen by Ryan on 2026-10-05, were designed in Figma (sections 07-10) and merged the same day ([#34](https://github.com/ryangandev/zumpo/pull/34)-[#38](https://github.com/ryangandev/zumpo/pull/38)): Trios, Liar's Dice, Hush and Daily Word, eight games in all.
Trios, Liar's Dice and Daily Word play on your own and in rooms; Hush is rooms only, because it needs at least two players.
Their behaviour contracts are in `docs/games/`.

A ninth game, Snap (找相同), was added on 2026-10-20: a spot-the-match race in the style of Spot It, where every two cards share exactly one symbol and the first to tap it takes the middle card ([rules](games/snap.md)).
It was designed in Figma first (section 11), and plays on your own, thirty cards against one clock, and in rooms of two to six.

A tenth game, Doodle Chain (传话画画), was added the same week: a drawing telephone where everybody writes a line, the next player draws it and the next says what the drawing shows, until the host reveals every chain ([rules](games/doodle-chain.md)).
It was designed in Figma first (section 12), and is rooms only, for three to eight players.

An eleventh game, Code Breaker (猜数字), followed on 2026-10-21: Bulls and Cows with pegs, four different digits in ten guesses ([rules](games/code-breaker.md)).
It plays on your own, one code a day for everybody and practice codes after it, and in rooms of two to eight racing the same codes, where the others see your pegs and never your digits.
Its daily calendar counts from 2026-10-21, puzzle #1.

A twelfth game, Gomoku (五子棋), followed the same day: two players take turns placing Black and White stones on a 15 by 15 board, and the first to make five in a row wins ([rules](games/gomoku.md)).
It was designed in Figma first (section 14), and plays on your own against the computer at three levels, and in rooms of two with spectators.
It brought a fourth kind of game to the home filter, Strategy.

On 2026-10-05 Ryan chose to host it for a few testers on Render's free plan, and it is live at `zumpo.ryangan.me` ([architecture](architecture.md#deployment)).
The server was hardened for that the same day ([#30](https://github.com/ryangandev/zumpo/pull/30)): a restart tells each room it closed, a duplicated tab takes over its player, what a client can make the server hold is bounded, and Render checks `/healthz`.

The name step is gone, at Ryan's request on 2026-10-05, because asking for a name before anything else was the biggest friction in the product.
A first visit is given a random adjective and animal, introduced once on Home, and anyone can change their name in place at any time, in a room too, where everyone sees it at once ([design](design.md#names)).

Every game has its own page, at Ryan's request on 2026-10-08, so you pick a game first and how to play it second ([design](design.md#what-the-screens-are-and-are-not)).
A home card opens the game's page, which holds its ways in (Play solo, Create a room), its open rooms and its rules at a glance; the old room list at the same address became that page.

The interface supports English and simplified Chinese, chosen from the footer and remembered for the browser ([languages](architecture.md#languages)).
The catalogs cover room flows, every game, solo records and accessible labels; each player renders room announcements in their own language.
The wordmark, footer slogan and English gameplay words retain their original language.
It was reviewed and played through in both languages, two players in one room, on 2026-10-07 (this session's branch), and Chinese terms now read the same across games (喊“吹牛”, 条命, 颗雷, 单人模式).

Rooms have spectator seats, at Ryan's request on 2026-10-20: up to five people watch beside the table, a latecomer to a game under way watches it, and between games anyone may move between the table and the spectator seats ([architecture](architecture.md#the-room-layer)).
Draw & Guess sums up each round as it ends, also at Ryan's request that day ([rules](games/draw-and-guess.md#the-game-loop)).
The same day Ryan decided that a Minesweeper refresh does not hold the round, so the room does not wait for a player who drops ([rules](games/minesweeper.md#leaving-dropping-and-coming-back)); that hosting stays on Render's free plan while testing; and that Draw & Guess's known issue and its word bank are left as they are for now.

A full repository audit the same day found 26 issues (A1-A26), fixed in [#50](https://github.com/ryangandev/zumpo/pull/50)-[#54](https://github.com/ryangandev/zumpo/pull/54); the last PR bound every padding, gap and radius in Figma to a variable, so A11's last raw sizes became tokens.
They covered game flow, connection limits per address, a crash page, security headers, error logging, index safety, and shared start rules.

A UI/UX review on 2026-10-21 looked at how easy each game is to pick up: eight reviewers played every screen, solo and in rooms, on desktop and phone.
It filed 63 issues ([#62](https://github.com/ryangandev/zumpo/issues/62)-[#124](https://github.com/ryangandev/zumpo/issues/124)) and a dozen follow-ups from the final checks; all are fixed and closed.
Ryan decided the product calls in it the same day: anyone can press Ready at the results and the next game starts when everybody is ready, the host can still start at once ([#114](https://github.com/ryangandev/zumpo/issues/114)); an invite link lets its holder past a room's password, through a per-room invite key ([#62](https://github.com/ryangandev/zumpo/issues/62)); Doodle Chain's describe step is 45 s; Draw & Guess spectators chat only among themselves while someone draws; solo games come first on Home, and the global How to play page is gone.
Beyond the issues, the round made the turn bar's hints never cut ([#152](https://github.com/ryangandev/zumpo/pull/152)), kept a room's board still when its game ends ([#157](https://github.com/ryangandev/zumpo/pull/157)), fitted every room to a 1440 by 900 window ([#159](https://github.com/ryangandev/zumpo/pull/159)), and brought the Figma file up to date with all of it ([#160](https://github.com/ryangandev/zumpo/pull/160)).

Draw & Guess tells a guesser who is a letter or two off the word, or types it inside a sentence, that they are close, at Ryan's request on 2026-10-26, the first item of the backlog ([rules](games/draw-and-guess.md#rules-the-server-enforces)).
The guess goes back to them alone, marked "So close!", because it all but spells the word, and the room is told "Sam is close!" once a turn; it was designed in Figma first (D17, MO21).

## Product direction

Decided by Ryan, and the frame for every design and implementation choice:

- Keep three ways to play long term: on your own, with friends, and light competition.
- Grow into a platform of web mini-games that are easy to start, short, and easy to share.
- "Short" is the product direction; it does not approve changing the current games' timings.
- "On your own" starts with solo modes for Make 24, Pairs and Minesweeper; it does not commit to offline play, a PWA, or every game supporting every mode.
- Earlier reports are a source of facts about features, not of product, brand or visual direction.

## Next

The four games Ryan chose on 2026-10-20, Snap, Doodle Chain, Code Breaker and Gomoku, are designed in Figma (sections 11-14, see [design.md](design.md#the-figma-file)) and built.
The [backlog](#backlog) is what comes next unless Ryan picks otherwise.
Each new game's behaviour contract lands in `docs/games/` with its implementation.

## Open decisions

| Decision             | Where it stands                                                                                                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting past testing | Render's free plan is for testing ([architecture](architecture.md#deployment)). Ryan's constraints: free to start, pay only once there is real demand, not all-Vercel. Once people play regularly, an always-on instance (Render's paid plans, or Fly.io from about $3 a month) removes the cold start. |
| Chinese game content | The Draw & Guess word bank and Daily Word's words stay English in both languages; a Chinese word bank, or Chinese Daily Word words, would be a feature of its own ([languages](architecture.md#languages)). Undecided.                                                                                  |
| Domain and trademark | Testing runs on Ryan's `zumpo.ryangan.me`; a domain of Zumpo's own is not checked. A Chinese name is deliberately undecided.                                                                                                                                                                            |

## Known issues

| Issue                                             | Notes                                                                                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A drawer who vanishes freezes the canvas for 10 s | The deliberate bound of the drawer hold ([architecture](architecture.md#identity-and-reconnection)). |

## Backlog

Ideas worth doing next, roughly in order:

- A longer word bank and per-room word packs; six fixed categories today, English only.

## Deliberately not doing

- Migrating to Next.js: the redesign is a UI change, and the server model does not need it.
- Accounts: a name for the browser and an identity per tab are the product.
- Horizontal scaling: rooms and clocks live in one process (see [architecture](architecture.md#code-map)).
- Changing game rules or timings as part of the redesign; rule changes are their own decisions.
