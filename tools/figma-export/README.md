# Figma export plugin

A local, read-only Figma development plugin that snapshots the Zumpo design file into one zip: tokens, the Shared pieces components, every flow screen as compact JSON, every vector drawing as SVG, and optional PNG previews.
It exists because the Figma MCP and REST API limits on a Starter plan are too low to read 247 screens.
Why the output looks the way it does, and where it goes, is in [docs/design.md](../../docs/design.md#figma-export).

## Load it once

1. Open the Figma desktop app (development plugins do not load in the browser).
2. Open the file `Zumpo · Paper Pop flows`.
3. Menu: Plugins → Development → Import plugin from manifest…
4. Pick `tools/figma-export/manifest.json` from this repository.

## Run it

1. Plugins → Development → Zumpo design export.
2. Leave "Include PNG previews" on unless you only need the data.
3. Click Export and wait for the status line to show the zip size; it downloads `zumpo-figma-export-<timestamp>.zip`.
   If the download does not appear, click "Download again".
4. From the repository root:

```bash
npm run design:import
```

That takes the newest `zumpo-figma-export*.zip` in `~/Downloads` (or a path you pass after `--`), replaces `design/figma/`, and prints the counts and any warnings.
Warnings such as "Expected 247 flow frames, found 246" mean the file and the plugin disagree about what exists; check them before using the export.

## Run it through the bridge

With the [Figma bridge](../figma-bridge/README.md) connected, one command exports and imports without opening this plugin:

```bash
npm run design:export
```

[via-bridge.mjs](via-bridge.mjs) runs this plugin's own `code.js` through the bridge, minus its plugin-window wiring, zips the files the same way `ui.html` does, and hands the zip to `design:import`.
A full export with previews runs several minutes; the bridge waits up to `--timeout` seconds (default 1800) for it, and the plugin polls for nothing else while it runs.

## Guarantees

- It never changes the document: the code only reads node properties and calls `exportAsync` and `getStyledTextSegments`.
- No network access (`allowedDomains: none`); the zip is built in the plugin window.
- `code.js` targets the plugin sandbox, which lacks several modern syntax features; see the comment at its top before adding any.

## Changing it

The output format is documented in the `FORMAT.md` it writes into every export, generated from `code.js`, so the two cannot drift.
If you change the format, bump `FORMAT_VERSION` and update that text in the same commit.
