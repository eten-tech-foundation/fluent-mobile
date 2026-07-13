import { useEffect, useState, useSyncExternalStore } from 'react';
import { Directory, File, Paths } from 'expo-file-system';
import { logger } from '../utils/logger';
import {
  aacDurationMs,
  deleteAllRecordingFiles,
  deleteRecordingFile,
  extensionFromUri,
  mp4DurationMs,
  resolveRecordingUri,
} from '../services/recordingStorage';
import type { PlaybackSegment } from '../hooks/useSegmentedAudioPlayback';
import type { Recording } from '../types/db/types';

const log = logger.create('m4aSpike');

/**
 * SPIKE (#176) — throwaway scaffolding to evaluate whether a JS-only segment
 * manifest with global seek can replace the native ADTS→M4A remux.
 *
 * The flags are runtime-toggleable from the record screen (see
 * `SpikeFlagSwitcher`) so the experiments in
 * `docs/spikes/176-m4a-vs-segment-manifest.md` can be flipped on-device without
 * rebuilding. All default to `false`; when they are all off the production
 * capture / commit / playback path is completely untouched. This whole module
 * is spike-only and should be deleted with the branch's decision.
 */

export type SpikeFlagKey =
  | 'recordM4a'
  | 'keepSegmentManifest'
  | 'segmentPlayback'
  | 'skipRemux';

export type SpikeFlags = Record<SpikeFlagKey, boolean>;

/** Labels/help shown on the on-screen switcher, in display order. */
export const SPIKE_FLAG_META: {
  key: SpikeFlagKey;
  label: string;
  description: string;
}[] = [
  {
    key: 'recordM4a',
    label: 'Record .m4a',
    description:
      'Capture with the HIGH_QUALITY .m4a (mpeg4) preset instead of ADTS. Set before starting a take, then kill mid-take to confirm the classic-MP4 partial is unplayable. Combine with Keep manifest + Segment playback to try the multi-m4a logical-stream test.',
  },
  {
    key: 'keepSegmentManifest',
    label: 'Keep manifest',
    description:
      'On commit, keep the raw captured segments (ADTS or m4a) and write a JSON manifest of {uri, durationMs} instead of merging + remuxing to a single file. Segments that fail to probe (a moov-less m4a from a mid-record kill) are dropped.',
  },
  {
    key: 'segmentPlayback',
    label: 'Segment playback',
    description:
      'Drive Review playback with the JS-only segmented hook (fed by the manifest) instead of the recorder built-in single-file playback.',
  },
  {
    key: 'skipRemux',
    label: 'Skip m4a remux',
    description:
      'On commit, keep the merged ADTS take as-is (single .aac) instead of remuxing to a seekable .m4a. Lets you compare seek behaviour without the native module. No effect when Keep manifest is on.',
  },
];

const DEFAULT_SPIKE_FLAGS: SpikeFlags = {
  recordM4a: false,
  keepSegmentManifest: false,
  segmentPlayback: false,
  skipRemux: false,
};

/**
 * SPIKE (#176) — HARD override. Forces the "multiple m4a as one logical stream"
 * final test permanently ON, regardless of what is persisted or toggled from
 * the on-screen switcher:
 * - `recordM4a` — capture every segment as `.m4a` (mpeg4), not ADTS.
 * - `keepSegmentManifest` — on commit, keep the raw m4a segments + write a
 *   manifest instead of merging/remuxing.
 * - `segmentPlayback` — play the committed manifest back in sequence as a
 *   single logical take.
 *
 * These keys are pinned in {@link setSpikeFlag} so the switcher can't turn them
 * off. Set this back to `{}` (or delete it) to return to normal runtime-toggled
 * behaviour. Delete with the spike branch's decision.
 */
const HARD_FORCED_FLAGS: Partial<SpikeFlags> = {
  recordM4a: true,
  keepSegmentManifest: true,
  segmentPlayback: true,
};

// Persist the flags so they survive a force-kill — the whole point is to keep
// them set while testing crash recovery (kill the app mid-take, relaunch, and
// the same experiment is still armed). Stored in the app's op-sqlite KV.
const SPIKE_FLAGS_STORAGE_KEY = 'spike_flags_176';

type SpikeKvStore = {
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
};

let cachedStore: SpikeKvStore | null | undefined;

