#!/usr/bin/env node
// Builds client/src/audio/generated/ from audio/sounds.json and the masters
// outside the repository (ZUMPO_AUDIO_DIR, by default
// ~/Documents/assets/zumpo-audio). Needs ffmpeg with aac_at and libopus,
// which Ryan's Mac mini has; CI never runs this.
//
//   npm run audio:build               encode what changed, write the rest
//   npm run audio:build -- --rehash   first write each master's sha256 into
//                                     sounds.json (a new or replaced master)
//   npm run audio:build -- --force    encode every variant again
//
// For each variant it measures the master's loudest 400 ms (momentary
// loudness) and true peak, applies one gain to reach its loudness class,
// leaving true-peak room, encodes AAC (.m4a) and Opus (.webm), then decodes
// both back to check their peak, length and start. A variant whose master and
// class did not change is kept as it is, so tuning gainDb, minGapMs and the
// like needs neither the masters nor ffmpeg. See docs/architecture.md#sound.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BITRATES,
  CLASSES,
  encodeKey,
  fileSha256,
  mastersRoot,
  NOTICE,
  outputName,
  PIPELINE,
  PRE_ENCODE_CEILING,
  readJson,
  renderModules,
  repoPaths,
  serializeManifest,
  TRUE_PEAK_CEILING,
  validateSounds,
} from './lib.mjs';

const RATE = 48000;
const ACCEPTED_CODECS = ['pcm_s24le', 'pcm_f32le'];
/** An AAC stream ends on a whole 1024-sample frame. */
const MAX_EXTRA_FRAMES = 1024;
/** How far the decoded start may drift from the master's, in samples. */
const MAX_ONSET_DRIFT = 4;
/** Leading silence past this means the master was not trimmed. */
const MAX_LEAD_SECONDS = 0.02;

class BuildError extends Error {}

const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (!['--rehash', '--force'].includes(arg)) {
    console.error(`Unknown option ${arg}; see tools/audio/build.mjs.`);
    process.exit(2);
  }
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    maxBuffer: 1 << 28,
    encoding: 'buffer',
  });
  if (result.error) {
    throw new BuildError(
      result.error.code === 'ENOENT'
        ? `${command} is not installed; audio:build needs ffmpeg with aac_at and libopus.`
        : result.error.message,
    );
  }
  const stderr = result.stderr.toString();
  if (result.status !== 0) {
    throw new BuildError(
      `${command} ${commandArgs.join(' ')} failed:\n${stderr}`,
    );
  }
  return { stdout: result.stdout, stderr };
}

function ffmpegVersion() {
  const { stdout } = run('ffmpeg', ['-hide_banner', '-version']);
  const version = /ffmpeg version (\S+)/.exec(stdout.toString())?.[1];
  const encoders = run('ffmpeg', [
    '-hide_banner',
    '-encoders',
  ]).stdout.toString();
  for (const encoder of ['aac_at', 'libopus']) {
    if (!new RegExp(`\\s${encoder}\\s`).test(encoders)) {
      throw new BuildError(`This ffmpeg has no ${encoder} encoder.`);
    }
  }
  return version ?? 'unknown';
}

function probe(file) {
  const { stdout } = run(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=codec_name,sample_rate,channels',
      '-of',
      'json',
    ].concat(file),
  );
  const stream = JSON.parse(stdout.toString()).streams?.[0];
  if (!stream) throw new BuildError(`${file} has no audio stream.`);
  return {
    codec: stream.codec_name,
    rate: Number(stream.sample_rate),
    channels: stream.channels,
  };
}

/** The file decoded and mixed to one channel at 48 kHz. */
function samples(file) {
  const { stdout } = run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    file,
    '-f',
    'f32le',
    '-ac',
    '1',
    '-ar',
    String(RATE),
    '-',
  ]);
  return new Float32Array(
    stdout.buffer.slice(stdout.byteOffset, stdout.byteOffset + stdout.length),
  );
}

/** The first sample at a tenth of the peak: where the sound starts. */
function onset(data) {
  let peak = 0;
  for (const x of data) peak = Math.max(peak, Math.abs(x));
  return data.findIndex((x) => Math.abs(x) >= peak / 10);
}

