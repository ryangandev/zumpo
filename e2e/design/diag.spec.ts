import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, test, type Page } from '@playwright/test';

// Temporary: measures the text-width specimens that differ on Linux.
async function measure(page: Page) {
  await page.goto('/design');
  await page
    .locator('figure[data-family][data-measured]')
    .first()
    .waitFor({ timeout: 30_000 });
  await page.waitForTimeout(3000);
  return page.evaluate(async () => {
    await document.fonts.ready;
    const r = (n: number) => Math.round(n * 1000) / 1000;
    const fig = (family: string, label: string) =>
      [...document.querySelectorAll(`figure[data-family="${family}"]`)].find(
        (f) => f.querySelector('figcaption > span')?.textContent === label,
      );
    const w = (el: Element | null | undefined) =>
      el ? r(el.getBoundingClientRect().width) : -1;
    const text = (el: Element | null | undefined) => {
      if (!el) return -1;
      const range = document.createRange();
      range.selectNodeContents(el);
      return r(range.getBoundingClientRect().width);
    };
    const word = fig('wordmark', 'Default')?.querySelector('div > span');
    const count = fig('countdown', 'Tone=Running')?.querySelector('div > span');
    const marks = fig(
      'code-race-board',
      'Guessing · Marks · Column',
    )?.querySelector('div')?.firstElementChild;
    return {
      dpr: devicePixelRatio,
      wordmark: w(word),
      zumpo: text(word),
      countdown: w(count),
      time: w(count?.querySelector('[class*="_time_"]')),
      digit: w(count?.querySelector('[class*="_digit_"]')),
      colon: text(count?.querySelector('[class*="_time_"]')),
      label: w(count?.querySelector('[class*="_label_"]')),
      marks: w(marks),
      status: w(marks?.querySelector('[class*="_status_"]')),
    };
  });
}

test('diag text metrics', async ({ page, baseURL }) => {
  const out: Record<string, unknown> = {};
  const sh = (cmd: string) => {
    try {
      return execSync(cmd, { encoding: 'utf8' }).slice(0, 1500);
    } catch (error) {
      return String(error).slice(0, 300);
    }
  };
  out.fcmatch = sh(
    'fc-match --verbose "DM Sans" | grep -E "hint|antialias|rgba|lcdfilter|autohint"',
  );
  out.confd = sh('ls /etc/fonts/conf.d | grep -i -E "hint|antialias|rgba|lcd"');
  out.default = await measure(page);

  const conf = join(tmpdir(), 'zumpo-nohint.conf');
  writeFileSync(
    conf,
    `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
  <match target="pattern">
    <edit name="hinting" mode="assign"><bool>false</bool></edit>
    <edit name="hintstyle" mode="assign"><const>hintnone</const></edit>
  </match>
  <match target="font">
    <edit name="hinting" mode="assign"><bool>false</bool></edit>
    <edit name="hintstyle" mode="assign"><const>hintnone</const></edit>
  </match>
</fontconfig>
`,
  );
  const variants: [string, Parameters<typeof chromium.launch>[0]][] = [
    ['nohintConf', { env: { ...process.env, FONTCONFIG_FILE: conf } }],
    ['hintingNoneFlag', { args: ['--font-render-hinting=none'] }],
  ];
  for (const [name, options] of variants) {
    const browser = await chromium.launch(options);
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 1440, height: 900 },
    });
    out[name] = await measure(await context.newPage());
    await browser.close();
  }
  throw new Error(`DIAG ${JSON.stringify(out)}`);
});
