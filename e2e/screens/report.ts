import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const FIGMA_DIR = path.join(ROOT, 'design/figma');
export const COMPARE_DIR = path.join(ROOT, 'design/compare');

/** Screens no state of the app shows, and why. */
const NOT_CAPTURED: Record<string, string> = {
  M06: 'A round resolves the moment the last player locks in, so "everyone locked" is never on screen.',
  SN14: 'Not a page: Snap’s game intro and home card side by side, which the game page and Home show in place.',
  GM21: 'Not a page: every state a Gomoku point can show, side by side, which the boards in GM03-GM19 show in place.',
};

/**
 * A note on a screen whose size differs from Figma's: why, and the size the
 * capture has for that reason, to a pixel. A capture of another size is a
 * difference the note does not explain, and a capture that matches Figma
 * leaves the note stale; the report flags both.
 */
interface Note {
  size: [number, number];
  reason: string;
}

const HOME_CROP =
  'Figma crops the home page to its top, around the Name menu; the capture is the whole page.';
const SOUND_HOME_CROP =
  'Figma crops the home page to its top, around the Sound menu; the capture is the whole page.';

/**
 * Screens whose size differs only because the game's state holds other
 * content than Figma's example, and how. A size difference anywhere else is
 * a layout difference to fix or to note in docs/design.md.
 */
const CONTENT: Record<string, Note> = {
  P03: { size: [1440, 1542], reason: HOME_CROP },
  P13: { size: [1440, 1542], reason: HOME_CROP },
  MO02: { size: [390, 2916], reason: HOME_CROP },
  SO01: { size: [1440, 1542], reason: SOUND_HOME_CROP },
  SO04: { size: [390, 2916], reason: SOUND_HOME_CROP },
  SO05: {
    size: [390, 1627],
    reason:
      'Figma crops the game page to its top, around the Sound menu; the capture is the whole page.',
  },
  SO06: { size: [390, 2691], reason: SOUND_HOME_CROP },
  HU08: {
    size: [1440, 1138],
    reason:
      'Every player still holds cards; Figma’s Ryan holds nothing, a shorter row.',
  },
  DW16: {
    size: [390, 1735],
    reason:
      'The test’s scores run to four digits, as three words always score, where Figma’s have three, so Sam’s “2nd place · 3 words found” beside one wraps to a second line, as a final standings row does.',
  },
  PH08: {
    size: [844, 657],
    reason:
      'Figma crops the page to the phone’s screen, the capture runs on to On this device; Chromium’s touch emulation keeps a fine pointer, so it shows the mouse’s hint where a phone shows Place stone.',
  },
};

/**
 * Screens whose size differs because code departs from Figma on purpose, as
 * docs/design.md's "On purpose" says, and which of its entries.
 */
const ON_PURPOSE: Record<string, Note> = {
  GM08: {
    size: [1440, 1259],
    reason:
      'Before a Gomoku room’s first game the stage opens with the room’s shared Waiting panel above the empty board, not a Game 1 turn bar with Start game (docs/design.md, On purpose).',
  },
};

/** Whether two sizes are the same, to a pixel. */
const near = (a: [number, number], b: [number, number]) =>
  Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1;

interface Screen {
  code: string;
  title: string;
  size: [number, number];
  /** Missing from an export made without previews. */
  preview?: string;
}

/** A screen's frame size in Figma. */
export function figmaSize(code: string): [number, number] {
  const screen = screens().find((candidate) => candidate.code === code);
  if (!screen) throw new Error(`No Figma screen ${code}`);
  return screen.size;
}

/** Every flow screen in the export, in the file's order. */
function screens(): Screen[] {
  const index = JSON.parse(
    readFileSync(path.join(FIGMA_DIR, 'index.json'), 'utf8'),
  );
  const found: Screen[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    if (node.isFlow && typeof node.code === 'string') {
      found.push(node as unknown as Screen);
    }
    Object.values(node).forEach(walk);
  };
  walk(index);
  return found;
}

