#!/usr/bin/env node
/**
 * Deterministic Maestro ownership fixtures (#574 / #607).
 *
 * Existing API:
 *   PATCH /projects/:id/chapter-assignments/assign-selected
 *   POST  /chapter-assignments/:id/claim
 *   PATCH /chapter-assignments/:id/submit
 *   PUT   /verse-audio/:projectUnitId/:bibleTextId  (3rd take, stale token)
 *   GET   /projects/:id/chapter-assignments/progress  (hasConflict rollup)
 *
 * Claim restore (fluent-api#464, may be undeployed):
 *   PATCH /projects/:id/chapter-assignments/reset-selected
 *   body: { chapterAssignmentIds: number[] }
 *   404 → log and fall back to claim-label rotation.
 *
 * Auth: MAESTRO_PM_* (Project Manager), MAESTRO_EMAIL (drafter "mine" /
 * conflict uploads), MAESTRO_EMAIL_2 (other translator - "other" + open
 * Peer Check submit).
 *
 * Commands:
 *   verify  — assert configured labels match expected ownership baseline
 *   seed    — apply baseline roles on the disposable project
 *   reset   - alias of seed (restores baseline; prefers reset-selected)
 *
 * Origin note: Better Auth requires a non-null Origin (use API base or web app).
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  readMergedConflict,
  isUsableClaimChapter,
  resetSelectedMissingMessage,
  staleBaseVersionToken,
  interpretResetSelectedHttp,
  minimalWavBytes,
} = require('./maestro-ownership-fixtures.lib.cjs');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = join(
  ROOT,
  '.maestro/fixtures/ownership-claim.manifest.json',
);
const STATE_PATH = join(ROOT, '.maestro/fixtures/ownership-claim.state.json');
const ENV_MAESTRO_PATH = join(ROOT, '.env.maestro');

const FIXTURE_ENV_KEYS = [
  'MAESTRO_EMAIL',
  'MAESTRO_PASSWORD',
  'MAESTRO_EMAIL_2',
  'MAESTRO_PASSWORD_2',
  'MAESTRO_PM_EMAIL',
  'MAESTRO_PM_PASSWORD',
  'MAESTRO_TRANSLATOR_EMAIL',
  'MAESTRO_TRANSLATOR_PASSWORD',
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_E2E_MODE',
  'MAESTRO_FIXTURE_PROJECT_NAME',
  'MAESTRO_FIXTURE_PROJECT_ID',
  'MAESTRO_FIXTURE_MINE_LABEL',
  'MAESTRO_FIXTURE_OTHER_LABEL',
  'MAESTRO_FIXTURE_UNASSIGNED_LABEL',
  'MAESTRO_FIXTURE_CLAIM_LABEL',
  'MAESTRO_FIXTURE_CONFLICT_LABEL',
  'MAESTRO_FIXTURE_OPEN_PEER_CHECK_LABEL',
  'MAESTRO_FIXTURE_OTHER_USER_ID',
];

/** @type {Record<string, string>} */
const env = { ...process.env };

function loadEnvMaestroLiteral(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!FIXTURE_ENV_KEYS.includes(key)) continue;
    let value = line.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (env[key] === undefined || env[key] === '') {
      env[key] = value;
    }
  }
}

function requireEnv(key) {
  const value = (env[key] ?? '').trim();
  if (!value) {
    throw new Error(`Missing required env ${key} (see .env.maestro.example)`);
  }
  return value;
}

function optionalEnv(key) {
  const value = (env[key] ?? '').trim();
  return value || null;
}

function unwrapList(payload) {
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'data' in payload
  ) {
    return payload.data;
  }
  return payload;
}

function normalizeStatus(status) {
  const normalized = (status ?? '').trim().toLowerCase();
  return normalized || 'not_started';
}

function workflowStage(status) {
  const s = normalizeStatus(status);
  if (s === 'peer_check' || s === 'peer-check') return 'peer_check';
  if (s === 'advanced_check' || s === 'advanced-check') return 'advanced_check';
  if (s === 'complete' || s === 'completed') return 'complete';
  if (s === 'not_started' || s === 'not-started') return 'not_started';
  return 'draft';
}

