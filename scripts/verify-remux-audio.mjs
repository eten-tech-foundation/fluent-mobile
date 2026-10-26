#!/usr/bin/env node
/**
 * Decode-and-measure check for remuxed (or ADTS) take audio (#719).
 *
 * Jest cannot prove remux: `src/audio/aacRemux.test.ts` only mocks `AacRemux`.
 * A remux can return a path and still be silent. This script uses ffprobe +
 * ffmpeg so a missing, unreadable, non-AAC-LC, near-silent, or full-length-
 * silent file is FAIL, never a pass.
 *
 * Usage (from repo root):
 *   npm run verify:remux-audio
 *     → checks fixtures/audio/1khz-tone.aac (known ~1s 1 kHz tone)
 *   npm run verify:remux-audio -- /path/to/take.m4a
 *   node scripts/verify-remux-audio.mjs /path/to/take.m4a
 *
 * Adb-pulled remuxed takes (Android only; package `com.eten.fluent`):
 *   adb shell "run-as com.eten.fluent ls files/recordings"
 *   adb exec-out run-as com.eten.fluent cat \
 *     files/recordings/<recordingId>.m4a > /tmp/take.m4a
 *   npm run verify:remux-audio -- /tmp/take.m4a
 *
 * Requires ffmpeg + ffprobe on PATH. The committed fixture was generated with:
 *   ffmpeg -f lavfi -i sine=frequency=1000:duration=1 \
 *     -c:a aac -b:a 128k -profile:a aac_low -ar 44100 -ac 1 \
 *     fixtures/audio/1khz-tone.aac
 *
 * Not a CI job and not an Android instrumented test. Host-side proof only.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_FIXTURE = 'fixtures/audio/1khz-tone.aac';
/** Fail when volumedetect mean_volume is at or below this (dBFS). */
export const MIN_RMS_DBFS = -50;
export const SILENCE_NOISE_DB = -50;
export const SILENCE_MIN_DURATION_S = 0.05;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {unknown} codecName
 * @param {unknown} profile
 */
export function isAacLc(codecName, profile) {
  if (String(codecName ?? '').toLowerCase() !== 'aac') {
    return false;
  }
  const text = String(profile ?? '');
  return /\bLC\b/i.test(text) || /low\s*complexity/i.test(text);
}

/**
 * Last volumedetect `mean_volume` in dBFS. `-inf` → `-Infinity`.
 * @param {string} stderr
 * @returns {number | null}
 */
export function parseMeanVolumeDbfs(stderr) {
  const matches = [
    ...String(stderr).matchAll(/mean_volume:\s*(-inf|-?\d+(?:\.\d+)?)\s*dB/gi),
  ];
  if (matches.length === 0) {
    return null;
  }
  const raw = matches[matches.length - 1][1];
  return raw.toLowerCase() === '-inf' ? Number.NEGATIVE_INFINITY : Number(raw);
}

/**
 * @param {string} stderr
 * @returns {{ start: number, end: number | null, duration: number | null }[]}
 */
export function parseSilenceIntervals(stderr) {
  const intervals = [];
  let start = null;
  for (const line of String(stderr).split(/\r?\n/)) {
    const startMatch = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/);
    if (startMatch) {
      start = Number(startMatch[1]);
      continue;
    }
    const endMatch = line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/);
    if (endMatch && start != null) {
      const end = Number(endMatch[1]);
      const durMatch = line.match(/silence_duration:\s*(-?\d+(?:\.\d+)?)/);
      intervals.push({
        start,
        end,
        duration: durMatch ? Number(durMatch[1]) : end - start,
      });
      start = null;
    }
  }
  if (start != null) {
    intervals.push({ start, end: null, duration: null });
  }
  return intervals;
}

/**
 * True when a silence window covers the whole media duration (with 5% / 50ms slop).
 * @param {{ start: number, end: number | null }[]} intervals
 * @param {number} mediaDuration
 */
export function isFullLengthSilence(intervals, mediaDuration) {
  if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) {
    return false;
  }
  const slop = Math.max(0.05, mediaDuration * 0.05);
  return intervals.some(interval => {
    const end = interval.end ?? mediaDuration;
    return interval.start <= slop && end >= mediaDuration - slop;
  });
}

/**
 * @param {unknown} probe
 * @returns {{ codecName: string | null, profile: string | null, duration: number }}
 */