/** The loudest 400 ms window (LUFS) and the true peak (dBTP). */
function loudness(file) {
  // Padded, so a sound shorter than the window is still measured whole.
  const { stderr } = run('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-i',
    file,
    '-af',
    'apad=pad_dur=0.5,ebur128=peak=true:framelog=info',
    '-f',
    'null',
    '-',
  ]);
  const momentary = [...stderr.matchAll(/\sM:\s*(-?[\d.]+)/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const peaks = [...stderr.matchAll(/Peak:\s*(-?[\d.]+|-inf)/g)];
  const peak = peaks.at(-1)?.[1];
  if (!momentary.length || peak === undefined) {
    throw new BuildError(`Could not measure ${file}:\n${stderr}`);
  }
  return {
    momentaryMax: Math.max(...momentary),
    truePeak: peak === '-inf' ? -Infinity : Number(peak),
  };
}

function encode(master, gainDb, format, channels, out) {
  const codec =
    format === 'm4a'
      ? ['-c:a', 'aac_at', '-b:a', BITRATES[channels].m4a]
      : [
          '-c:a',
          'libopus',
          '-b:a',
          BITRATES[channels].webm,
          '-vbr',
          'on',
          '-application',
          'audio',
        ];
  run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    master,
    '-af',
    `volume=${gainDb.toFixed(2)}dB`,
    '-map_metadata',
    '-1',
    '-fflags',
    '+bitexact',
    '-flags:a',
    '+bitexact',
    ...codec,
    out,
  ]);
}

const round = (value, places = 2) => Number(value.toFixed(places));

/** Encodes one variant into `work`, checks it, and returns its record. */
function buildVariant({ sound, variant, root, work, encoder }) {
  const label = `${sound.id} ${variant.file}`;
  const master = path.join(root, variant.file);
  if (!fs.existsSync(master)) {
    throw new BuildError(`${label}: ${master} does not exist.`);
  }
  if (fileSha256(master) !== variant.sha256) {
    throw new BuildError(
      `${label}: the master is not the one sounds.json was hashed from. If the new one is right, run npm run audio:build -- --rehash.`,
    );
  }
  const info = probe(master);
  if (!ACCEPTED_CODECS.includes(info.codec) || info.rate !== RATE) {
    throw new BuildError(
      `${label}: is ${info.codec} at ${info.rate} Hz; masters are 48 kHz WAV, 24-bit PCM or float.`,
    );
  }
  if (![1, 2].includes(info.channels)) {
    throw new BuildError(`${label}: has ${info.channels} channels; 1 or 2.`);
  }
  const target = CLASSES[sound.loudness];
  const source = samples(master);
  const frames = source.length;
  const seconds = frames / RATE;
  if (seconds > target.maxSeconds) {
    throw new BuildError(
      `${label}: is ${seconds.toFixed(2)} s; a ${sound.loudness} sound is at most ${target.maxSeconds} s.`,
    );
  }
  const sourceOnset = onset(source);
  if (sourceOnset / RATE > MAX_LEAD_SECONDS) {
    throw new BuildError(
      `${label}: starts after ${(sourceOnset / RATE).toFixed(3)} s of silence; trim the master.`,
    );
  }
  const measured = loudness(master);
  const warnings = [];
  let gainDb = target.targetLufs - measured.momentaryMax;
  if (measured.truePeak + gainDb > PRE_ENCODE_CEILING) {
    const limited = PRE_ENCODE_CEILING - measured.truePeak;
    warnings.push(
      `${label}: ${(gainDb - limited).toFixed(1)} dB under its target, held back by its true peak.`,
    );
    gainDb = limited;
  }

  const files = {};
  const decoded = {};
  for (const format of ['m4a', 'webm']) {
    const name = outputName(sound.id, variant.file, format);
    const out = path.join(work, name);
    let gain = gainDb;
    // Lossy encoding raises peaks a little; give back what it took, twice at most.
    for (let attempt = 0; ; attempt += 1) {
      encode(master, gain, format, info.channels, out);
      const check = loudness(out);
      if (check.truePeak <= TRUE_PEAK_CEILING) {
        decoded[format] = check;
        break;
      }
      if (attempt === 2) {
        throw new BuildError(
          `${label}: its ${format} peaks at ${check.truePeak} dBTP, above ${TRUE_PEAK_CEILING}.`,
        );
      }
      gain -= check.truePeak - TRUE_PEAK_CEILING + 0.1;
    }
    const data = samples(out);
    if (data.length < frames || data.length > frames + MAX_EXTRA_FRAMES) {
      throw new BuildError(
        `${label}: its ${format} decodes to ${data.length} samples, the master has ${frames}.`,
      );
    }
    if (Math.abs(onset(data) - sourceOnset) > MAX_ONSET_DRIFT) {
      throw new BuildError(
        `${label}: its ${format} starts ${onset(data) - sourceOnset} samples off the master.`,
      );
    }
    const bytes = fs.statSync(out).size;
    if (bytes > target.maxBytes) {
      throw new BuildError(
        `${label}: its ${format} is ${bytes} bytes; a ${sound.loudness} file is at most ${target.maxBytes}.`,
      );
    }
    files[format] = { file: name, sha256: fileSha256(out), bytes };
  }
  return {
    record: {
      source: variant.file,
      sourceSha256: variant.sha256,
      encodeKey: encodeKey({
        sourceSha256: variant.sha256,
        loudness: sound.loudness,
        channels: info.channels,
      }),
      encoder,
      channels: info.channels,
      frames,
      duration: round(seconds, 6),
      loudness: {
        masterMomentaryMax: round(measured.momentaryMax),
        masterTruePeak: round(measured.truePeak),
        gainDb: round(gainDb),
        momentaryMax: round(decoded.m4a.momentaryMax),
        truePeak: {
          m4a: round(decoded.m4a.truePeak),
          webm: round(decoded.webm.truePeak),
        },
      },
      files,
    },
    warnings,
  };
}