function resolveStageAssigneeId(status, assignedUserId, peerCheckerId) {
  const stage = workflowStage(status);
  switch (stage) {
    case 'draft':
    case 'not_started':
      return assignedUserId;
    case 'peer_check':
      return peerCheckerId;
    default:
      return null;
  }
}

function deriveOwnership(assignedUserId, currentUserId) {
  if (assignedUserId === null || assignedUserId === undefined) {
    return 'unassigned';
  }
  if (
    currentUserId !== null &&
    currentUserId !== undefined &&
    Number(assignedUserId) === Number(currentUserId)
  ) {
    return 'mine';
  }
  return 'other';
}

function displayLabel(bookName, chapterNumber) {
  return `${bookName} ${chapterNumber}`;
}

function jsonHeaders(baseUrl, token) {
  /** @type {Record<string, string>} */
  const headers = {
    'Content-Type': 'application/json',
    'x-client-type': 'mobile',
    'User-Agent': 'fluent-mobile-maestro-fixtures',
    // Better Auth rejects missing Origin; match mobile client / web SPA.
    Origin: baseUrl,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function apiJson(baseUrl, path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: jsonHeaders(baseUrl, token),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${method} ${path} → ${res.status}: non-JSON body`);
    }
  }
  if (!res.ok) {
    throw new Error(
      `${method} ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 240)}`,
    );
  }
  return { data, response: res };
}

/**
 * PATCH that must observe 404 (undeployed fluent-api#464) without throwing.
 * @returns {Promise<{ ok: true, data: unknown } | { ok: false, status: number, data: unknown }>}
 */
async function apiJsonAllowError(baseUrl, path, { method, token, body }) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: jsonHeaders(baseUrl, token),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 240) };
    }
  }
  if (!res.ok) {
    return { ok: false, status: res.status, data };
  }
  return { ok: true, data };
}

async function apiMultipart(baseUrl, path, { token, form }) {
  /** @type {Record<string, string>} */
  const headers = {
    'x-client-type': 'mobile',
    'User-Agent': 'fluent-mobile-maestro-fixtures',
    Origin: baseUrl,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'PUT',
    headers,
    body: form,
  });
  const text = await res.text();
  let data = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`PUT ${path} → ${res.status}: non-JSON body`);
    }
  }
  if (!res.ok) {
    throw new Error(
      `PUT ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 240)}`,
    );
  }
  return { data, response: res };
}

async function signIn(baseUrl, email, password) {
  const { data, response } = await apiJson(baseUrl, '/api/auth/sign-in/email', {
    method: 'POST',
    body: { email, password },
  });
  const headerToken = response.headers.get('set-auth-token');
  const token = headerToken || data.token;
  if (!token) {
    throw new Error('Sign-in succeeded but no session token was returned');
  }
  return token;
}

function mapAssignmentRow(a, bookNames, translatorId, progressById) {
  const id = a.id ?? a.chapterAssignmentId ?? a.assignmentId;
  const progress = progressById.get(Number(id)) ?? {};
  const bookId = a.bookId ?? progress.bookId;
  const bookName =
    bookNames.get(bookId) ??
    progress.bookNameEng ??
    `book:${bookId}`;
  const status = a.chapterStatus ?? a.status ?? progress.status;
  const assignedUserId =
    a.assignedUserId ??
    a.assigned_user_id ??
    progress.assignedUserId ??
    progress.assignedUser?.id ??
    undefined;
  const peerCheckerId =
    a.peerCheckerId ??
    a.peer_checker_id ??
    progress.peerCheckerId ??
    progress.peerChecker?.id ??
    undefined;
  const stageAssignee = resolveStageAssigneeId(
    status,
    assignedUserId,
    peerCheckerId,
  );
  return {
    id,
    label: displayLabel(bookName, a.chapterNumber ?? progress.chapterNumber),
    bookId,
    chapterNumber: a.chapterNumber ?? progress.chapterNumber,
    projectUnitId: a.projectUnitId ?? progress.projectUnitId ?? null,
    bibleId: a.bibleId ?? progress.bibleId ?? null,
    ownership: deriveOwnership(stageAssignee, translatorId),
    conflict: readMergedConflict(progress, a),
    status: normalizeStatus(status),
    stage: workflowStage(status),
    assignedUserId: assignedUserId ?? null,
    peerCheckerId: peerCheckerId ?? null,
  };
}

async function fetchProgressById(baseUrl, projectId, pmToken) {
  const progressRows = unwrapList(
    (
      await apiJson(baseUrl, `/projects/${projectId}/chapter-assignments/progress`, {
        token: pmToken,
      })
    ).data,
  );
  /** @type {Map<number, Record<string, unknown>>} */
  const progressById = new Map();
  if (Array.isArray(progressRows)) {
    for (const row of progressRows) {
      const id = row.assignmentId ?? row.id ?? row.chapterAssignmentId;
      if (id != null) progressById.set(Number(id), row);
    }
  }
  return progressById;
}

async function loadContext() {
  loadEnvMaestroLiteral(ENV_MAESTRO_PATH);
  const baseUrl = requireEnv('EXPO_PUBLIC_API_BASE_URL').replace(/\/$/, '');
  const translatorEmail =
    optionalEnv('MAESTRO_EMAIL') || requireEnv('MAESTRO_TRANSLATOR_EMAIL');
  const translatorPassword =
    optionalEnv('MAESTRO_PASSWORD') ||
    requireEnv('MAESTRO_TRANSLATOR_PASSWORD');
  const pmEmail = requireEnv('MAESTRO_PM_EMAIL');
  const pmPassword = requireEnv('MAESTRO_PM_PASSWORD');
  const otherEmail = optionalEnv('MAESTRO_EMAIL_2');
  const otherPassword = optionalEnv('MAESTRO_PASSWORD_2');

  const translatorToken = await signIn(
    baseUrl,
    translatorEmail,
    translatorPassword,
  );
  const pmToken = await signIn(baseUrl, pmEmail, pmPassword);
  let otherTranslatorToken = null;
  if (otherEmail && otherPassword) {
    if (otherEmail === pmEmail) {
      throw new Error(
        'MAESTRO_EMAIL_2 must be a second Project Translator, not the PM (MAESTRO_PM_EMAIL).',
      );
    }
    if (otherEmail === translatorEmail) {
      throw new Error(
        'MAESTRO_EMAIL_2 must differ from MAESTRO_EMAIL (other translator for open Peer Check).',
      );
    }
    otherTranslatorToken = await signIn(baseUrl, otherEmail, otherPassword);
  }

  const translator = (
    await apiJson(
      baseUrl,
      `/users/email/${encodeURIComponent(translatorEmail)}`,
      { token: translatorToken },
    )
  ).data;
  const pm = (
    await apiJson(baseUrl, `/users/email/${encodeURIComponent(pmEmail)}`, {
      token: pmToken,
    })
  ).data;
  const otherTranslator = otherEmail
    ? (
        await apiJson(
          baseUrl,
          `/users/email/${encodeURIComponent(otherEmail)}`,
          { token: otherTranslatorToken ?? pmToken },
        )
      ).data
    : null;

  const books = unwrapList(
    (await apiJson(baseUrl, '/books', { token: pmToken })).data,
  );
  /** @type {Map<number, string>} */
  const bookNames = new Map();
  for (const book of books) {
    bookNames.set(
      book.id,
      book.eng_display_name ?? book.code ?? String(book.id),
    );
  }

  const pmProjects = unwrapList(
    (await apiJson(baseUrl, `/users/${pm.id}/projects`, { token: pmToken }))
      .data,
  );
  const projectName = optionalEnv('MAESTRO_FIXTURE_PROJECT_NAME');
  const projectIdEnv = optionalEnv('MAESTRO_FIXTURE_PROJECT_ID');
  let projectId = projectIdEnv ? Number(projectIdEnv) : null;

  if (projectIdEnv && Number.isNaN(projectId)) {
    throw new Error(
      `MAESTRO_FIXTURE_PROJECT_ID="${projectIdEnv}" is not a number`,
    );
  }

  if (projectName) {
    const match = pmProjects.find(p => p.name === projectName);
    if (!match) {
      throw new Error(
        `MAESTRO_FIXTURE_PROJECT_NAME="${projectName}" not on PM projects`,
      );
    }
    if (projectId != null && Number(match.id) !== Number(projectId)) {
      throw new Error(
        `MAESTRO_FIXTURE_PROJECT_ID=${projectId} does not match name "${projectName}" (id=${match.id}). Refusing to mutate.`,
      );
    }
    projectId = Number(match.id);
  }

  if (!projectId) {
    throw new Error(
      'Set MAESTRO_FIXTURE_PROJECT_ID or MAESTRO_FIXTURE_PROJECT_NAME',
    );
  }

  const projectMeta = pmProjects.find(p => Number(p.id) === Number(projectId));
  if (!projectMeta) {
    throw new Error(
      `MAESTRO_FIXTURE_PROJECT_ID=${projectId} is not in the PM's projects — refusing to mutate a project outside that list. Use a dedicated disposable fixture project.`,
    );
  }
  const resolvedProjectName = projectMeta.name || projectName || String(projectId);

  const projectAssignments = unwrapList(
    (
      await apiJson(baseUrl, `/projects/${projectId}/chapter-assignments`, {
        token: pmToken,
      })
    ).data,
  );
  if (!Array.isArray(projectAssignments)) {
    throw new Error('project chapter-assignments did not return an array');
  }

  const progressById = await fetchProgressById(baseUrl, projectId, pmToken);

  const enriched = projectAssignments.map(a =>
    mapAssignmentRow(a, bookNames, translator.id, progressById),
  );

  const byLabel = new Map(enriched.map(row => [row.label, row]));

  const members = unwrapList(
    (
      await apiJson(baseUrl, `/projects/${projectId}/users`, {
        token: pmToken,
      })
    ).data,
  );
  const translators = (Array.isArray(members) ? members : []).filter(
    m => m.roleName === 'Project Translator' || m.roleID === 2,
  );
  const otherMember =
    translators.find(m => Number(m.userId) !== Number(translator.id)) ?? null;
  const otherUserIdFromEnv = optionalEnv('MAESTRO_FIXTURE_OTHER_USER_ID')
    ? Number(optionalEnv('MAESTRO_FIXTURE_OTHER_USER_ID'))
    : null;
  const otherUserId = otherTranslator
    ? Number(otherTranslator.id)
    : otherUserIdFromEnv
      ? otherUserIdFromEnv
      : otherMember
        ? Number(otherMember.userId)
        : null;

  return {
    baseUrl,
    projectId,
    projectName: resolvedProjectName,
    translator,
    pm,
    pmToken,
    translatorToken,
    otherTranslatorToken,
    otherTranslator,
    enriched,
    byLabel,
    bookNames,
    otherUserId,
    otherDisplayName:
      otherTranslator?.username ??
      otherMember?.displayName ??
      null,
  };
}

