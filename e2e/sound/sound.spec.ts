import { expect, test, type Page } from '@playwright/test';

/*
 * The sound lab at /dev/sound plays every declared sound through the real
 * engine. A probe wraps the Web Audio API to see what the engine does: how
 * many contexts it made, which sources it started, and the gain from each
 * source to the speakers.
 */

interface Probe {
  contexts: number;
  starts: AudioBufferSourceNode[];
  outs: WeakMap<AudioNode, AudioNode[]>;
}

type ProbedWindow = Window & { zumpoSoundProbe: Probe };

function installProbe() {
  const probe: Probe = { contexts: 0, starts: [], outs: new WeakMap() };
  (window as unknown as ProbedWindow).zumpoSoundProbe = probe;
  const Native = window.AudioContext;
  if (typeof Native !== 'function') return;
  window.AudioContext = class extends Native {
    constructor(options?: AudioContextOptions) {
      super(options);
      probe.contexts += 1;
    }
  };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (
    this: AudioNode,
    destination: AudioNode | AudioParam,
    ...rest: number[]
  ) {
    if (destination instanceof AudioNode) {
      probe.outs.set(this, [...(probe.outs.get(this) ?? []), destination]);
    }
    return (connect as (...args: unknown[]) => AudioNode).call(
      this,
      destination,
      ...rest,
    );
  } as typeof connect;
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (
    this: AudioBufferSourceNode,
    ...args: Parameters<typeof start>
  ) {
    probe.starts.push(this);
    return start.apply(this, args);
  };
}

function removeWebAudio() {
  // A browser without Web Audio, as some embedded web views are.
  Reflect.deleteProperty(window, 'AudioContext');
  Reflect.deleteProperty(window, 'webkitAudioContext');
}

const probe = (page: Page) =>
  page.evaluate(() => {
    const { contexts, starts } = (window as unknown as ProbedWindow)
      .zumpoSoundProbe;
    return { contexts, starts: starts.length };
  });

/** The gain from the last started source to the destination, limiter aside. */
const lastGain = (page: Page) =>
  page.evaluate(() => {
    const { starts, outs } = (window as unknown as ProbedWindow)
      .zumpoSoundProbe;
    let node: AudioNode | undefined = starts.at(-1);
    let gain = 1;
    while (node) {
      if (node instanceof GainNode) gain *= node.gain.value;
      node = outs.get(node)?.[0];
    }
    return gain;
  });

const playButton = (page: Page) =>
  page.getByRole('button', { name: 'Play test-blip', exact: true });

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    // The lab runs without a game server, so the socket's failures are noise.
    if (
      message.type() === 'error' &&
      !/socket|websocket|failed to load/i.test(message.text())
    ) {
      errors.push(message.text());
    }
  });
  // Only the test bank, as a page keeps only its own: every bank would queue
  // a hundred other files ahead of test-blip's.
  await page.goto('/dev/sound?bank=test');
  await expect(playButton(page)).toBeVisible();
  return errors;
}

/** A real click somewhere quiet, which unlocks audio and decodes the bank. */
async function unlock(page: Page) {
  await page.getByRole('heading', { name: 'Sound lab' }).click();
  await expect(page.getByTestId('engine-state')).toHaveText('running');
}

/** Every sound file the page fetches, from before it loads. */
function soundFiles(page: Page) {
  const files: { url: string; ok: boolean }[] = [];
  page.on('response', (response) => {
    if (/\.(m4a|webm)$/.test(response.url())) {
      files.push({ url: response.url(), ok: response.ok() });
    }
  });
  return files;
}