/** A variant built before from the same master and class, still intact. */
function reusable(previous, variant, sound, filesDir) {
  if (!previous || args.has('--force')) return false;
  if (previous.sourceSha256 !== variant.sha256) return false;
  const key = encodeKey({
    sourceSha256: variant.sha256,
    loudness: sound.loudness,
    channels: previous.channels,
  });
  if (previous.encodeKey !== key) return false;
  return Object.values(previous.files).every(({ file, sha256 }) => {
    const full = path.join(filesDir, file);
    return fs.existsSync(full) && fileSha256(full) === sha256;
  });
}

function main() {
  const paths = repoPaths();
  const root = mastersRoot();
  const doc = readJson(paths.sounds);

  if (args.has('--rehash')) {
    for (const sound of doc.sounds ?? []) {
      for (const variant of sound.variants ?? []) {
        const master = path.join(root, variant.file);
        if (!fs.existsSync(master)) {
          throw new BuildError(`${sound.id}: ${master} does not exist.`);
        }
        variant.sha256 = fileSha256(master);
      }
    }
    fs.writeFileSync(paths.sounds, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`Wrote each master's sha256 into audio/sounds.json.`);
  }

  const problems = validateSounds(doc, readJson(paths.schema));
  if (problems.length) {
    throw new BuildError(
      `audio/sounds.json is not valid:\n  - ${problems.join('\n  - ')}`,
    );
  }

  let previous = { sounds: {} };
  try {
    previous = readJson(paths.manifest);
  } catch {
    // No manifest yet: everything is built.
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zumpo-audio-'));
  let encoder = null;
  const manifest = { notice: NOTICE, pipeline: PIPELINE, sounds: {} };
  const warnings = [];
  const report = [];
  try {
    for (const sound of doc.sounds.toSorted((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      const variants = [];
      for (const variant of sound.variants) {
        const before = previous.sounds?.[sound.id]?.variants?.find(
          (v) => v.source === variant.file,
        );
        if (reusable(before, variant, sound, paths.filesDir)) {
          variants.push(before);
          report.push(`kept     ${sound.id} ${variant.file}`);
          continue;
        }
        encoder ??= `ffmpeg ${ffmpegVersion()} aac_at, libopus`;
        const built = buildVariant({ sound, variant, root, work, encoder });
        variants.push(built.record);
        warnings.push(...built.warnings);
        const { loudness: l, files } = built.record;
        report.push(
          `encoded  ${sound.id} ${variant.file}: ${l.masterMomentaryMax} -> ${l.momentaryMax} LUFS (gain ${l.gainDb} dB), peak ${l.truePeak.m4a} / ${l.truePeak.webm} dBTP, ${files.m4a.bytes} / ${files.webm.bytes} bytes`,
        );
      }
      manifest.sounds[sound.id] = { declared: sound, variants };
    }

    // Everything checked out: only now does the repository change.
    fs.mkdirSync(paths.filesDir, { recursive: true });
    for (const name of fs.readdirSync(work)) {
      fs.copyFileSync(path.join(work, name), path.join(paths.filesDir, name));
    }
    const keep = new Set(
      Object.values(manifest.sounds).flatMap((sound) =>
        sound.variants.flatMap((v) =>
          Object.values(v.files).map((f) => f.file),
        ),
      ),
    );
    for (const name of fs.readdirSync(paths.filesDir)) {
      if (!keep.has(name)) fs.rmSync(path.join(paths.filesDir, name));
    }
    const modules = renderModules(manifest);
    for (const name of fs.readdirSync(paths.outDir)) {
      if (name.endsWith('.ts') && !modules.has(name)) {
        fs.rmSync(path.join(paths.outDir, name));
      }
    }
    for (const [name, content] of modules) {
      fs.writeFileSync(path.join(paths.outDir, name), content);
    }
    fs.writeFileSync(paths.manifest, serializeManifest(manifest));
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }

  for (const line of report) console.log(line);
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  console.log(
    `audio:build: ${Object.keys(manifest.sounds).length} sounds in client/src/audio/generated/.`,
  );
}

try {
  main();
} catch (error) {
  if (!(error instanceof BuildError)) throw error;
  console.error(`audio:build: ${error.message}`);
  process.exit(1);
}
