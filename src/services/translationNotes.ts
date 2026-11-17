import type { ApiTranslationNoteItem } from '../types/api/translationResources';
import type { TranslationNoteItem } from '../types/resources/translationNotes';
import { tipTapToPlainText } from '../utils/aquiferTipTapText';
import {
  normalizeVerseRefs,
  verseRefsFromChapter,
  type ResourceVerseRef,
} from '../utils/loadResourcesForVerseRange';
import { logger } from '../utils/logger';
import { FluentAPI } from './api';
import { authToken } from './authToken';
import { findDownloadedRows, readDownloadedJson } from './offlineResources';
import { reusePassageResource } from './passageResourceReuse';
import { getActiveUserId } from './storage';

const log = logger.create('translationNotes');

const DEFAULT_TN_LANGUAGE_CODE = 'eng';

/**
 * Most note requests in flight at once, shared by every load (#901), so a
 * unit switch can't stack a new chapter's requests on the old one's.
 */
export const TRANSLATION_NOTES_MAX_REQUESTS_IN_FLIGHT = 4;

export type TranslationNotesLoadResult = {
  /** Readable notes, in verse order, each on the first verse that has it. */
  notes: TranslationNoteItem[];
  /** Every ref asked for, in verse order. */
  refs: ResourceVerseRef[];
  /** Lookups that finished, from downloads or the API, empty ones included. */
  succeededRefs: ResourceVerseRef[];
  /** Requests that failed; a retry asks for exactly these. */
  failedRefs: ResourceVerseRef[];
  /** Offline with nothing usable downloaded — not a failure. */
  unavailableOfflineRefs: ResourceVerseRef[];
  /** Each succeeded ref's notes, keyed `chapter:verse`. */
  notesByRef: Record<string, TranslationNoteItem[]>;
};

export type LoadTranslationNotesParams = {
  /** Fluent project id — required for fluent-api translation-resources. */
  projectId: number | null;
  bookCode: string;
  chapterNumber: number;
  verseNumber: number;
  /**
   * Same-chapter verse list for fan-out (#593). Prefer `verseRefs` when the
   * unit may span chapters.
   */
  verseNumbers?: number[];
  /** Explicit chapter+verse refs (cross-chapter pericopes). */
  verseRefs?: ResourceVerseRef[];
  /** Aquifer language for uW TN (defaults to English source). */
  languageCode?: string;
  /** Active user id, needed to find this user's downloaded rows. */
  userId?: number | null;
  /** False when offline, so we never call the API. */
  isOnline?: boolean;
  /** Explicit retry: ask the API again instead of reusing a recent answer. */
  refresh?: boolean;
  /** Stops starting requests once aborted; ones in flight still settle. */
  signal?: AbortSignal;
};

type TipTapContentItem = {
  tiptap?: unknown;
};

/** Test-only failure injection for section-scoped error/retry. */
let loadShouldFailForTests = false;

export function setTranslationNotesLoadFailureForTests(
  shouldFail: boolean,
): void {
  loadShouldFailForTests = shouldFail;
}

function isContentItemArray(value: unknown): value is TipTapContentItem[] {
  return Array.isArray(value);
}

/**
 * Parse one fluent-api TN item into note items.
 * Each TipTap content block becomes a nested note; title falls back to the
 * resource localized name when a block has no leading heading text.
 */
export function parseTranslationNotesItem(
  item: ApiTranslationNoteItem,
  ref?: ResourceVerseRef,
): TranslationNoteItem[] {
  if (!isContentItemArray(item.content)) {
    return [];
  }

  const resourceTitle = (item.localizedName || item.name || '').trim();
  const contentItems = item.content;
  const notes: TranslationNoteItem[] = [];

  contentItems.forEach((block, index) => {
    const body = tipTapToPlainText(block.tiptap).trim();
    if (!body) {
      return;
    }

    const firstLine =
      body
        .split('\n')
        .find(line => line.trim())
        ?.trim() ?? '';
    const useResourceTitle = contentItems.length === 1 && resourceTitle;
    const title = useResourceTitle
      ? resourceTitle
      : firstLine.length > 0 && firstLine.length <= 120
      ? firstLine
      : resourceTitle || `Note ${index + 1}`;

    const noteBody =
      !useResourceTitle && title === firstLine && body.startsWith(firstLine)
        ? body.slice(firstLine.length).trim()
        : body;

    notes.push({
      id: `tn-api-${item.id}-${index}`,
      title,
      body: noteBody || body,
      ...(firstLine.length > 0 && firstLine.length <= 120
        ? { quote: firstLine }
        : {}),
      ...(ref
        ? {
            verse: {
              chapterNumber: ref.chapterNumber,
              verseNumber: ref.verseNumber,
            },
          }
        : {}),
    });
  });

  return notes;
}

