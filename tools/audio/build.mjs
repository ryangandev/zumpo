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
import { pathToFileURL } from 'node:url';
import {
  BITRATES,
  CLASSES,
  encodeKey,
  fileSha256,
  loudnessGaps,
  loudnessSummary,
  mastersRoot,
  MAX_LOUDNESS_GAP,
  NOTICE,
  outputName,
  PIPELINE,
  PRE_ENCODE_CEILING,
  readJson,
  renderModules,
  REPO,
  repoPaths,
  serializeManifest,
  TRUE_PEAK_CEILING,
  validateSounds,
} from './lib.mjs';

const RATE = 48000;
const ACCEPTED_CODECS = ['pcm_s24le', 'pcm_f32le'];
/** An AAC stream ends on a whole 1024-sample frame. */
const MAX_EXTRA_FRAMES = 1024;
/**
 * How far the decoded start may drift from the master's, in samples (2 ms):
 * a lossy codec smears a transient by a few dozen, while a priming delay the
 * encoder failed to trim is hundreds (Opus 312, AAC 1024 or more).
 */
const MAX_ONSET_DRIFT = 96;
/** How far either way the start is searched for: past any priming delay. */
const MAX_ONSET_SEARCH = 2048;
/** How much of the sound, around its peak, is lined up. */
const ONSET_WINDOW = RATE / 10;
/**
 * How alike the lined-up file must be to its master (normalised correlation,
 * 1 for the same shape at any gain): a lossy codec keeps well above it, while
 * another sound, or one whose start was cut past the search, falls under.
 */
const MIN_SIMILARITY = 0.8;
/** Leading silence past this means the master was not trimmed. */
const MAX_LEAD_SECONDS = 0.02;
/** Quieter than this (-50 dBFS) counts as silence before the sound. */
const SILENCE_FLOOR = 10 ** (-50 / 20);

/** A build that stopped for a reason a person can fix. */
export class BuildError extends Error {}

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

/**
 * How many samples later the decoded file starts than its master, and how
 * alike the two are there. The shift is the one that best lines up the 100 ms
 * of sound around the master's peak, by cross-correlation, so it holds
 * whatever gain the file was given. The peak is the attack, which only one
 * shift lines up, where a steady tone before it would line up every period. A
 * threshold crossing would not do: a soft onset with two near-equal bumps (a
 * page flip, a crumple) crosses it on one bump in the master and the other in
 * the decoded file, hundreds of samples apart while the two are perfectly in
 * line. The best shift of any two signals is somewhere, so `similarity`, the
 * correlation at it normalised to 1 for the same shape, says whether the file
 * is the master at all.
 */
export function alignment(source, data) {
  let peak = 0;
  for (let i = 1; i < source.length; i += 1) {
    if (Math.abs(source[i]) > Math.abs(source[peak])) peak = i;
  }
  const from = Math.max(
    Math.min(firstSound(source), peak),
    peak - ONSET_WINDOW / 2,
  );
  const to = Math.min(source.length, from + ONSET_WINDOW);
  let best = 0;
  let bestScore = -Infinity;
  for (let shift = -MAX_ONSET_SEARCH; shift <= MAX_ONSET_SEARCH; shift += 1) {
    let score = 0;
    for (let i = from; i < to; i += 1) {
      const j = i + shift;
      if (j >= 0 && j < data.length) score += source[i] * data[j];
    }
    if (score > bestScore) {
      bestScore = score;
      best = shift;
    }
  }
  let sourceEnergy = 0;
  let dataEnergy = 0;
  for (let i = from; i < to; i += 1) {
    sourceEnergy += source[i] ** 2;
    const j = i + best;
    if (j >= 0 && j < data.length) dataEnergy += data[j] ** 2;
  }
  const scale = Math.sqrt(sourceEnergy * dataEnergy);
  return { offset: best, similarity: scale > 0 ? bestScore / scale : 0 };
}

