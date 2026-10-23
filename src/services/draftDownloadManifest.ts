import * as FileSystem from 'expo-file-system/legacy';
import type { VerseAudioConflictStatus } from '../types/api/verseAudio';
import type {
  DraftAudioCoverage,
  DraftDownloadRole,
} from '../types/draftDownload/types';
import { draftAudioResourceId } from './draftDownloadIds';
import { ensureDownloadsDir, fileExists } from './downloadStorage';

export type DraftDownloadManifestUnit = {
  bibleTextId: number;
  verseNumber: number;
  conflictStatus: VerseAudioConflictStatus;
  activeTakeId: number;
  contentHash: string;
  resourceId: string;
  /** Exact active-take coverage; null for older manifests / payloads. */
  coverage: DraftAudioCoverage | null;
};

export type DraftDownloadManifest = {
  chapterAssignmentId: number;
  projectId: number;
  userId: number;
  role: DraftDownloadRole;
  projectUnitId: number;
  bibleId: number;
  bookId: number;
  bookCode: string;
  chapterNumber: number;
  units: DraftDownloadManifestUnit[];
  /** Bumped on stage-exit purge so async writers must not recreate cache. */
  purgeGeneration: number;
  /** When true, in-flight continuations must no-op. */
  purged: boolean;
  /** Observer scripture snapshot failure — retryable via the same chip tap. */
  sourceScriptureError?: string;
};

export type DraftManifestIdentity = {
  projectId: number;
  userId: number;
  chapterAssignmentId: number;
  role: DraftDownloadRole;
};

function manifestPath(identity: DraftManifestIdentity): string {
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new Error('FileSystem.documentDirectory is unavailable');
  }
  return `${root}downloads/${identity.projectId}/draft-manifest-u${identity.userId}-a${identity.chapterAssignmentId}-${identity.role}.json`;
}

function matchesIdentity(
  manifest: DraftDownloadManifest,
  identity: DraftManifestIdentity,
): boolean {
  return (
    manifest.projectId === identity.projectId &&
    manifest.userId === identity.userId &&
    manifest.chapterAssignmentId === identity.chapterAssignmentId &&
    manifest.role === identity.role
  );
}

/**
 * Every unit.resourceId must equal the exact assignment audio identity derived
 * from unit fields. Forged `draft-audio-<other-assignment>-…` ids fail closed.
 */
function unitsMatchAssignmentAudioIdentity(
  manifest: DraftDownloadManifest,
): boolean {
  for (const unit of manifest.units ?? []) {
    try {
      const expected = draftAudioResourceId(
        manifest.chapterAssignmentId,
        unit.bibleTextId,
        unit.activeTakeId,
        unit.contentHash,
      );
      if (unit.resourceId !== expected) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

export async function writeDraftDownloadManifest(
  manifest: DraftDownloadManifest,
): Promise<string> {
  await ensureDownloadsDir(manifest.projectId);
  const path = manifestPath(manifest);
  await FileSystem.writeAsStringAsync(path, JSON.stringify(manifest));
  return path;
}

/**
 * Read + validate identity and unit resource ids. Returns null when missing,
 * identity mismatch, or any unit.resourceId is not the exact assignment audio
 * identity (prevents forged/foreign draft-audio ids from being consumed).
 */
/** True when the on-disk manifest file exists (even if unreadable/invalid). */
export async function draftDownloadManifestExists(
  identity: DraftManifestIdentity,
): Promise<boolean> {
  try {
    return await fileExists(manifestPath(identity));
  } catch {
    return false;
  }
}

export async function readDraftDownloadManifest(
  identity: DraftManifestIdentity,
): Promise<DraftDownloadManifest | null> {
  try {
    const path = manifestPath(identity);
    if (!(await fileExists(path))) return null;
    const raw = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(raw) as DraftDownloadManifest;
    if (!matchesIdentity(parsed, identity)) {
      return null;
    }
    // Pre-#784 on-disk units omit coverage — normalize rather than invent ranges.
    const normalized: DraftDownloadManifest = {
      ...parsed,
      units: (parsed.units ?? []).map(unit => ({
        ...unit,
        coverage: unit.coverage ?? null,
      })),
    };
    if (!unitsMatchAssignmentAudioIdentity(normalized)) {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

export async function deleteDraftDownloadManifest(
  identity: DraftManifestIdentity,
): Promise<void> {
  const path = manifestPath(identity);
  await FileSystem.deleteAsync(path, { idempotent: true });
}

/** Write a purged tombstone so async scripture/audio writers stop. */
export async function writeDraftDownloadPurgeTombstone(
  identity: DraftManifestIdentity,
  previous: DraftDownloadManifest | null,
): Promise<void> {
  // Keep units so a failed file-delete purge can retry owned ids safely.
  const tombstone: DraftDownloadManifest = {
    chapterAssignmentId: identity.chapterAssignmentId,
    projectId: identity.projectId,
    userId: identity.userId,
    role: identity.role,
    projectUnitId: previous?.projectUnitId ?? 0,
    bibleId: previous?.bibleId ?? 0,
    bookId: previous?.bookId ?? 0,
    bookCode: previous?.bookCode ?? '',
    chapterNumber: previous?.chapterNumber ?? 0,
    units: previous?.units ?? [],
    purgeGeneration: (previous?.purgeGeneration ?? 0) + 1,
    purged: true,
  };
  await writeDraftDownloadManifest(tombstone);
}
