# Figma bridge

Lets an agent read, render and edit the Zumpo Figma file without the Figma MCP or REST API, whose Starter-plan limits are too low.
A local server queues scripts; a development plugin open in Figma desktop runs them with the Plugin API and sends back the result, logs and any PNG or SVG exports.

```
npm run figma:run ──► server.mjs (127.0.0.1:7799) ◄── Zumpo bridge plugin in Figma desktop
```

Unlike [figma-export](../figma-export/README.md), this plugin changes the document when a script asks it to.

## Start it

1. In a terminal at the repository root: `npm run figma:bridge`, and leave it running.
2. In Figma desktop, with the Zumpo file open: Plugins → Development → Import plugin from manifest…, pick `tools/figma-bridge/manifest.json` (once).
3. Plugins → Development → Zumpo bridge, and leave its window open; the dot turns green when it reaches the server.

Pause in the plugin window stops it taking new scripts; closing the window or stopping the server ends the session.

The plugin keeps taking scripts at full speed while Figma is hidden: it asks for the next one with a request the server holds until one is queued, never on a timer, because Figma throttles timers in a window macOS reports as hidden.
With a timer, a hidden Figma took 2 seconds to pick up each script; with the held request it takes 0.1 seconds, the same as in front (measured 2026-10-26 over 12 minutes hidden).
Reopening the plugin, though, needs clicks in Figma, which nothing can make while the screen is locked, so keep the Mac that runs it unlocked.
On a machine that runs unattended, also turn App Nap off for Figma once, then restart Figma:

```bash
defaults write com.figma.Desktop NSAppSleepDisabled -bool YES
```

## Run a script

```bash
npm run figma:run -- script.js --label "what it does"
```

The script is the body of an async function; its return value is printed as JSON.
In scope:

| Name                         | What it does                                                         |
| ---------------------------- | -------------------------------------------------------------------- |
| `figma`                      | The Plugin API                                                       |
| `log(...values)`             | Printed by `run.mjs` before the result                               |
| `node(id)`                   | `getNodeByIdAsync`, throwing if the node is missing                  |
| `png(nodeOrId, path, scale)` | Exports a PNG, saved under `--out` (default: a temp folder per job)  |
| `svg(nodeOrId, path)`        | Exports an SVG the same way                                          |
| `checkpoint(title)`          | Saves a named version in the file's history; call it before any edit |
| `loadFonts(nodeOrId)`        | Loads every font used under a node, which text edits need            |

Scripts are compiled by the sandbox's own `eval`, which accepts modern syntax (optional chaining, spread, `toSorted`; checked 2026-10-03); the plugins' own `code.js` files stay ES2017 to be safe.
Follow [Editing the Figma file](../../docs/design.md#editing-the-figma-file).

## Safety

- The server listens on 127.0.0.1 only.
- Queuing a script needs the token the server writes to the system temp directory at start-up, so a web page cannot queue code; it is deleted when the server stops.
- Each script is one undo step in Figma, and edits start from a named version, so any batch can be rolled back from the version history.
