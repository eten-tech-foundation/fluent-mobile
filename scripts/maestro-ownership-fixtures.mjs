#!/usr/bin/env node
/**
 * Deterministic Maestro ownership fixtures (#574).
 *
 * Uses the Fluent web PM API (same as Assign Users dialog):
 *   PATCH /projects/:id/chapter-assignments/assign-selected
 *   body: { assignments: [{ chapterAssignmentId, drafterId, peerCheckerId }] }
 *   Clear: drafterId: null, peerCheckerId: null
 *
 * Auth: MAESTRO_PM_EMAIL / MAESTRO_PM_PASSWORD (Project Manager on the
 * disposable fixture project). Translator: MAESTRO_EMAIL (drafter "mine").
 *
 * Commands:
 *   verify  — assert configured labels match expected ownership baseline
 *   seed    — apply baseline roles on the disposable project
 *   reset   — alias of seed (restores baseline; claim chapter may rotate)
 *
 * Origin note: Better Auth requires a non-null Origin (use API base or web app).
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  if (currentUserId !== null && assignedUserId === currentUserId) {
    return 'mine';
  }
  return 'other';
}

function readConflict(assignment) {
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

function displayLabel(bookName, chapterNumber) {
  return `${bookName} ${chapterNumber}`;
}

async function apiJson(baseUrl, path, { method = 'GET', token, body } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-client-type': 'mobile',
    'User-Agent': 'fluent-mobile-maestro-fixtures',
    // Better Auth rejects missing Origin; match mobile client / web SPA.
    Origin: baseUrl,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
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

  const translatorToken = await signIn(
    baseUrl,
    translatorEmail,
    translatorPassword,
  );
  const pmToken = await signIn(baseUrl, pmEmail, pmPassword);

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
  if (projectName && !projectId) {
    const match = pmProjects.find(p => p.name === projectName);
    if (!match) {
      throw new Error(
        `MAESTRO_FIXTURE_PROJECT_NAME="${projectName}" not on PM projects`,
      );
    }
    projectId = match.id;
  }
  if (!projectId) {
    throw new Error(
      'Set MAESTRO_FIXTURE_PROJECT_ID or MAESTRO_FIXTURE_PROJECT_NAME',
    );
  }

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

  const enriched = projectAssignments.map(a => {
    const id = a.id ?? a.chapterAssignmentId;
    const bookName = bookNames.get(a.bookId) ?? `book:${a.bookId}`;
    const status = a.chapterStatus ?? a.status;
    const assignedUserId =
      a.assignedUserId ?? a.assigned_user_id ?? undefined;
    const peerCheckerId = a.peerCheckerId ?? a.peer_checker_id ?? undefined;
    const stageAssignee = resolveStageAssigneeId(
      status,
      assignedUserId,
      peerCheckerId,
    );
    return {
      id,
      label: displayLabel(bookName, a.chapterNumber),
      bookId: a.bookId,
      chapterNumber: a.chapterNumber,
      ownership: deriveOwnership(stageAssignee, translator.id),
      conflict: readConflict(a),
      status: normalizeStatus(status),
      stage: workflowStage(status),
      assignedUserId: assignedUserId ?? null,
      peerCheckerId: peerCheckerId ?? null,
    };
  });

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
  const otherUserId = optionalEnv('MAESTRO_FIXTURE_OTHER_USER_ID')
    ? Number(optionalEnv('MAESTRO_FIXTURE_OTHER_USER_ID'))
    : otherMember
      ? Number(otherMember.userId)
      : null;

  return {
    baseUrl,
    projectId,
    projectName:
      projectName ||
      pmProjects.find(p => p.id === projectId)?.name ||
      String(projectId),
    translator,
    pm,
    pmToken,
    translatorToken,
    enriched,
    byLabel,
    otherUserId,
    otherDisplayName: otherMember?.displayName ?? null,
  };
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
    if (
      preferred &&
      preferred.assignedUserId == null &&
      preferred.status === 'not_started'
    ) {
      return preferred;
    }
    if (!allowRotate) {
      const status = preferred
        ? `status=${preferred.status} assigned=${preferred.assignedUserId}`
        : 'label not found in project';
      throw new Error(
        `claim chapter "${preferredLabel}" is not usable (${status}). ` +
          `Pick a pristine not_started unassigned chapter, or re-run seed with ` +
          `MAESTRO_FIXTURE_ALLOW_CLAIM_ROTATE=1 (local only — EAS should update the secret).`,
      );
    }
  }
  const next = ctx.enriched.find(
    r =>
      r.assignedUserId == null &&
      r.status === 'not_started' &&
      !reserved.has(r.label),
  );
  if (!next) {
    throw new Error(
      'No not_started unassigned chapter left for claim role — add books to the disposable project or clear draft leftovers via Fluent web Status (API cannot reset status to not_started).',
    );
  }
  return next;
}

async function seed() {
  const ctx = await loadContext();
  if (!ctx.otherUserId) {
    throw new Error(
      'Need a second Project Translator on the fixture project (for "other" / peerChecker). Set MAESTRO_FIXTURE_OTHER_USER_ID or add another translator in Fluent web.',
    );
  }

  const mineLabel = requireEnv('MAESTRO_FIXTURE_MINE_LABEL');
  const otherLabel = requireEnv('MAESTRO_FIXTURE_OTHER_LABEL');
  const unassignedLabel = requireEnv('MAESTRO_FIXTURE_UNASSIGNED_LABEL');
  const claimPreferred = optionalEnv('MAESTRO_FIXTURE_CLAIM_LABEL');

  const mine = requireRow(ctx, mineLabel, 'mine');
  const other = requireRow(ctx, otherLabel, 'other');
  const unassigned = requireRow(ctx, unassignedLabel, 'unassigned');
  const claim = pickClaimChapter(ctx, claimPreferred, [
    mineLabel,
    otherLabel,
    unassignedLabel,
    optionalEnv('MAESTRO_FIXTURE_CONFLICT_LABEL'),
    optionalEnv('MAESTRO_FIXTURE_OPEN_PEER_CHECK_LABEL'),
  ]);

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

  // Clearing via assign-selected leaves status=draft (API cannot restore
  // not_started). Only PATCH nulls when the chapter still has an assignee —
  // pristine not_started rows must be left untouched for auto-claim.
  if (unassigned.assignedUserId != null || unassigned.peerCheckerId != null) {
    assignments.push({
      chapterAssignmentId: unassigned.id,
      drafterId: null,
      peerCheckerId: null,
    });
  }
  if (claim.assignedUserId != null || claim.peerCheckerId != null) {
    throw new Error(
      `claim chapter "${claim.label}" is assigned (id=${claim.id}). Pick a pristine not_started chapter — clearing via API would leave status=draft and break POST /claim.`,
    );
  }
  if (claim.status !== 'not_started') {
    throw new Error(
      `claim chapter "${claim.label}" status=${claim.status} (need not_started). Choose another unused chapter label.`,
    );
  }

  await assignSelected(ctx, assignments);

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
    },
  };
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);

  // Keep .env.maestro claim label in sync when we rotated — print export hint only.
  console.log(`Seeded project ${ctx.projectId} (${ctx.projectName}):`);
  console.log(`  mine        ${mineLabel} → drafter=${ctx.translator.id}`);
  console.log(
    `  other       ${otherLabel} → drafter=${ctx.otherUserId} (${ctx.otherDisplayName ?? 'other translator'})`,
  );
  console.log(`  unassigned  ${unassignedLabel} → cleared`);
  console.log(
    `  claim       ${claim.label} → cleared (status=${claim.status}; auto-claim needs not_started)`,
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

  // Prefer last seed's claim label when state exists (seed may have rotated
  // after a burned not_started chapter). Env alone can point at a draft leftover.
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
      if (spec.optional) {
        warnings.push(`skip optional role ${role}: ${spec.envLabel} unset`);
        continue;
      }
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
        `role ${role} ("${label}"): expected hasConflict=true, got ${row.conflict}`,
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

    if (role === 'claim' && row.status !== 'not_started') {
      warnings.push(
        `claim ("${label}") status=${row.status} (claim API requires not_started). Re-seed will pick another not_started chapter if available.`,
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