function resolveTranslationNotesRefs(
  params: LoadTranslationNotesParams,
): ResourceVerseRef[] {
  return normalizeVerseRefs(
    params.verseRefs && params.verseRefs.length > 0
      ? params.verseRefs
      : verseRefsFromChapter(
          params.chapterNumber,
          params.verseNumber,
          params.verseNumbers,
        ),
  );
}

async function loadLocalTranslationNotesForRef(
  params: LoadTranslationNotesParams,
  bookCode: string,
  ref: ResourceVerseRef,
): Promise<TranslationNoteItem[] | null> {
  const rows = await findDownloadedRows({
    projectId: params.projectId,
    userId: params.userId,
    resourceName: 'Translation Notes',
    kind: 'text',
    bookCode,
    chapterNumber: ref.chapterNumber,
    verseNumber: ref.verseNumber,
  });
  if (rows === null) return null;

  const notes: TranslationNoteItem[] = [];
  let readAnyRow = false;
  for (const row of rows) {
    const content = await readDownloadedJson(row);
    if (content === undefined) continue;
    readAnyRow = true;
    const item = {
      id: row.resourceId ?? row.id,
      name: row.label,
      localizedName: row.label,
      // JSON.parse yields whatever was persisted — the API content shape is a
      // TipTap block array, so rewrap non-arrays to keep the parser happy.
      content: Array.isArray(content) ? content : [content],
    } as unknown as ApiTranslationNoteItem;
    notes.push(...parseTranslationNotesItem(item, ref));
  }
  // Every downloaded file was unreadable (missing/corrupt): fall back to the
  // API instead of showing an empty section.
  return readAnyRow ? notes : null;
}

function refKey(ref: ResourceVerseRef): string {
  return `${ref.chapterNumber}:${ref.verseNumber}`;
}

function buildResult(
  refs: ResourceVerseRef[],
  notesByRef: Record<string, TranslationNoteItem[]>,
  failed: Set<string>,
  unavailableOffline: Set<string>,
): TranslationNotesLoadResult {
  const notes: TranslationNoteItem[] = [];
  const seenIds = new Set<string>();
  for (const ref of refs) {
    for (const note of notesByRef[refKey(ref)] ?? []) {
      if (seenIds.has(note.id)) continue;
      seenIds.add(note.id);
      notes.push(note);
    }
  }
  return {
    notes,
    refs,
    succeededRefs: refs.filter(ref => refKey(ref) in notesByRef),
    failedRefs: refs.filter(ref => failed.has(refKey(ref))),
    unavailableOfflineRefs: refs.filter(ref =>
      unavailableOffline.has(refKey(ref)),
    ),
    notesByRef,
  };
}

const NO_NOTES: TranslationNotesLoadResult = buildResult(
  [],
  {},
  new Set(),
  new Set(),
);

/**
 * Folds a retry of `previous.failedRefs` into `previous`: successes from
 * either stay, recovered refs leave the failed set.
 */
export function mergeTranslationNotesRetry(
  previous: TranslationNotesLoadResult,
  retried: TranslationNotesLoadResult,
): TranslationNotesLoadResult {
  const notesByRef = { ...previous.notesByRef, ...retried.notesByRef };
  const unavailable = new Set(
    [...previous.unavailableOfflineRefs, ...retried.unavailableOfflineRefs]
      .map(refKey)
      .filter(key => !(key in notesByRef)),
  );
  return buildResult(
    previous.refs,
    notesByRef,
    new Set(retried.failedRefs.map(refKey)),
    unavailable,
  );
}

function cancelledError(): Error {
  const error = new Error('Translation Notes load cancelled');
  error.name = 'AbortError';
  return error;
}

let requestsInFlight = 0;
const waitingForRequestSlot: Array<() => void> = [];

