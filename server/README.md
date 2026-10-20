# Zumpo server

The Express + Socket.IO server: the room layer, every game's rules and clocks, and in production the built client.
How it works is in [docs/architecture.md](../docs/architecture.md); run it from the repository root with `npm run dev` (see the [root README](../README.md)).

## Scripts

Run from the repository root as `npm run <script> -w server`.

| Script      | What it does                                                         |
| ----------- | -------------------------------------------------------------------- |
| `dev`       | Compile, then recompile and restart on every change                  |
| `build`     | Empty `build/` and compile; the root `npm run build` adds the client |
| `start`     | Run the compiled server in production mode                           |
| `typecheck` | `tsc --noEmit`, tests included                                       |
| `test`      | The Vitest suite once (`test:watch` keeps it running)                |

> **Build order matters.** `build` empties `build/`, including the client bundle in `build/public`.
> The root `npm run build` builds the server first, then the client.

## Environment variables

| Variable                  | Default                 | Purpose                                                  |
| ------------------------- | ----------------------- | -------------------------------------------------------- |
| `PORT`                    | `3000`                  | Port the HTTP and Socket.IO server listens on            |
| `CORS_ORIGIN`             | `http://localhost:3001` | Origin allowed to open a socket in development           |
| `NODE_ENV`                | -                       | `production` serves the built client from `build/public` |
| `RECONNECT_GRACE_SECONDS` | `30`                    | How long a dropped player keeps their seat               |
| `CLIENT_IP_HEADER`        | -                       | Header a proxy in front puts the client's address in     |

The server owns the game clock, so each game's phase lengths are server settings too, listed under Configuration in its rules: [Draw & Guess](../docs/games/draw-and-guess.md#configuration), [Minesweeper](../docs/games/minesweeper.md#configuration), [Make 24](../docs/games/make-24.md#configuration), [Pairs](../docs/games/pairs.md#configuration) and [Liar's Dice](../docs/games/liars-dice.md#configuration).
Shorten them to play through a whole game quickly while developing.