async function refreshRows(ctx) {
  const projectAssignments = unwrapList(
    (
      await apiJson(
        ctx.baseUrl,
        `/projects/${ctx.projectId}/chapter-assignments`,
        { token: ctx.pmToken },
      )
    ).data,
  );
  const progressById = await fetchProgressById(
    ctx.baseUrl,
    ctx.projectId,
    ctx.pmToken,
  );
  ctx.enriched = (Array.isArray(projectAssignments) ? projectAssignments : []).map(
    a => mapAssignmentRow(a, ctx.bookNames, ctx.translator.id, progressById),
  );
  ctx.byLabel = new Map(ctx.enriched.map(row => [row.label, row]));
  return ctx;
}

async function assignSelected(ctx, assignments) {
  return apiJson(
    ctx.baseUrl,
    `/projects/${ctx.projectId}/chapter-assignments/assign-selected`,
    {
      method: 'PATCH',
      token: ctx.pmToken,
      body: { assignments },
    },
  );
}

function requireRow(ctx, label, role) {
  const row = ctx.byLabel.get(label);
  if (!row) {
    throw new Error(
      `role ${role}: no chapter labeled "${label}" in project ${ctx.projectId}. Seen: ${ctx.enriched
        .slice(0, 20)
        .map(r => r.label)
        .join(', ')}`,
    );
  }
  return row;
}