/** Every sound file takes `ms` longer, as on a slow phone connection. */
async function slowSounds(page: Page, ms: number) {
  await page.route(/\.(m4a|webm)$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

test('plays nothing before a gesture, and the sound after one', async ({
  page,
}) => {
  await page.addInitScript(installProbe);
  const files = soundFiles(page);
  const errors = await open(page);
  await expect(page.getByTestId('engine-state')).toHaveText('locked');
  // The bank is fetched at once, as files, never data: URLs the CSP would
  // refuse; no context exists to decode them yet.
  await expect.poll(() => files.length).toBe(2);
  for (const file of files) {
    expect(file.ok).toBe(true);
    expect(file.url).toMatch(/^http:\/\/localhost:\d+\/.*test-blip-\d\.m4a$/);
  }

  // Input a script makes is no gesture: no context, nothing played.
  await playButton(page).evaluate((button: HTMLElement) => {
    for (const type of ['pointerdown', 'pointerup', 'mousedown']) {
      button.dispatchEvent(new PointerEvent(type, { bubbles: true }));
    }
    button.dispatchEvent(new Event('touchend', { bubbles: true }));
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'a', bubbles: true }),
    );
    button.click();
  });
  await page.waitForTimeout(300);
  expect(await probe(page)).toEqual({ contexts: 0, starts: 0 });
  await expect(page.getByTestId('engine-state')).toHaveText('locked');

  // The first gesture decodes what was fetched, and fetches nothing again.
  await unlock(page);
  await page.waitForTimeout(300);
  expect(files).toHaveLength(2);

  await playButton(page).click();
  await expect.poll(async () => (await probe(page)).starts).toBe(1);
  expect((await probe(page)).contexts).toBe(1);
  // Effects start at 70%, heard as 0.7 cubed.
  await expect.poll(() => lastGain(page)).toBeCloseTo(0.343, 2);
  expect(errors).toEqual([]);
});

test('applies the volume, the mute, and the softer other player', async ({
  page,
}) => {
  await page.addInitScript(installProbe);
  const errors = await open(page);
  await unlock(page);
  await page.waitForTimeout(300);

  await page.getByLabel('Effects volume').fill('50');
  await page.waitForTimeout(500);
  await playButton(page).click();
  await expect.poll(async () => (await probe(page)).starts).toBe(1);
  await expect.poll(() => lastGain(page)).toBeCloseTo(0.125, 3);

  // Another player's sound sits 6 dB under the viewer's own. test-blip keeps
  // 60 ms between plays, and a quicker second one is dropped.
  await page.waitForTimeout(100);
  await page
    .getByRole('button', { name: 'Play test-blip as another player’s' })
    .click();
  await expect.poll(async () => (await probe(page)).starts).toBe(2);
  await expect
    .poll(() => lastGain(page))
    .toBeCloseTo(0.125 * 10 ** (-6 / 20), 3);

  await page.getByLabel('Mute effects').check();
  await page.waitForTimeout(200);
  await playButton(page).click();
  await page.waitForTimeout(300);
  expect((await probe(page)).starts).toBe(2);

  // Remembered for this browser.
  await page.reload();
  await expect(page.getByLabel('Effects volume')).toHaveValue('50');
  await expect(page.getByLabel('Mute effects')).toBeChecked();
  expect(errors).toEqual([]);
});

test('plays at the first gesture on a slow network, from files fetched before it', async ({
  page,
}) => {
  await page.addInitScript(installProbe);
  await slowSounds(page, 250);
  const files = soundFiles(page);
  const errors = await open(page);
  await expect.poll(() => files.length).toBe(2);
  expect((await probe(page)).contexts).toBe(0);

  // The very first gesture is the play itself.
  await playButton(page).click();
  await expect.poll(async () => (await probe(page)).starts).toBe(1);
  expect(errors).toEqual([]);
});

test('plays at a first gesture that comes while its file is still on the way', async ({
  page,
}) => {
  await page.addInitScript(installProbe);
  // Under a tap's 200 ms, so the click waits for the file rather than drop it.
  await slowSounds(page, 120);
  const errors = await open(page);
  await playButton(page).click();
  await expect.poll(async () => (await probe(page)).starts).toBe(1);
  expect(errors).toEqual([]);
});

test('says unsupported and throws nothing without Web Audio', async ({
  page,
}) => {
  await page.addInitScript(removeWebAudio);
  const errors = await open(page);
  await expect(page.getByTestId('engine-state')).toHaveText('unsupported');
  await page.getByRole('heading', { name: 'Sound lab' }).click();
  await playButton(page).click();
  await page.getByLabel('Effects volume').fill('20');
  await page.waitForTimeout(300);
  await expect(page.getByTestId('engine-state')).toHaveText('unsupported');
  expect(errors).toEqual([]);
});