export function readAudioStream(probe) {
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const audio =
    streams.find(stream => stream?.codec_type === 'audio') ?? streams[0];
  const durationRaw = audio?.duration ?? probe?.format?.duration;
  const duration = Number(durationRaw);
  return {
    codecName: audio?.codec_name ?? null,
    profile: audio?.profile ?? null,
    duration: Number.isFinite(duration) ? duration : NaN,
  };
}

function fail(message) {
  process.stderr.write(`verify-remux-audio: FAIL ${message}\n`);
  return 1;
}

function ok(message) {
  process.stdout.write(`verify-remux-audio: ok ${message}\n`);
  return 0;
}

function resolveInputPath(argv = process.argv.slice(2)) {
  const raw = argv.find(arg => !arg.startsWith('-')) ?? DEFAULT_FIXTURE;
  return path.isAbsolute(raw) ? raw : path.resolve(repoRoot, raw);
}

function commandExists(name) {
  const result = spawnSync(name, ['-version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

function runTool(name, args) {
  // Ignore stdin so ffmpeg cannot treat a closed/inherited pipe as 'q' and
  // abort before volumedetect / silencedetect flush their summaries.
  return spawnSync(name, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  });
}

/**
 * @param {string} inputPath
 * @returns {number} process exit code
 */
export function verifyRemuxAudio(inputPath) {
  if (!inputPath || !existsSync(inputPath)) {
    return fail(
      `missing input ${inputPath || '(empty)'}. Pass a take path or keep ${DEFAULT_FIXTURE}.`,
    );
  }
  if (!commandExists('ffprobe') || !commandExists('ffmpeg')) {
    return fail('ffmpeg and ffprobe must be on PATH (brew install ffmpeg).');
  }

  const probeRun = runTool('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'a:0',
    '-show_entries',
    'stream=codec_name,profile,codec_type,duration',
    '-show_entries',
    'format=duration,format_name',
    '-of',
    'json',
    inputPath,
  ]);
  if (probeRun.status !== 0) {
    return fail(
      `unreadable container (ffprobe ${probeRun.status}): ${(probeRun.stderr || probeRun.stdout || '').trim()}`,
    );
  }

  let probe;
  try {
    probe = JSON.parse(probeRun.stdout || '{}');
  } catch {
    return fail('ffprobe did not return JSON.');
  }

  const { codecName, profile, duration } = readAudioStream(probe);
  if (!codecName) {
    return fail('no audio stream.');
  }
  if (!isAacLc(codecName, profile)) {
    return fail(`expected AAC-LC, got codec=${codecName} profile=${profile}.`);
  }
  if (!(duration > 0)) {
    return fail(`duration is not readable (${duration}).`);
  }

  const volumeRun = runTool('ffmpeg', [
    '-nostdin',
    '-hide_banner',
    '-nostats',
    '-i',
    inputPath,
    '-af',
    'volumedetect',
    '-f',
    'null',
    '-',
  ]);
  const meanVolume = parseMeanVolumeDbfs(
    `${volumeRun.stderr || ''}\n${volumeRun.stdout || ''}`,
  );
  if (meanVolume == null) {
    return fail('ffmpeg volumedetect did not report mean_volume.');
  }
  if (!(meanVolume > MIN_RMS_DBFS)) {
    return fail(
      `RMS ${meanVolume} dBFS is not above ${MIN_RMS_DBFS} dBFS (silent or near-silent).`,
    );
  }

  const silenceRun = runTool('ffmpeg', [
    '-nostdin',
    '-hide_banner',
    '-nostats',
    '-i',
    inputPath,
    '-af',
    `silencedetect=noise=${SILENCE_NOISE_DB}dB:duration=${SILENCE_MIN_DURATION_S}`,
    '-f',
    'null',
    '-',
  ]);
  const intervals = parseSilenceIntervals(
    `${silenceRun.stderr || ''}\n${silenceRun.stdout || ''}`,
  );
  if (isFullLengthSilence(intervals, duration)) {
    return fail(
      `full-length silence (${duration.toFixed(3)}s at ${SILENCE_NOISE_DB} dB).`,
    );
  }

  return ok(
    `${path.basename(inputPath)} AAC-LC ${duration.toFixed(3)}s RMS ${meanVolume} dBFS`,
  );
}

const isMain =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);

if (isMain) {
  process.exit(verifyRemuxAudio(resolveInputPath()));
}