function pickClaimChapter(ctx, preferredLabel, reservedLabels) {
  const allowRotate =
    process.env.MAESTRO_FIXTURE_ALLOW_CLAIM_ROTATE === '1' ||
    process.argv.includes('--rotate-claim');
  const reserved = new Set(
    (reservedLabels || []).filter(Boolean).map(l => String(l)),
  );

  if (preferredLabel) {
    const preferred = ctx.byLabel.get(preferredLabel);
    if (isUsableClaimChapter(preferred)) {
      return preferred;
    }
    if (!allowRotate) {
      const status = preferred
        ? `status=${preferred.status} assigned=${preferred.assignedUserId}`
        : 'label not found in project';
      throw new Error(
        `claim chapter "${preferredLabel}" is not usable (${status}). ` +
          `Re-seed after fluent-api#464 reset-selected is deployed, or re-run with ` +
          `MAESTRO_FIXTURE_ALLOW_CLAIM_ROTATE=1 (local only — EAS should update the secret).`,
      );
    }
  }
  const next = ctx.enriched.find(
    r => isUsableClaimChapter(r) && !reserved.has(r.label),
  );
  if (!next) {
    throw new Error(
      'No not_started unassigned chapter left for claim role - add books to the disposable project or wait for fluent-api#464 reset-selected.',
    );
  }
  return next;
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, notImplemented: true } | { ok: false, error: string }>}
 */
