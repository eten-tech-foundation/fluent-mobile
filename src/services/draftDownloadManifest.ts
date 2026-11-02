import * as FileSystem from 'expo-file-system/legacy';
import type { VerseAudioConflictStatus } from '../types/api/verseAudio';
import type { DraftDownloadRole } from '../types/draftDownload/types';
import { ensureDownloadsDir, fileExists } from './downloadStorage';

export type DraftDownloadManifestUnit = {
  bibleTextId: number;
  verseNumber: number;
  conflictStatus: VerseAudioConflictStatus;
  activeTakeId: number;
  contentHash: string;
  resourceId: string;
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

export async function writeDraftDownloadManifest(
  manifest: DraftDownloadManifest,
): Promise<string> {
  await ensureDownloadsDir(manifest.projectId);
  const path = manifestPath(manifest);
  await FileSystem.writeAsStringAsync(path, JSON.stringify(manifest));
  return path;
}

/**
 * Read + validate identity. Returns null when missing or identity mismatch
 * (prevents another account/request from consuming stale bytes).
 */
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
    return parsed;
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
    units: [],
    purgeGeneration: (previous?.purgeGeneration ?? 0) + 1,
    purged: true,
  };
  await writeDraftDownloadManifest(tombstone);
}
