<p align="center">
    <img alt="Zumpo Logo" src="client/public/favicon.svg" height="auto" width="200">
</p>

<h1 align="center">Zumpo</h1>

## 🚀 About

**Zumpo** is a home for little browser games, alone or together, built with React and Node.js in TypeScript.
It hosts Draw & Guess, Minesweeper, Make 24, Pairs, Trios, Snap, Liar's Dice, Hush, Daily Word, Doodle Chain, Code Breaker and Gomoku: play on your own straight away, or open a room and send your friends the link.
Every game is short, easy to start and easy to share, and more are on the way.

Zumpo began as [**Icon**](https://github.com/ryangandev/zumpo/tree/old-version), my final project for a Web Development class at Drexel University, built in a team of three.

## 🧱 Stack

| Layer  | Tech                                                                   |
| ------ | ---------------------------------------------------------------------- |
| Client | React 19 · TypeScript 7 · Vite 8 · Base UI · Socket.io                 |
| Server | Node.js 22.22.2+, 24.15+ or 26+ · TypeScript 7 · Express 5 · Socket.io |

## 🎮 Games

| Game                                         | Players     | What it is                                                         |
| -------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| [Draw & Guess](docs/games/draw-and-guess.md) | 2–8         | One player draws a word, everyone else races to type it            |
| [Minesweeper](docs/games/minesweeper.md)     | Solo or 2–8 | Classic on your own; together, a shared board picked in secret     |
| [Make 24](docs/games/make-24.md)             | Solo or 2–8 | Four numbers and plus, minus, times, divide: make 24               |
| [Pairs](docs/games/pairs.md)                 | Solo or 2–6 | Flip two cards, remember where everything is, find every pair      |
| [Trios](docs/games/trios.md)                 | Solo or 2–8 | Twelve cards on the table: be first to spot three that make a trio |
| [Snap](docs/games/snap.md)                   | Solo or 2–6 | Every two cards share one symbol: be first to tap it               |
| [Liar's Dice](docs/games/liars-dice.md)      | Solo or 2–6 | Roll in secret, bid on the whole table, call the bluff             |
| [Hush](docs/games/hush.md)                   | 2–4         | Play every card lowest first, together, without a word             |
| [Daily Word](docs/games/daily-word.md)       | Solo or 2–8 | Six guesses for a five-letter word, one a day or a race in rooms   |
| [Doodle Chain](docs/games/doodle-chain.md)   | 3–8         | Write a line, draw it, describe it, and watch it fall apart        |
| [Code Breaker](docs/games/code-breaker.md)   | Solo or 2–8 | Ten guesses for four different digits, told only how close each is |
| [Gomoku](docs/games/gomoku.md)               | Solo or 2   | Black and White take turns: first to make five in a row wins       |

Each game is a module on a shared room layer that owns seats, ownership, the reconnect grace and the lobby.
[`docs/README.md`](docs/README.md) routes to the architecture, the current status, known issues and the roadmap.

## 🗂️ Layout

| Folder    | What it is                                                   |
| --------- | ------------------------------------------------------------ |
| `client/` | The React SPA ([README](client/README.md))                   |
| `server/` | The Express + Socket.IO server ([README](server/README.md))  |
| `shared/` | Wire types and the rule code both sides run                  |
| `e2e/`    | Playwright: two players in real browsers                     |
| `design/` | The Figma export, generated; never edited by hand            |
| `tools/`  | Figma plugins and the design token generator                 |
| `docs/`   | How it works and why, the game rules, and where things stand |

`client/` and `server/` are npm workspaces, so every command runs from the repository root.

## 🛠️ Development

Needs Node.js 24.15 or later, or 22.22.2 or later on 22, which jsdom asks of the client tests (`.nvmrc` pins the version CI uses).

```zsh
npm ci
npm run dev
```

`npm run dev` starts the server on port 3000 and the client on port 3001, each reloading on change, in one terminal.
Open http://localhost:3001.
The design system gallery is at http://localhost:3001/design while it runs.

| Command             | What it does                                                       |
| ------------------- | ------------------------------------------------------------------ |
| `npm run dev`       | Server and client, reloading on change                             |
| `npm test`          | Both Vitest suites (`npm test -w server` or `-w client` for one)   |
| `npm run lint`      | oxlint over the whole repository                                   |
| `npm run typecheck` | `tsc` over the client, the server and the browser checks           |
| `npm run format`    | Prettier, rewriting in place (`format:check` only checks)          |
| `npm run verify`    | Lint, typecheck, format check, design tokens, tests, build: the CI |
| `npm run e2e`       | Build, then play the main flows with two players in Chromium       |
| `npm run build`     | Production build: the server, then the client into it              |
| `npm start`         | Serve the production build                                         |

The `design:*` and `figma:*` commands move the design between Figma and the repository; see [docs/design.md](docs/design.md).

## 🚢 Production

```zsh
npm ci
npm run build
npm start
```

One Node process serves the built client and the Socket.IO server on port 3000 (`PORT` to change it).
The server's environment variables are in [server/README.md](server/README.md).

### Deployment

Zumpo is hosted on [Render](https://render.com)'s free plan at https://zumpo.ryangan.me, as the one web service in [`render.yaml`](render.yaml).
Why, and what the free plan means for players, is in [docs/architecture.md](docs/architecture.md#deployment).

Setting it up, once:

1. In Render: **New → Blueprint**, connect this repository, and apply `render.yaml`.
   It builds with `npm ci && npm run build`, starts with `npm start`, and deploys each commit on `main` once CI passes.
2. In Cloudflare, under DNS for `ryangan.me`: add a **CNAME** named `zumpo` pointing to the service's `onrender.com` host, with the proxy status **DNS only**.
3. Wait for Render's custom domain page to show `zumpo.ryangan.me` verified, with its certificate issued.
   The proxy can stay off; if it is turned on later, Cloudflare's SSL/TLS mode must be **Full**.

## 🗃️ Old Version

If you are interested in the original Icon, you can find it in the [old-version](https://github.com/ryangandev/zumpo/blob/old-version/README.md) branch.

## 📝 License

This project is [MIT](LICENSE) licensed.