async function tryResetSelected(ctx, chapterAssignmentIds) {
  const result = await apiJsonAllowError(
    ctx.baseUrl,
    `/projects/${ctx.projectId}/chapter-assignments/reset-selected`,
    {
      method: 'PATCH',
      token: ctx.pmToken,
      body: { chapterAssignmentIds },
    },
  );
  const status = result.ok ? 200 : result.status;
  const interpreted = interpretResetSelectedHttp(status, result.data);
  if (interpreted.reset) return { ok: true };
  if (status === 404) {
    return { ok: false, notImplemented: true };
  }
  return { ok: false, error: interpreted.reason };
}

async function restoreClaimBaseline(ctx, preferredLabel, reservedLabels) {
  const preferred = preferredLabel ? ctx.byLabel.get(preferredLabel) : null;
  if (isUsableClaimChapter(preferred)) {
    return preferred;
  }

  if (preferred) {
    const reset = await tryResetSelected(ctx, [preferred.id]);
    if (reset.ok) {
      console.log(
        `  claim       ${preferred.label}: reset-selected → not_started (fluent-api#464)`,
      );
      await refreshRows(ctx);
      const restored = ctx.byLabel.get(preferred.label);
      if (isUsableClaimChapter(restored)) {
        return restored;
      }
      throw new Error(
        `reset-selected returned ok but "${preferred.label}" is still status=${restored?.status} assigned=${restored?.assignedUserId}`,
      );
    }
    if (reset.notImplemented) {
      console.warn(
        resetSelectedMissingMessage(
          ctx.baseUrl,
          `/projects/${ctx.projectId}/chapter-assignments/reset-selected`,
        ),
      );
    } else {
      throw new Error(`reset-selected failed for "${preferred.label}": ${reset.error}`);
    }
  }

  return pickClaimChapter(ctx, preferredLabel, reservedLabels);
}

async function firstVerseTextId(ctx, row) {
  if (row.bibleId == null || row.bookId == null || row.chapterNumber == null) {
    throw new Error(
      `conflict "${row.label}": missing bibleId/bookId/chapterNumber for texts`,
    );
  }
  const { data } = await apiJson(
    ctx.baseUrl,
    `/bibles/${row.bibleId}/books/${row.bookId}/chapters/${row.chapterNumber}/texts`,
    { token: ctx.translatorToken },
  );
  const verses = unwrapList(data);
  const first = Array.isArray(verses) ? verses[0] : null;
  if (!first?.id) {
    throw new Error(`conflict "${row.label}": no bible text id from chapter texts`);
  }
  return Number(first.id);
}

async function uploadTake(ctx, projectUnitId, bibleTextId, seed, baseVersionToken) {
  const form = new FormData();
  const wav = minimalWavBytes(seed);
  form.append(
    'file',
    new File([wav], `maestro-conflict-${seed}.wav`, { type: 'audio/wav' }),
  );
  form.append('durationSeconds', '0.002');
  if (baseVersionToken !== undefined) {
    form.append('baseVersionToken', String(baseVersionToken));
  }
  const { data } = await apiMultipart(
    ctx.baseUrl,
    `/verse-audio/${projectUnitId}/${bibleTextId}`,
    { token: ctx.translatorToken, form },
  );
  return data;
}

/**
 * assign-selected auto-transitions not_started → draft when a drafter is set.
 * That is enough for verse-audio upload (conflict) and PATCH submit (Peer Check).
 */