/** The first sample above -50 dBFS: what comes before it is silence. */
function firstSound(data) {
  const index = data.findIndex((x) => Math.abs(x) >= SILENCE_FLOOR);
  return index === -1 ? data.length : index;
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
  const lead = firstSound(source) / RATE;
  if (lead > MAX_LEAD_SECONDS) {
    throw new BuildError(
      `${label}: starts after ${lead.toFixed(3)} s of silence; trim the master.`,
    );
  }
  const measured = loudness(master);
  // A peaky master is held under the ceiling, and lands under its target;
  // the build's loudness summary says by how much.
  const gainDb = Math.min(
    target.targetLufs - measured.momentaryMax,
    PRE_ENCODE_CEILING - measured.truePeak,
  );

  const files = {};
  const decoded = {};
  const applied = {};
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
        applied[format] = gain;
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
    const { offset, similarity } = alignment(source, data);
    if (similarity < MIN_SIMILARITY) {
      throw new BuildError(
        `${label}: its ${format} is not its master: at best ${similarity.toFixed(2)} alike, under ${MIN_SIMILARITY}.`,
      );
    }
    if (Math.abs(offset) > MAX_ONSET_DRIFT) {
      throw new BuildError(
        `${label}: its ${format} starts ${offset} samples off the master.`,
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
        // The gain the class asked for, and what each file was given once
        // its true peak was checked.
        gainDb: round(gainDb),
        appliedGainDb: { m4a: round(applied.m4a), webm: round(applied.webm) },
        momentaryMax: {
          m4a: round(decoded.m4a.momentaryMax),
          webm: round(decoded.webm.momentaryMax),
        },
        truePeak: {
          m4a: round(decoded.m4a.truePeak),
          webm: round(decoded.webm.truePeak),
        },
      },
      files,
    },
  };
}

/** A variant built before from the same master and class, still intact. */
function reusable(previous, variant, sound, filesDir) {
  if (!previous) return false;
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

/**
 * Puts the folder `next` where `dir` is, through `staging` (outside any
 * source folder, so nothing left there is ever compiled or bundled). A build
 * stopped between the two renames leaves the old folder there, which the
 * next build puts back.
 */
function swapIn(next, dir, staging) {
  const old = path.join(staging, 'old');
  fs.rmSync(old, { recursive: true, force: true });
  if (fs.existsSync(dir)) fs.renameSync(dir, old);
  else fs.mkdirSync(path.dirname(dir), { recursive: true });
  fs.renameSync(next, dir);
  fs.rmSync(staging, { recursive: true, force: true });
}

function recover(dir, staging) {
  const old = path.join(staging, 'old');
  if (!fs.existsSync(dir) && fs.existsSync(old)) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    fs.renameSync(old, dir);
  }
  fs.rmSync(staging, { recursive: true, force: true });
}

/**
 * Builds the generated folder of `repo` from the masters under `root`.
 * Throws a BuildError, having written nothing, when a sound cannot be built;
 * the new folder replaces the old one only once every sound built, and only
 * then does `rehash` write the hashes into sounds.json. Returns what it did.
 */