function getStore(): SpikeKvStore | null {
  if (cachedStore !== undefined) return cachedStore;
  try {
    // Lazy require so the native module is never loaded under Jest (op-sqlite
    // has no binding there); persistence simply no-ops in tests. Reuses the
    // app's KV database ('kv') so no extra store is provisioned.
    const { Storage } = require('@op-engineering/op-sqlite');
    cachedStore = new Storage({ location: 'kv' }) as SpikeKvStore;
  } catch {
    cachedStore = null;
  }
  return cachedStore;
}

function loadPersistedFlags(): SpikeFlags {
  const store = getStore();
  if (!store) return DEFAULT_SPIKE_FLAGS;
  try {
    const raw = store.getItemSync(SPIKE_FLAGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SPIKE_FLAGS;
    const parsed = JSON.parse(raw) as Partial<SpikeFlags>;
    return {
      recordM4a: parsed.recordM4a === true,
      keepSegmentManifest: parsed.keepSegmentManifest === true,
      segmentPlayback: parsed.segmentPlayback === true,
      skipRemux: parsed.skipRemux === true,
    };
  } catch (error) {
    log.warn('Failed to load persisted spike flags', { error });
    return DEFAULT_SPIKE_FLAGS;
  }
}

function persistFlags(flags: SpikeFlags): void {
  const store = getStore();
  if (!store) return;
  try {
    store.setItemSync(SPIKE_FLAGS_STORAGE_KEY, JSON.stringify(flags));
  } catch (error) {
    log.warn('Failed to persist spike flags', { error });
  }
}

// Persisted values load first, then the hard override pins the final-test flags
// on. Merging here (rather than in `getSnapshot`) keeps the snapshot reference
// stable for `useSyncExternalStore`.
let snapshot: SpikeFlags = { ...loadPersistedFlags(), ...HARD_FORCED_FLAGS };

const listeners = new Set<() => void>();

/** Imperative read — use inside callbacks (e.g. commit) that run outside render. */
export function getSpikeFlag(key: SpikeFlagKey): boolean {
  return snapshot[key];
}

export function setSpikeFlag(key: SpikeFlagKey, value: boolean): void {
  // Hard-forced flags ignore toggles and stay at their pinned value.
  const forced = HARD_FORCED_FLAGS[key];
  const effective = forced === undefined ? value : forced;
  if (snapshot[key] === effective) return;
  snapshot = { ...snapshot, [key]: effective };
  persistFlags(snapshot);
  listeners.forEach(listener => listener());
}

export function toggleSpikeFlag(key: SpikeFlagKey): void {
  setSpikeFlag(key, !snapshot[key]);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SpikeFlags {
  return snapshot;
}

/** Reactive read — components/hooks re-render when any flag is toggled. */
export function useSpikeFlags(): SpikeFlags {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** File extension used for the spike segment manifest sidecar. */
export const SPIKE_MANIFEST_EXTENSION = 'json';

interface SpikeManifestEntry {
  /** Playable URI (absolute file URI or a durable relative key). */
  uri: string;
  durationMs: number;
}

interface SpikeManifestFile {
  version: 1;
  segments: SpikeManifestEntry[];
}

function isManifestPath(pathOrKey: string): boolean {
  return pathOrKey.toLowerCase().endsWith(`.${SPIKE_MANIFEST_EXTENSION}`);
}

/**
 * Probes a single captured segment for its exact duration (ms), dispatching by
 * container: `.m4a`/`.mp4` are read via the MP4 `moov` (see `mp4DurationMs`),
 * anything else is treated as an ADTS bitstream. Returns `0` when the file can't
 * be parsed — for m4a that means no `moov`, i.e. a segment truncated by a
 * process kill.
 */
async function probeSegmentDurationMs(uri: string): Promise<number> {
  const ext = extensionFromUri(uri);
  if (ext === 'm4a' || ext === 'mp4' || ext === 'm4b' || ext === 'mov') {
    return mp4DurationMs(uri);
  }
  return aacDurationMs(uri);
}

/**
 * Writes a segment manifest (probing each captured segment for its exact
 * duration) into the durable store at `manifestKey`. Spike-only; mirrors
 * `moveIntoStore`'s directory handling but leaves the segment files in place.
 *
 * Segments that probe to `0` are DROPPED: an ADTS segment is self-framing so it
 * only reads as `0` when empty/unreadable, while an m4a segment reads as `0`
 * when it has no `moov` — the unplayable file a process kill leaves behind. So
 * after two mid-record kills of an m4a take (three files on disk), the manifest
 * keeps only the segments that were cleanly finalized.
 */
export async function writeSpikeManifest(
  manifestKey: string,
  segmentUris: string[],
): Promise<{ key: string; sizeBytes: number | null; totalMs: number }> {
  const segments: SpikeManifestEntry[] = [];
  for (const uri of segmentUris) {
    const probed = await probeSegmentDurationMs(uri);
    if (probed > 0) {
      segments.push({ uri, durationMs: probed });
    } else {
      log.warn('Dropping unplayable segment from manifest (no duration)', {
        uri,
      });
    }
  }
  const totalMs = segments.reduce((sum, s) => sum + s.durationMs, 0);

  const segmentsKey = manifestKey.split('/');
  const fileName = segmentsKey[segmentsKey.length - 1]!;
  const dirSegments = segmentsKey.slice(0, -1);
  const destDir = new Directory(Paths.document, ...dirSegments);
  destDir.create({ intermediates: true, idempotent: true });

  const dest = new File(destDir, fileName);
  const payload: SpikeManifestFile = { version: 1, segments };
  dest.create({ intermediates: true, overwrite: true });
  dest.write(JSON.stringify(payload));

  const size = dest.size;
  return {
    key: manifestKey,
    sizeBytes: typeof size === 'number' ? size : null,
    totalMs,
  };
}

/**
 * Resolves a committed take into a playback manifest. A manifest sidecar
 * (`.json`) is read and each entry resolved to an absolute URI; any other path
 * degenerates to a single-segment manifest using the take's stored duration.
 */
export async function resolveSpikeManifest(
  localFilePath: string,
  fallbackDurationMs: number,
): Promise<PlaybackSegment[]> {
  if (!isManifestPath(localFilePath)) {
    return [
      {
        uri: resolveRecordingUri(localFilePath),
        durationMs: fallbackDurationMs,
      },
    ];
  }

  const raw = await new File(resolveRecordingUri(localFilePath)).text();
  const parsed = JSON.parse(raw) as SpikeManifestFile;
  return parsed.segments.map(entry => ({
    uri: resolveRecordingUri(entry.uri),
    durationMs: entry.durationMs,
  }));
}

/**
 * DEBUG (#176): wipes ALL recordings — every `recordings` row, the entire
 * on-disk recordings tree, and any paused-take markers (plus their partial
 * segment files). Intended purely for on-device debug/testing (reset between
 * kill-test runs). Returns the number of DB rows removed.
 *
 * The DB / KV modules are `require`d lazily because they pull in op-sqlite,
 * which has no binding under Jest; this only runs from the on-screen debug
 * button on-device, so the test import graph stays clean.
 */
export async function clearAllRecordings(): Promise<number> {
  const {
    clearAllPausedTakes,
  }: typeof import('../services/storage') = require('../services/storage');
  const {
    deleteAllRecordings,
  }: typeof import('../db/repository') = require('../db/repository');

  try {
    const pausedSegments = clearAllPausedTakes();
    for (const uri of pausedSegments) deleteRecordingFile(uri);
  } catch (error) {
    log.warn('Failed to clear paused-take markers', { error });
  }

  deleteAllRecordingFiles();

  try {
    return await deleteAllRecordings();
  } catch (error) {
    log.error('Failed to delete recording rows', { error });
    return 0;
  }
}

/**
 * SPIKE hook. Resolves a committed take into a segment manifest for
 * `useSegmentedAudioPlayback`. Returns `null` (and does no file IO) unless the
 * `segmentPlayback` flag is on, so the production path is untouched.
 */
export function useSpikeManifest(
  recording: Recording | null,
): PlaybackSegment[] | null {
  const { segmentPlayback } = useSpikeFlags();
  const [manifest, setManifest] = useState<PlaybackSegment[] | null>(null);
  const localFilePath = recording?.localFilePath ?? null;
  const durationMs = recording?.durationMs ?? 0;

  useEffect(() => {
    if (!segmentPlayback || !localFilePath) {
      setManifest(null);
      return;
    }
    let cancelled = false;
    resolveSpikeManifest(localFilePath, durationMs)
      .then(segments => {
        if (!cancelled) setManifest(segments);
      })
      .catch(error => {
        log.warn('Failed to resolve spike manifest', { localFilePath, error });
        if (!cancelled) setManifest(null);
      });
    return () => {
      cancelled = true;
    };
  }, [segmentPlayback, localFilePath, durationMs]);

  return manifest;
}