async function assignDrafter(ctx, row, userId) {
  await assignSelected(ctx, [
    {
      chapterAssignmentId: row.id,
      drafterId: userId,
      peerCheckerId: null,
    },
  ]);
  return {
    ...row,
    status: row.status === 'not_started' ? 'draft' : row.status,
    assignedUserId: userId,
    peerCheckerId: null,
  };
}

async function seedConflict(ctx, row) {
  if (row.projectUnitId == null) {
    throw new Error(`conflict "${row.label}": missing projectUnitId`);
  }
  if (row.conflict) {
    console.log(`  conflict    ${row.label}: already hasConflict - skip uploads`);
    return;
  }

  const drafted = await assignDrafter(ctx, row, ctx.translator.id);
  const bibleTextId = await firstVerseTextId(ctx, drafted);
  const take1 = await uploadTake(ctx, drafted.projectUnitId, bibleTextId, 1);
  const token1 = take1.versionToken;
  if (token1 == null) {
    throw new Error(`conflict "${row.label}": take 1 did not return versionToken`);
  }
  await uploadTake(ctx, drafted.projectUnitId, bibleTextId, 2, token1);
  const staleToken = staleBaseVersionToken(token1);
  const take3 = await uploadTake(
    ctx,
    drafted.projectUnitId,
    bibleTextId,
    3,
    staleToken,
  );
  if (take3.conflictStatus !== 'conflict') {
    throw new Error(
      `conflict "${row.label}": expected conflictStatus=conflict after stale take 3, got ${take3.conflictStatus}`,
    );
  }
  console.log(
    `  conflict    ${row.label}: 3 takes uploaded (take 3 stale baseVersionToken=${staleToken})`,
  );
}

async function seedOpenPeerCheck(ctx, row) {
  if (!ctx.otherUserId || !ctx.otherTranslatorToken) {
    throw new Error(
      'Open Peer Check seed needs MAESTRO_EMAIL_2 / MAESTRO_PASSWORD_2 (other translator) to PATCH submit.',
    );
  }

  if (row.status === 'peer_check' && row.peerCheckerId == null) {
    console.log(
      `  openPeerCheck ${row.label}: already peer_check with no peerChecker`,
    );
    return;
  }

  await assignDrafter(ctx, row, ctx.otherUserId);
  await apiJson(ctx.baseUrl, `/chapter-assignments/${row.id}/submit`, {
    method: 'PATCH',
    token: ctx.otherTranslatorToken,
  });
  console.log(
    `  openPeerCheck ${row.label}: assigned drafter=${ctx.otherUserId}, submitted → peer_check`,
  );
}