async function takeRequestSlot(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw cancelledError();
  if (requestsInFlight < TRANSLATION_NOTES_MAX_REQUESTS_IN_FLIGHT) {
    requestsInFlight += 1;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      const index = waitingForRequestSlot.indexOf(grant);
      if (index >= 0) waitingForRequestSlot.splice(index, 1);
      reject(cancelledError());
    };
    const grant = () => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    waitingForRequestSlot.push(grant);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function releaseRequestSlot() {
  // A waiter takes the slot over directly, so nothing can slip in between.
  const next = waitingForRequestSlot.shift();
  if (next) next();
  else requestsInFlight -= 1;
}

/**
 * Load uW Translation Notes for a drafting unit. Downloaded rows are used
 * first (even online) for every verseRef in the unit; the fluent-api
 * translation-resources call (fluent-api #274) only runs for refs with no
 * usable local row, and only when online. Offline returns whatever was
 * downloaded without calling the API (#578 / #593).
 *
 * Requests are one verse each, at most
 * {@link TRANSLATION_NOTES_MAX_REQUESTS_IN_FLIGHT} at a time (#901). The
 * chapter range endpoint isn't used: its items don't say which verses they
 * cover. A failed verse doesn't fail the others; it is listed in
 * `failedRefs`.
 */
export async function loadTranslationNotesForUnit(
  params: LoadTranslationNotesParams,
): Promise<TranslationNotesLoadResult> {
  if (loadShouldFailForTests) {
    throw new Error('Failed to load Translation Notes');
  }

  if (params.projectId === null) {
    return NO_NOTES;
  }

  const bookCode = params.bookCode.trim();
  // Missing bookCode (e.g. chapter row without USFM code) → hide section, not error.
  if (!bookCode) {
    return NO_NOTES;
  }
  const { signal } = params;

  // The account this load is for: a switch while the local lookups run must
  // not send (and keep, under this account) the request as the new one.
  const bearer = authToken.get() ?? undefined;
  const userId = params.userId;
  // A known account's notes come only from its own session: not from
  // another account that is active by now, nor a token set later.
  const remoteAllowed =
    userId === null ||
    userId === undefined ||
    (bearer !== undefined && getActiveUserId() === String(userId));
  const refs = resolveTranslationNotesRefs(params);
  const notesByRef: Record<string, TranslationNoteItem[]> = {};
  const missingRefs: ResourceVerseRef[] = [];

  for (const ref of refs) {
    if (signal?.aborted) throw cancelledError();
    const local = await loadLocalTranslationNotesForRef(params, bookCode, ref);
    if (local !== null) {
      notesByRef[refKey(ref)] = local;
    } else {
      missingRefs.push(ref);
    }
  }

  // Offline: return whatever was downloaded; never call the API.
  if (params.isOnline === false) {
    return buildResult(
      refs,
      notesByRef,
      new Set(),
      new Set(missingRefs.map(refKey)),
    );
  }

  if (missingRefs.length === 0) {
    return buildResult(refs, notesByRef, new Set(), new Set());
  }

  if (!remoteAllowed) {
    throw new Error('Translation Notes account is not the active session');
  }

  const languageCode = params.languageCode?.trim() || DEFAULT_TN_LANGUAGE_CODE;
  const projectId = params.projectId;
  const fetchRef = async (ref: ResourceVerseRef) => {
    const response = await FluentAPI.getTranslationNotes(
      projectId,
      bookCode,
      ref.chapterNumber,
      ref.verseNumber,
      languageCode,
      bearer,
    );
    const items = Array.isArray(response?.items) ? response.items : [];
    return items.flatMap(item => parseTranslationNotesItem(item, ref));
  };
  const loadRef = (ref: ResourceVerseRef) =>
    userId === null || userId === undefined
      ? fetchRef(ref)
      : reusePassageResource(
          String(userId),
          `notes:${projectId}:${bookCode}:${ref.chapterNumber}:${ref.verseNumber}:${languageCode}`,
          () => fetchRef(ref),
          { fresh: params.refresh },
        );

  const failed = new Set<string>();
  let lastError: unknown;
  // A shared answer can't be aborted (a reopen may be waiting on it), so a
  // cancelled load only stops taking slots; the shared cap bounds the rest.
  await Promise.all(
    missingRefs.map(async ref => {
      try {
        await takeRequestSlot(signal);
      } catch {
        return;
      }
      try {
        notesByRef[refKey(ref)] = await loadRef(ref);
      } catch (error) {
        failed.add(refKey(ref));
        lastError = error;
      } finally {
        releaseRequestSlot();
      }
    }),
  );
  if (signal?.aborted) throw cancelledError();

  if (failed.size > 0) {
    log.warn('Some Translation Notes requests failed', {
      failedVerses: [...failed].join(','),
      succeededCount: refs.length - failed.size,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });
  }
  return buildResult(refs, notesByRef, failed, new Set());
}
