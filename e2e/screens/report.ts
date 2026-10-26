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
 * Screens whose size differs only because the game's state holds other
 * content than Figma's example, and how. A size difference anywhere else is
 * a layout difference to fix or to note in docs/design.md.
 */
const CONTENT: Record<string, string> = {
  P03: 'Figma crops the home page to its top, around the Name menu; the capture is the whole page.',
  P13: 'Figma crops the home page to its top, around the Name menu; the capture is the whole page.',
  MO02: 'Figma crops the home page to its top, around the Name menu; the capture is the whole page.',
  D13: 'The chat holds the whole game, more than Figma’s example of it.',
  D14: 'The chat holds the whole game, more than Figma’s example of it.',
  D16: 'The chat holds the whole game, more than Figma’s example of it.',
  M04: 'The chat starts with the room’s join messages, which Figma leaves out.',
  MO16: 'The chat holds the round so far, which depends on who drew first; Figma’s example has six lines of talk.',
  MO14: 'Figma shows round 19, whose shorter line fits beside "Pick a cell"; round 1’s wraps.',
  MO19: 'Figma shows round 4, a mine hit and an auto-pick at 0% risk; the test’s round 2 shares one cell among four, whose longer detail wraps under the Auto-picked tag.',
  T07: 'The chat starts with the room’s join messages, which Figma leaves out.',
  T08: 'The chat starts with the room’s join messages, which Figma leaves out.',
  PR05: 'The chat starts with the room’s join messages, which Figma leaves out.',
  PR06: 'The chat starts with the room’s join messages, which Figma leaves out.',
  PR08: 'Pairs’ description takes a second line; Figma keeps the frame at the Make 24 form’s height and moves the card up.',
  TS05: 'The chat starts with the room’s join messages, which Figma leaves out.',
  TS06: 'The chat starts with the room’s join messages, which Figma leaves out.',
  TS07: 'The chat starts with the room’s join messages, which Figma leaves out.',
  TS08: 'The chat starts with the room’s join messages, which Figma leaves out.',
  TS10: 'Trios’ description takes a second line; Figma keeps the frame at the Make 24 form’s height and moves the card up.',
  SN05: 'The chat starts with the room’s join messages, which Figma leaves out.',
  SN06: 'The chat starts with the room’s join messages, which Figma leaves out.',
  SN07: 'The chat starts with the room’s join messages, which Figma leaves out.',
  SN08: 'The chat starts with the room’s join messages, which Figma leaves out.',
  SN13: 'Every room shows its spectators a banner and a Watching panel, which no Figma screen has yet; the chat starts with the join messages.',
  LD07: 'Liar’s Dice’s description takes a second line; Figma keeps the frame at the Make 24 form’s height and moves the card up.',
  LD08: 'The chat holds the game so far, from the join messages on; Figma’s example has a call and two lines of talk.',
  LD09: 'The chat holds the game so far, from the join messages on; Figma’s example has a call and three lines of talk.',
  LD10: 'The chat holds the game so far, from the join messages on; Figma’s example has two calls and two lines of talk.',
  LD11: 'The chat holds the game so far, from the join messages on; Figma’s example has a call, Ryan going out and two lines of talk.',
  HU01: 'The chat starts with the room’s join messages and holds the game so far, which Figma leaves out.',
  HU02: 'The chat starts with the room’s join messages and holds the game so far, which Figma leaves out.',
  HU03: 'The chat starts with the room’s join messages and holds the game so far, which Figma leaves out.',
  HU04: 'The chat holds the game so far, from the join messages on; Figma’s example has one level’s worth.',
  HU05: 'The chat holds the game so far, from the join messages on; Figma’s example has one level’s worth.',
  HU06: 'The chat holds the game so far, from the join messages on; Figma’s example has one level’s worth.',
  HU08: 'Every player still holds cards; Figma’s Ryan holds nothing, a shorter row.',
  DW07: 'The chat holds the game so far, from the start and the first word on; Figma’s example has two lines.',
  DW08: 'The chat holds the game so far, from the start and the first word on; Figma’s example has a few lines.',
  DW09: 'The chat holds the game so far, from the start and the first word on; Figma’s example has the second word only.',
  DW16: 'The test’s game ends in a tie, whose heading takes a third line on a phone; Figma’s Maya wins in two.',
  CB09: 'The chat holds the game so far, from the start and the first code on; Figma’s example has three lines.',
  CB10: 'The chat holds the game so far, from the start and the first code on; Figma’s example has four lines.',
  CB11: 'The chat holds the game so far, from the start and the first code on; Figma’s example has five lines.',
  PH08: 'Figma crops the page to the phone’s screen, the capture runs on to On this device; Chromium’s touch emulation keeps a fine pointer, so it shows the mouse’s hint where a phone shows Place stone.',
  CB12: 'The chat holds the game so far, from the start and the first code on; Figma’s example has five lines.',
};

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
    const differs =
      code !== undefined &&
      (code[0] !== figma[0] || Math.abs(code[1] - figma[1]) > 1);
    const content = differs ? CONTENT[screen.code] : undefined;
    const status = !code
      ? (NOT_CAPTURED[screen.code] ?? 'Not captured.')
      : differs
        ? `Code is ${code[0]} × ${code[1]}, Figma ${figma[0]} × ${figma[1]}.${content ? ` ${content}` : ''}`
        : `Both ${code[0]} × ${code[1]}.`;
    const kind = !code
      ? 'missing'
      : !differs
        ? 'same'
        : content
          ? 'content'
          : 'differs';
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
  .differs p { color: #b3261e; }
  .missing p, .content p { color: #8a6d1f; }
  .pair { display: flex; gap: 16px; align-items: flex-start; overflow-x: auto; }
  figure { margin: 0; flex: none; width: min(var(--width), calc(50vw - 40px)); }
  img { display: block; width: 100%; outline: 1px solid #0002; background: #fff; }
  figcaption { color: #6b665c; font-size: 12px; margin-top: 4px; }
</style>
<h1>Zumpo screens against Figma</h1>
<p>${count('same')} match Figma's size, ${count('differs')} differ in layout, ${count('content')} differ in content, ${count('missing')} not captured. Generated by <code>npm run design:compare</code>.</p>
${rows.join('\n')}
`,
  );
}