/** A PNG's size, from its header. */
function pngSize(file: string): [number, number] {
  const header = readFileSync(file).subarray(16, 24);
  return [header.readUInt32BE(0), header.readUInt32BE(4)];
}

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * What the report says of a screen: its kind, which is its colour and what
 * the first line counts it as, and why.
 */
function classify(
  screen: string,
  code: [number, number] | undefined,
  figma: [number, number],
): [string, string] {
  const unseen = NOT_CAPTURED[screen];
  if (!code) {
    return unseen
      ? ['uncaptured', unseen]
      : ['missing', 'Not captured, and no reason is given.'];
  }
  const sizes = `Code is ${code[0]} × ${code[1]}, Figma ${figma[0]} × ${figma[1]}.`;
  if (unseen)
    return [
      'stale',
      `${sizes} Captured, though its note says it cannot be: ${unseen}`,
    ];
  const note = CONTENT[screen] ?? ON_PURPOSE[screen];
  if (near(code, figma)) {
    return note
      ? [
          'stale',
          `Both ${code[0]} × ${code[1]}, so its note no longer applies: ${note.reason}`,
        ]
      : ['same', `Both ${code[0]} × ${code[1]}.`];
  }
  if (!note) return ['differs', sizes];
  if (!near(code, note.size)) {
    return [
      'moved',
      `${sizes} Its note is for ${note.size[0]} × ${note.size[1]}, so it does not explain this: ${note.reason}`,
    ];
  }
  return [CONTENT[screen] ? 'content' : 'purpose', `${sizes} ${note.reason}`];
}

/**
 * design/compare/index.html: each screen's Figma preview beside its capture,
 * with the two sizes, flagged when they differ.
 */
export function writeReport() {
  const rows = screens().map((screen) => {
    const capture = path.join(COMPARE_DIR, `${screen.code}.png`);
    const preview = screen.preview && path.join(FIGMA_DIR, screen.preview);
    const figma =
      preview && existsSync(preview) ? pngSize(preview) : screen.size;
    const code = existsSync(capture) ? pngSize(capture) : undefined;
    const [kind, status] = classify(screen.code, code, figma);
    return `
<section class="${kind}" id="${screen.code}">
  <h2><a href="#${screen.code}">${screen.code}</a> ${escape(screen.title)}</h2>
  <p>${escape(status)}</p>
  <div class="pair" style="--width: ${figma[0]}px">
    ${screen.preview ? `<figure><img src="../figma/${screen.preview}" alt="" loading="lazy"><figcaption>Figma</figcaption></figure>` : ''}
    ${code ? `<figure><img src="${screen.code}.png" alt="" loading="lazy"><figcaption>Code</figcaption></figure>` : ''}
  </div>
</section>`;
  });
  const count = (kind: string) =>
    rows.filter((row) => row.includes(`class="${kind}"`)).length;
  writeFileSync(
    path.join(COMPARE_DIR, 'index.html'),
    `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Zumpo screens against Figma</title>
<style>
  body { margin: 24px; font: 14px/1.5 system-ui, sans-serif; background: #f4f1ea; color: #23211d; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 0; }
  h2 a { color: inherit; }
  section { margin: 32px 0; }
  section p { margin: 2px 0 8px; color: #6b665c; }
  .differs p, .moved p, .stale p, .missing p { color: #b3261e; }
  .content p, .purpose p, .uncaptured p { color: #8a6d1f; }
  .pair { display: flex; gap: 16px; align-items: flex-start; overflow-x: auto; }
  figure { margin: 0; flex: none; width: min(var(--width), calc(50vw - 40px)); }
  img { display: block; width: 100%; outline: 1px solid #0002; background: #fff; }
  figcaption { color: #6b665c; font-size: 12px; margin-top: 4px; }
</style>
<h1>Zumpo screens against Figma</h1>
<p>${count('same')} match Figma's size, ${count('content')} differ in content, ${count('purpose')} differ on purpose, ${count('uncaptured')} are no state of the app. Unexplained: ${count('differs')} differ in layout, ${count('moved')} differ from their note’s size, ${count('stale')} have a stale note, ${count('missing')} not captured. Generated by <code>npm run design:compare</code>.</p>
${rows.join('\n')}
`,
  );
}