export function buildAudio({
  repo = REPO,
  root = mastersRoot(),
  force = false,
  rehash = false,
} = {}) {
  const paths = repoPaths(repo);
  const doc = readJson(paths.sounds);
  const report = [];

  if (rehash) {
    for (const sound of doc.sounds ?? []) {
      for (const variant of sound.variants ?? []) {
        const master = path.join(root, variant.file);
        if (!fs.existsSync(master)) {
          throw new BuildError(`${sound.id}: ${master} does not exist.`);
        }
        variant.sha256 = fileSha256(master);
      }
    }
    // Written with the build, once everything checked out.
    report.push(`Wrote each master's sha256 into audio/sounds.json.`);
  }

  const problems = validateSounds(doc, readJson(paths.schema));
  if (problems.length) {
    throw new BuildError(
      `audio/sounds.json is not valid:\n  - ${problems.join('\n  - ')}`,
    );
  }

  recover(paths.outDir, paths.staging);
  let previous = { sounds: {} };
  try {
    previous = readJson(paths.manifest);
  } catch {
    // No manifest yet: everything is built.
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zumpo-audio-'));
  let encoder = null;
  const manifest = { notice: NOTICE, pipeline: PIPELINE, sounds: {} };
  try {
    for (const sound of doc.sounds.toSorted((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      const variants = [];
      for (const variant of sound.variants) {
        const before = previous.sounds?.[sound.id]?.variants?.find(
          (v) => v.source === variant.file,
        );
        if (!force && reusable(before, variant, sound, paths.filesDir)) {
          variants.push(before);
          report.push(`kept     ${sound.id} ${variant.file}`);
          continue;
        }
        encoder ??= `ffmpeg ${ffmpegVersion()} aac_at, libopus`;
        const built = buildVariant({ sound, variant, root, work, encoder });
        variants.push(built.record);
        const { loudness: l, files } = built.record;
        report.push(
          `encoded  ${sound.id} ${variant.file}: ${l.masterMomentaryMax} -> ${l.momentaryMax.m4a} / ${l.momentaryMax.webm} LUFS (gain ${l.appliedGainDb.m4a} / ${l.appliedGainDb.webm} dB), peak ${l.truePeak.m4a} / ${l.truePeak.webm} dBTP, ${files.m4a.bytes} / ${files.webm.bytes} bytes`,
        );
      }
      manifest.sounds[sound.id] = { declared: sound, variants };
    }

    // Everything checked out: only now does the repository change, as one
    // folder swapped for another, so a build cut short leaves the old one.
    const next = path.join(paths.staging, 'next');
    fs.rmSync(next, { recursive: true, force: true });
    const nextFiles = path.join(
      next,
      path.relative(paths.outDir, paths.filesDir),
    );
    fs.mkdirSync(nextFiles, { recursive: true });
    for (const sound of Object.values(manifest.sounds)) {
      for (const variant of sound.variants) {
        for (const { file } of Object.values(variant.files)) {
          const fresh = path.join(work, file);
          fs.copyFileSync(
            fs.existsSync(fresh) ? fresh : path.join(paths.filesDir, file),
            path.join(nextFiles, file),
          );
        }
      }
    }
    for (const [name, content] of renderModules(manifest)) {
      fs.writeFileSync(path.join(next, name), content);
    }
    fs.writeFileSync(
      path.join(next, path.basename(paths.manifest)),
      serializeManifest(manifest),
    );
    swapIn(next, paths.outDir, paths.staging);
    if (rehash) {
      fs.writeFileSync(paths.sounds, `${JSON.stringify(doc, null, 2)}\n`);
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  report.push(...loudnessSummary(manifest));
  const warnings = Object.values(loudnessGaps(manifest)).flatMap(({ under }) =>
    under
      .filter(({ gap }) => gap > MAX_LOUDNESS_GAP)
      .map(
        ({ id, gap }) =>
          `${id}: ${gap} dB under its target, held back by its true peak; past ${MAX_LOUDNESS_GAP} dB it is heard as quieter than its class.`,
      ),
  );
  return { manifest, report, warnings };
}

function cli() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => !['--rehash', '--force'].includes(arg));
  if (unknown.length) {
    console.error(`Unknown option ${unknown[0]}; see tools/audio/build.mjs.`);
    process.exit(2);
  }
  try {
    const { manifest, report, warnings } = buildAudio({
      force: args.includes('--force'),
      rehash: args.includes('--rehash'),
    });
    for (const line of report) console.log(line);
    for (const warning of warnings) console.warn(`warning: ${warning}`);
    console.log(
      `audio:build: ${Object.keys(manifest.sounds).length} sounds in client/src/audio/generated/.`,
    );
  } catch (error) {
    if (!(error instanceof BuildError)) throw error;
    console.error(`audio:build: ${error.message}`);
    process.exit(1);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  cli();
}
