import {
  getBibleTexts,
  getChapterAssignmentById,
  getChapterAssignmentsWithBooks,
} from '../db/queries';
import type {
  ChapterAssignmentData,
  ChapterListItem,
  VerseData,
} from '../types/db/types';
import type {
  DraftChapterLocalBundle,
  DraftDownloadRequest,
} from '../types/draftDownload/types';
import { getDraftChapterLocalBundle } from './draftDownload';
import { getActiveUserId, getKnownUserIds } from './storage';
import { hasProjectObserverGrant } from './userOrgGrants';

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isRegisteredActiveAccount(userId: string): boolean {
  return Boolean(userId) && getKnownUserIds().includes(userId);
}

export type ObserverDraftAccessResult =
  | {
      ok: true;
      userId: string;
      userIdNumber: number;
      assignment: ChapterAssignmentData;
    }
  | { ok: false };

/**
 * Fail-closed Observer chapter gate: registered active account, exact Project
 * Observer grant, positive IDs, and local assignment projectId match.
 * Rechecks account/grant after each await — never trusts caller identity.
 */
export async function resolveObserverDraftChapterAccess(input: {
  chapterAssignmentId: number;
  projectId: number;
}): Promise<ObserverDraftAccessResult> {
  const { chapterAssignmentId, projectId } = input;
  if (!isPositiveInt(chapterAssignmentId) || !isPositiveInt(projectId)) {
    return { ok: false };
  }

  const userIdBefore = getActiveUserId();
  if (!isRegisteredActiveAccount(userIdBefore)) {
    return { ok: false };
  }
  if (!hasProjectObserverGrant(userIdBefore, projectId)) {
    return { ok: false };
  }

  const assignment = await getChapterAssignmentById(chapterAssignmentId);

  const userIdAfter = getActiveUserId();
  if (
    userIdAfter !== userIdBefore ||
    !isRegisteredActiveAccount(userIdAfter) ||
    !hasProjectObserverGrant(userIdAfter, projectId)
  ) {
    return { ok: false };
  }

  if (
    assignment === null ||
    assignment.projectId === null ||
    assignment.projectId !== projectId ||
    !isPositiveInt(assignment.projectUnitId) ||
    !isPositiveInt(assignment.bibleId) ||
    !isPositiveInt(assignment.bookId) ||
    !isPositiveInt(assignment.chapterNumber)
  ) {
    return { ok: false };
  }

  const userIdNumber = Number(userIdAfter);
  if (!isPositiveInt(userIdNumber)) {
    return { ok: false };
  }

  return {
    ok: true,
    userId: userIdAfter,
    userIdNumber,
    assignment,
  };
}

/** Same-unit chapter list for Observer browse (IDs only — access rechecked per hop). */
export async function listObserverUnitChapters(
  projectUnitId: number,
): Promise<ChapterListItem[]> {
  if (!isPositiveInt(projectUnitId)) {
    return [];
  }
  return getChapterAssignmentsWithBooks(projectUnitId);
}

/**
 * Local bundle read only — never starts a download. Request matches published
 * DraftDownloadRequest fields with role `observer`.
 */
export async function loadObserverDraftLocalBundle(input: {
  userIdNumber: number;
  assignment: ChapterAssignmentData;
}): Promise<DraftChapterLocalBundle | null> {
  const { userIdNumber, assignment } = input;
  if (
    assignment.projectId === null ||
    !isPositiveInt(userIdNumber) ||
    !assignment.bookCode
  ) {
    return null;
  }

  const request: DraftDownloadRequest = {
    chapterAssignmentId: assignment.id,
    projectUnitId: assignment.projectUnitId,
    projectId: assignment.projectId,
    userId: userIdNumber,
    bibleId: assignment.bibleId,
    bookId: assignment.bookId,
    bookCode: assignment.bookCode,
    chapterNumber: assignment.chapterNumber,
    role: 'observer',
  };

  return getDraftChapterLocalBundle(request);
}

/**
 * Source verses from dedicated Observer scripture snapshot when present;
 * otherwise same-scope local bible_texts read (no writes/purge).
 */
export async function loadObserverSourceVerses(input: {
  assignment: ChapterAssignmentData;
  bundle: DraftChapterLocalBundle | null;
}): Promise<VerseData[]> {
  const { assignment, bundle } = input;
  const snapshot = bundle?.sourceScripture ?? null;
  // Dedicated Observer snapshot only when it matches this assignment chapter.
  if (
    snapshot !== null &&
    snapshot.bibleId === assignment.bibleId &&
    snapshot.bookId === assignment.bookId &&
    snapshot.chapterNumber === assignment.chapterNumber
  ) {
    return snapshot.verses.map(verse => ({
      bibleId: snapshot.bibleId,
      bookId: snapshot.bookId,
      chapterNumber: snapshot.chapterNumber,
      verseNumber: verse.verseNumber,
      text: verse.text,
    }));
  }
  return getBibleTexts(
    assignment.bibleId,
    assignment.bookId,
    assignment.chapterNumber,
  );
}
