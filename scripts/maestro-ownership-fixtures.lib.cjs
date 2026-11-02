'use strict';

/**
 * Pure helpers for Maestro ownership fixtures (#607).
 * CommonJS so Jest CI can require them (root package is ESM).
 */

/**
 * Audio-take conflict from GET .../chapter-assignments/progress (`hasConflict`).
 * Also accepts snake_case and claim-conflict aliases if a payload includes them.
 *
 * @param {Record<string, unknown> | null | undefined} assignment
 * @returns {boolean}
 */
function readConflict(assignment) {
  if (!assignment || typeof assignment !== 'object') return false;
  if (typeof assignment.hasConflict === 'boolean') return assignment.hasConflict;
  if (typeof assignment.has_conflict === 'boolean') {
    return assignment.has_conflict;
  }
  if (typeof assignment.hasClaimConflict === 'boolean') {
    return assignment.hasClaimConflict;
  }
  if (typeof assignment.has_claim_conflict === 'boolean') {
    return assignment.has_claim_conflict;
  }
  return false;
}

/**
 * Progress GET is the source of truth; list row is a fallback.
 *
 * @param {Record<string, unknown> | null | undefined} progressRow
 * @param {Record<string, unknown> | null | undefined} assignmentRow
 */
function readMergedConflict(progressRow, assignmentRow) {
  return readConflict(progressRow) || readConflict(assignmentRow);
}

/**
 * @param {unknown} progressRows
 * @returns {Map<number, boolean>}
 */
function progressConflictByAssignmentId(progressRows) {
  /** @type {Map<number, boolean>} */
  const byId = new Map();
  if (!Array.isArray(progressRows)) return byId;
  for (const row of progressRows) {
    const id = row.assignmentId ?? row.id ?? row.chapterAssignmentId;
    if (id == null) continue;
    byId.set(Number(id), readConflict(row));
  }
  return byId;
}

/**
 * Claim chapters must stay unassigned + not_started for POST /claim.
 *
 * @param {{ assignedUserId?: unknown, status?: string } | null | undefined} row
 */
function isUsableClaimChapter(row) {
  return Boolean(
    row && row.assignedUserId == null && row.status === 'not_started',
  );
}

/**
 * Logged when PATCH reset-selected is not deployed (fluent-api #464).
 *
 * @param {string} baseUrl
 * @param {string} path
 */
function resetSelectedMissingMessage(baseUrl, path) {
  return (
    `PATCH ${path} → 404. fluent-api #464 (reset-selected) is not deployed on ${baseUrl}. ` +
    `Claim chapters cannot be restored to not_started; falling back to rotate if allowed.`
  );
}

/**
 * Third take must reuse the first take's versionToken so the server sees a stale base.
 *
 * @param {number | undefined} firstVersionToken
 * @returns {number | undefined}
 */
function staleBaseVersionToken(firstVersionToken) {
  return firstVersionToken;
}

/**
 * Tiny PCM WAV. `seed` changes sample bytes so each take has a distinct contentHash
 * (identical hashes are idempotent and would not create a conflict).
 *
 * @param {number} seed
 * @returns {Buffer}
 */
function minimalWavBytes(seed) {
  const pcm = Buffer.alloc(16);
  for (let i = 0; i < pcm.length; i += 2) {
    pcm.writeUInt16LE((seed * 1117 + i * 97) & 0xffff, i);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(16000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * Interpret PATCH reset-selected. 404 = fluent-api #464 not deployed (rotate).
 *
 * @param {number} status
 * @param {unknown} body
 * @returns {{ reset: boolean, rotate: boolean, status: number, reason: string }}
 */
function interpretResetSelectedHttp(status, body) {
  const snippet =
    body == null
      ? ''
      : typeof body === 'string'
        ? body.slice(0, 200)
        : JSON.stringify(body).slice(0, 200);

  if (status >= 200 && status < 300) {
    return { reset: true, rotate: false, status, reason: 'ok' };
  }
  if (status === 404) {
    return {
      reset: false,
      rotate: true,
      status,
      reason:
        'PATCH reset-selected → 404. fluent-api #464 is not deployed. ' +
        'Claim chapters cannot be restored to not_started; falling back to rotate if allowed.',
    };
  }
  return {
    reset: false,
    rotate: false,
    status,
    reason: `reset-selected → ${status} (${snippet || 'error'})`,
  };
}

module.exports = {
  readConflict,
  readMergedConflict,
  progressConflictByAssignmentId,
  isUsableClaimChapter,
  resetSelectedMissingMessage,
  staleBaseVersionToken,
  interpretResetSelectedHttp,
  minimalWavBytes,
};
