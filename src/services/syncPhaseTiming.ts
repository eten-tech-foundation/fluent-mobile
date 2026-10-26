import { logger } from '../utils/logger';

const log = logger.create('SyncPhase');

export const SYNC_PHASE_LOG_MESSAGE = 'Sync phase timing';

export const SYNC_PHASE_FIELDS = [
  'phase',
  'elapsedMs',
  'attempt',
  'rows',
  'chunks',
  'fullFetchReason',
] as const;

export type SyncPhaseField = (typeof SYNC_PHASE_FIELDS)[number];

export type SyncPhaseFullFetchReason =
  | 'remap'
  | 'missing_chapter'
  | 'no_cursor';

export type SyncPhaseCounts = {
  attempt?: number;
  rows?: number;
  chunks?: number;
  fullFetchReason?: SyncPhaseFullFetchReason;
};

export const BIBLE_TEXT_PHASE = {
  reentry: 'bibleTexts.reentry',
  countCheck: 'bibleTexts.countCheck',
  fetchParse: 'bibleTexts.fetchParse',
  write: 'bibleTexts.write',
} as const;

export const HTTP_PHASE = {
  network: 'http.network',
  parse: 'http.parse',
} as const;

const FULL_FETCH_REASONS = new Set<string>([
  'remap',
  'missing_chapter',
  'no_cursor',
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Privacy allowlist: never pass through tokens, emails, user ids,
 * verse text, or request bodies even if a caller supplies them.
 */
export function pickSyncPhaseCounts(
  counts?: Record<string, unknown>,
): SyncPhaseCounts {
  if (!counts) {
    return {};
  }

  const picked: SyncPhaseCounts = {};
  if (isFiniteNumber(counts.attempt)) {
    picked.attempt = counts.attempt;
  }
  if (isFiniteNumber(counts.rows)) {
    picked.rows = counts.rows;
  }
  if (isFiniteNumber(counts.chunks)) {
    picked.chunks = counts.chunks;
  }
  if (
    typeof counts.fullFetchReason === 'string' &&
    FULL_FETCH_REASONS.has(counts.fullFetchReason)
  ) {
    picked.fullFetchReason = counts.fullFetchReason as SyncPhaseFullFetchReason;
  }
  return picked;
}

export function resolveBibleTextFullFetchReason(
  updatedAfter: string | undefined,
  remapPending: boolean,
  missingChapter: boolean,
): SyncPhaseFullFetchReason | undefined {
  if (remapPending) {
    return 'remap';
  }
  if (missingChapter) {
    return 'missing_chapter';
  }
  if (!updatedAfter) {
    return 'no_cursor';
  }
  return undefined;
}

export function startPhase(name: string) {
  const startedAt = Date.now();
  return {
    end(counts?: Record<string, unknown>) {
      log.info(SYNC_PHASE_LOG_MESSAGE, {
        phase: name,
        elapsedMs: Date.now() - startedAt,
        ...pickSyncPhaseCounts(counts),
      });
    },
  };
}