async function seed() {
  const confirmed =
    process.env.MAESTRO_FIXTURE_CONFIRM === '1' ||
    process.argv.includes('--yes');
  if (!confirmed) {
    throw new Error(
      'Refusing to mutate project assignments without confirmation. ' +
        'Re-run with --yes or MAESTRO_FIXTURE_CONFIRM=1 after checking the project id/name. ' +
        'Use a dedicated disposable fixture project — never shared QA data.',
    );
  }

  const ctx = await loadContext();
  if (!ctx.otherUserId || !ctx.otherTranslatorToken) {
    throw new Error(
      'Need MAESTRO_EMAIL_2 / MAESTRO_PASSWORD_2 (second Project Translator) for "other" and open Peer Check submit.',
    );
  }

  const mineLabel = requireEnv('MAESTRO_FIXTURE_MINE_LABEL');
  const otherLabel = requireEnv('MAESTRO_FIXTURE_OTHER_LABEL');
  const unassignedLabel = requireEnv('MAESTRO_FIXTURE_UNASSIGNED_LABEL');
  const claimPreferred = optionalEnv('MAESTRO_FIXTURE_CLAIM_LABEL');
  const conflictLabel = requireEnv('MAESTRO_FIXTURE_CONFLICT_LABEL');
  const openPeerCheckLabel = requireEnv('MAESTRO_FIXTURE_OPEN_PEER_CHECK_LABEL');

  const mine = requireRow(ctx, mineLabel, 'mine');
  const other = requireRow(ctx, otherLabel, 'other');
  const unassigned = requireRow(ctx, unassignedLabel, 'unassigned');
  const conflict = requireRow(ctx, conflictLabel, 'conflict');
  const openPeerCheck = requireRow(ctx, openPeerCheckLabel, 'openPeerCheck');
  const reserved = [
    mineLabel,
    otherLabel,
    unassignedLabel,
    conflictLabel,
    openPeerCheckLabel,
  ];
  const claim = await restoreClaimBaseline(ctx, claimPreferred, reserved);

  /** @type {Array<{chapterAssignmentId:number,drafterId:number|null,peerCheckerId:number|null}>} */
  const assignments = [
    {
      chapterAssignmentId: mine.id,
      drafterId: ctx.translator.id,
      peerCheckerId: ctx.otherUserId,
    },
    {
      chapterAssignmentId: other.id,
      drafterId: ctx.otherUserId,
      // Must not set translator as peerChecker — isChapterTakenByOther is false
      // when the current user holds either assignee slot (#574 taken-warning).
      peerCheckerId: null,
    },
  ];

  if (unassigned.assignedUserId != null || unassigned.peerCheckerId != null) {
    assignments.push({
      chapterAssignmentId: unassigned.id,
      drafterId: null,
      peerCheckerId: null,
    });
  }
  if (claim.assignedUserId != null || claim.peerCheckerId != null) {
    throw new Error(
      `claim chapter "${claim.label}" is assigned (id=${claim.id}). reset-selected should have cleared it, or pick a pristine not_started chapter.`,
    );
  }
  if (claim.status !== 'not_started') {
    throw new Error(
      `claim chapter "${claim.label}" status=${claim.status} (need not_started).`,
    );
  }

  console.log(
    `About to mutate project ${ctx.projectId} ("${ctx.projectName}"):`,
  );
  console.log(
    `  mine        ${mineLabel} (id=${mine.id}): ${mine.ownership}/${mine.status} → drafter=${ctx.translator.id}`,
  );
  console.log(
    `  other       ${otherLabel} (id=${other.id}): ${other.ownership}/${other.status} → drafter=${ctx.otherUserId}`,
  );
  console.log(
    `  unassigned  ${unassignedLabel} (id=${unassigned.id}): ${unassigned.ownership}/${unassigned.status} → clear assignees`,
  );
  console.log(
    `  claim       ${claim.label} (id=${claim.id}): leave/restore pristine not_started`,
  );
  console.log(
    `  conflict    ${conflictLabel} (id=${conflict.id}): 3 verse-audio takes, 3rd stale token`,
  );
  console.log(
    `  openPeerCheck ${openPeerCheckLabel} (id=${openPeerCheck.id}): other drafter + submit`,
  );

  await assignSelected(ctx, assignments);
  await seedConflict(ctx, conflict);
  await seedOpenPeerCheck(ctx, openPeerCheck);
  await refreshRows(ctx);

  const conflictAfter = ctx.byLabel.get(conflictLabel);
  if (!conflictAfter?.conflict) {
    throw new Error(
      `conflict verify via GET progress: "${conflictLabel}" hasConflict=${conflictAfter?.conflict} (expected true)`,
    );
  }
  const peerAfter = ctx.byLabel.get(openPeerCheckLabel);
  if (peerAfter?.status !== 'peer_check' || peerAfter.peerCheckerId != null) {
    throw new Error(
      `openPeerCheck verify: "${openPeerCheckLabel}" status=${peerAfter?.status} peerCheckerId=${peerAfter?.peerCheckerId} (expected peer_check / null)`,
    );
  }

  const state = {
    projectId: ctx.projectId,
    projectName: ctx.projectName,
    updatedAt: new Date().toISOString(),
    translatorUserId: ctx.translator.id,
    otherUserId: ctx.otherUserId,
    roles: {
      mine: mineLabel,
      other: otherLabel,
      unassigned: unassignedLabel,
      claim: claim.label,
      conflict: conflictLabel,
      openPeerCheck: openPeerCheckLabel,
    },
  };
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);

  console.log(`Seeded project ${ctx.projectId} (${ctx.projectName}):`);
  console.log(`  mine        ${mineLabel} → drafter=${ctx.translator.id}`);
  console.log(
    `  other       ${otherLabel} → drafter=${ctx.otherUserId} (${ctx.otherDisplayName ?? 'other translator'})`,
  );
  console.log(`  unassigned  ${unassignedLabel} → cleared`);
  console.log(
    `  claim       ${claim.label} → not_started unassigned (status=${claim.status})`,
  );
  console.log(`  conflict    ${conflictLabel} → hasConflict=true`);
  console.log(
    `  openPeerCheck ${openPeerCheckLabel} → peer_check, no peerChecker`,
  );
  if (claim.label !== claimPreferred) {
    console.log(
      `\nUpdate .env.maestro:\n  MAESTRO_FIXTURE_CLAIM_LABEL=${claim.label}`,
    );
  }
  console.log(`\nWrote ${STATE_PATH}`);
  console.log('Next: npm run maestro:fixtures:verify');
}

async function verify() {
  const ctx = await loadContext();
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const roles = manifest.roles;
  const errors = [];
  const warnings = [];

  let claimLabel = optionalEnv('MAESTRO_FIXTURE_CLAIM_LABEL');
  if (existsSync(STATE_PATH)) {
    try {
      const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
      if (state?.roles?.claim) {
        claimLabel = state.roles.claim;
      }
    } catch {
      // ignore
    }
  }

  const labelOverrides = {
    claim: claimLabel,
  };

  for (const [role, spec] of Object.entries(roles)) {
    const label =
      labelOverrides[role] || optionalEnv(spec.envLabel) || null;
    if (!label) {
      errors.push(`missing required env ${spec.envLabel} for role ${role}`);
      continue;
    }

    const row = ctx.byLabel.get(label);
    if (!row) {
      errors.push(
        `role ${role}: no assignment labeled "${label}" in project ${ctx.projectId}`,
      );
      continue;
    }

    if (
      spec.expectedOwnership != null &&
      row.ownership !== spec.expectedOwnership
    ) {
      errors.push(
        `role ${role} ("${label}"): ownership=${row.ownership}, expected ${spec.expectedOwnership}`,
      );
    }

    if (role === 'other') {
      if (Number(row.assignedUserId) !== Number(ctx.otherUserId)) {
        errors.push(
          `role other ("${label}"): assignedUserId=${row.assignedUserId}, expected ${ctx.otherUserId}`,
        );
      }
      if (
        row.peerCheckerId != null &&
        Number(row.peerCheckerId) === Number(ctx.translator.id)
      ) {
        errors.push(
          `role other ("${label}"): peerCheckerId must not be the Maestro translator (taken-warning would not show)`,
        );
      }
    }

    if (spec.expectedConflict === true && row.conflict !== true) {
      errors.push(
        `role ${role} ("${label}"): expected hasConflict=true via GET progress, got ${row.conflict}`,
      );
    }
    if (spec.expectedConflict === false && row.conflict === true) {
      errors.push(
        `role ${role} ("${label}"): expected hasConflict=false, got true`,
      );
    }

    if (
      spec.expectedStatus &&
      row.status !== normalizeStatus(spec.expectedStatus)
    ) {
      errors.push(
        `role ${role} ("${label}"): status=${row.status}, expected ${spec.expectedStatus}`,
      );
    }

    if (role === 'openPeerCheck' && row.peerCheckerId != null) {
      errors.push(
        `role openPeerCheck ("${label}"): peerCheckerId=${row.peerCheckerId}, expected null`,
      );
    }

    if (role === 'claim' && row.status !== 'not_started') {
      warnings.push(
        `claim ("${label}") status=${row.status} (claim API requires not_started). Re-seed will reset-selected or rotate.`,
      );
    }

    console.log(
      `OK  ${role.padEnd(14)} ${label} → ownership=${row.ownership} conflict=${row.conflict} status=${row.status} id=${row.id}`,
    );
  }

  for (const w of warnings) console.warn(`WARN ${w}`);

  if (errors.length) {
    console.error('\nFixture verify FAILED:');
    for (const e of errors) console.error(`  - ${e}`);
    console.error('\nTry: npm run maestro:fixtures:seed');
    process.exitCode = 1;
    return;
  }

  console.log('\nFixture verify passed.');
}

async function main() {
  const cmd = process.argv[2] ?? 'verify';
  if (cmd === 'verify') {
    await verify();
    return;
  }
  if (cmd === 'seed' || cmd === 'reset') {
    await seed();
    return;
  }
  console.error(`Unknown command "${cmd}". Use verify | seed | reset.`);
  process.exitCode = 1;
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
