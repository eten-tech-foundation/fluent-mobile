/**
 * Pure checks for Maestro fixture scope. No network and no filesystem writes.
 * Mutating lanes may name only allowlisted project ids. Denylisted ids
 * (demo projects) are refused even if someone also allowlists them.
 */

function parseIdList(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return [];
  }
  return String(value)
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
}

function assertProjectAllowed(projectId, allowlistRaw, denylistRaw) {
  const id = String(projectId ?? '').trim();
  if (!id) {
    return { ok: false, status: 'BLOCKED', reason: 'project id is empty' };
  }
  const denylist = parseIdList(denylistRaw);
  if (denylist.includes(id)) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `project ${id} is denylisted (demo or protected data)`,
    };
  }
  const allowlist = parseIdList(allowlistRaw);
  if (allowlist.length === 0) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'MAESTRO_FIXTURE_PROJECT_ALLOWLIST is empty',
    };
  }
  if (!allowlist.includes(id)) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `project ${id} is not on the allowlist`,
    };
  }
  return { ok: true, status: 'PASS', reason: '' };
}

const FIXTURE_CHAPTER_HELPER = 'open-my-work-chapter.yaml';
const nodePath = require('path');
const MILESTONE_FIXTURE_HELPER = nodePath.resolve(
  __dirname,
  '../.maestro/shared/nav/open-fixture-chapter-from-milestone.yaml',
);

const VALUE_FLAGS = new Set([
  '--config',
  '--include-tags',
  '--exclude-tags',
  '--test-output-dir',
  '--device',
  '--format',
  '--debug-output',
  '--driver-host-port',
  '--shard-split',
  '--env',
  '-e',
]);

function parseTagArg(value) {
  return parseIdList(value);
}

function parseFlowTags(yaml) {
  const tags = [];
  const inline = String(yaml).match(/^tags:\s*\[([^\]]*)\]/m);
  if (inline)
    return inline[1]
      .split(',')
      .map(tag => tag.trim().replace(/^(['"])(.*)\1$/, '$2'))
      .filter(Boolean);
  let inTags = false;
  for (const line of String(yaml).split(/\r?\n/)) {
    if (!inTags) {
      if (/^tags:\s*$/.test(line)) inTags = true;
      continue;
    }
    const item = line.match(/^  - (\S+)\s*$/);
    if (item) {
      tags.push(item[1]);
      continue;
    }
    if (/^\S/.test(line)) break;
  }
  return tags;
}

function referencesFixtureChapter(yaml) {
  return String(yaml).includes(FIXTURE_CHAPTER_HELPER);
}

// This alternative accepts only an actual unconditional scalar runFlow command
// resolving to the repository helper, never a filename in comments or strings.
function referencesMilestoneFixture(yaml, flowPath) {
  const body = String(yaml).split(/^---\s*$/m)[1] || '';
  return body.split(/\r?\n/).some(line => {
    const command = line.match(
      /^- runFlow:\s+(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^\s#'"]+))\s*$/,
    );
    if (!command) return false;
    const target = command[1] || command[2] || command[3];
    return (
      nodePath.resolve(nodePath.dirname(flowPath), target) ===
      MILESTONE_FIXTURE_HELPER
    );
  });
}

function flowSelected(tags, includeTags, excludeTags) {
  if (excludeTags.some(tag => tags.includes(tag))) return false;
  if (includeTags.length === 0) return true;
  return includeTags.some(tag => tags.includes(tag));
}

function parseMaestroInvocation(argv) {
  const includeTags = [];
  const excludeTags = [];
  const paths = [];
  const args = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') continue;
    const inline = arg.match(/^--([^=]+)=(.*)$/);
    if (inline) {
      const flag = `--${inline[1]}`;
      if (flag === '--include-tags')
        includeTags.push(...parseTagArg(inline[2]));
      else if (flag === '--exclude-tags') {
        excludeTags.push(...parseTagArg(inline[2]));
      }
      continue;
    }
    if (VALUE_FLAGS.has(arg)) {
      const value = args[i + 1];
      i += 1;
      if (arg === '--include-tags') includeTags.push(...parseTagArg(value));
      else if (arg === '--exclude-tags')
        excludeTags.push(...parseTagArg(value));
      continue;
    }
    if (arg.startsWith('-')) continue;
    paths.push(arg);
  }
  return { includeTags, excludeTags, paths };
}

const PFO_DOWNLOAD_TAG = 'pfo-download';

/** Strip full-line YAML comments before mutation / admission scans. */
function stripYamlComments(yaml) {
  return String(yaml)
    .split(/\r?\n/)
    .filter(line => !/^\s*#/.test(line))
    .join('\n');
}

/**
 * Reject manifests whose observed catalog advertises unknown/incomplete
 * network sizes (e.g. Reference Images `0 B`). Aggregate UI totals alone
 * (2.4 MB) are not sufficient — unknown is not free (#756 / #51 harness).
 */
function evaluateObservedSizeCompleteness(manifest) {
  const adm = manifest && manifest.admission;
  const payload = (manifest && manifest.payload) || {};
  if (!adm || typeof adm !== 'object') {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'pfo-download manifest missing admission object',
    };
  }
  if (adm.requireCompleteKnownSizes !== true) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason:
        'pfo-download admission requireCompleteKnownSizes must be true (unknown/incomplete sizes are NONADMISSIBLE)',
    };
  }
  const completeness = String(
    adm.sizeCompleteness || payload.sizeCompleteness || '',
  ).trim();
  if (completeness !== 'all-known-complete') {
    return {
      ok: false,
      status: 'NONADMISSIBLE',
      reason:
        `pfo-download sizeCompleteness=${completeness || '(missing)'} is not all-known-complete (fail closed; UI aggregate alone is not admission)`,
    };
  }
  const groups = Array.isArray(payload.observedGroups)
    ? payload.observedGroups
    : [];
  for (const group of groups) {
    const items = Array.isArray(group && group.items) ? group.items : [];
    for (const raw of items) {
      const label = String(raw || '');
      if (/\bIncluded\b/i.test(label)) {
        continue;
      }
      // Downloadable network rows labeled 0 B are UNKNOWN, not free.
      if (/\b0\s*B\b/i.test(label)) {
        return {
          ok: false,
          status: 'NONADMISSIBLE',
          reason:
            `pfo-download observed group advertises unknown/zero size (${label}) — not free; refuse transfer admission`,
        };
      }
      if (/\bUnknown\b/i.test(label) || /\bSize incomplete\b/i.test(label)) {
        return {
          ok: false,
          status: 'NONADMISSIBLE',
          reason:
            `pfo-download observed group has incomplete size label (${label})`,
        };
      }
    }
  }
  if (groups.length === 0) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason:
        'pfo-download admission requires payload.observedGroups with known-complete sizes (no predownload oracle backfill)',
    };
  }
  return { ok: true, status: 'PASS', reason: '' };
}

/**
 * Narrow PFO project-download admission (default deny).
 * Mutating flows tagged pfo-download may skip chapter-fixture pin only when
 * MAESTRO_PFO_DOWNLOAD_ADMISSION + MAESTRO_PFO_DOWNLOAD_MANIFEST name a
 * reviewed manifest whose static constraints match the flow body.
 * Runtime device predicates remain host-side (not claimed here).
 */
function loadPfoDownloadManifest(env, fs, path, cwd) {
  const admissionId = String(env.MAESTRO_PFO_DOWNLOAD_ADMISSION || '').trim();
  const manifestRel = String(env.MAESTRO_PFO_DOWNLOAD_MANIFEST || '').trim();
  if (!admissionId && !manifestRel) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason:
        'pfo-download mutating flow requires MAESTRO_PFO_DOWNLOAD_ADMISSION and MAESTRO_PFO_DOWNLOAD_MANIFEST',
    };
  }
  if (!admissionId || !manifestRel) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason:
        'pfo-download admission requires both MAESTRO_PFO_DOWNLOAD_ADMISSION and MAESTRO_PFO_DOWNLOAD_MANIFEST',
    };
  }
  const base = cwd || process.cwd();
  const manifestPath = path.resolve(base, manifestRel);
  if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `pfo-download manifest not found: ${manifestRel}`,
    };
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `pfo-download manifest parse failed: ${error.message}`,
    };
  }
  const adm = manifest && manifest.admission;
  if (!adm || typeof adm !== 'object') {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'pfo-download manifest missing admission object',
    };
  }
  if (String(adm.id || '') !== admissionId) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `pfo-download admission id mismatch (env=${admissionId}, manifest=${adm.id})`,
    };
  }
  if (String(adm.kind || '') !== 'pfo-project-download') {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `pfo-download admission kind refused: ${adm.kind}`,
    };
  }
  const maxBytes = Number(adm.maxBytes);
  if (!Number.isFinite(maxBytes) || maxBytes <= 0 || maxBytes > 5242880) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'pfo-download admission maxBytes must be in (0, 5242880]',
    };
  }
  if (String(adm.projectId || '') !== '13') {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'pfo-download admission projectId must be 13 for this capability',
    };
  }
  if (String(adm.actorUserId || '') !== '9') {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'pfo-download admission actorUserId must be 9 (cached PM9)',
    };
  }
  if (String(adm.book || '') !== 'Matthew') {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'pfo-download admission book must be Matthew',
    };
  }
  const chapters = Array.isArray(adm.chaptersExact) ? adm.chaptersExact : null;
  if (
    !chapters ||
    chapters.length !== 1 ||
    Number(chapters[0]) !== 1
  ) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'pfo-download admission chaptersExact must be [1] only',
    };
  }
  if (adm.requireKnownPositiveTotal !== true) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'pfo-download admission requireKnownPositiveTotal must be true',
    };
  }
  if (adm.requireEmptyQueue !== true) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'pfo-download admission requireEmptyQueue must be true',
    };
  }
  if (adm.allowGenericUnlimitedDownload === true) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'pfo-download refuses allowGenericUnlimitedDownload',
    };
  }
  const sizeCheck = evaluateObservedSizeCompleteness(manifest);
  if (!sizeCheck.ok) {
    return {
      ok: false,
      status: sizeCheck.status || 'BLOCKED',
      reason: sizeCheck.reason,
      manifest,
      manifestPath,
      adm,
    };
  }
  return { ok: true, status: 'PASS', reason: '', manifest, manifestPath, adm };
}

function scanPfoDownloadFlowBody(yaml, adm, flowPath) {
  const body = stripYamlComments(yaml);
  const forbiddenCommand = [
    [/^\s*-\s*clearState\b/m, 'clearState'],
    [/^\s*-\s*clearKeychain\b/m, 'clearKeychain'],
    [/^\s*-\s*startRecording\b/m, 'startRecording'],
    [/^\s*-\s*stopRecording\b/m, 'stopRecording'],
    [/^\s*-\s*setAirplaneMode\b/m, 'setAirplaneMode'],
    [/^\s*-\s*toggleAirplaneMode\b/m, 'toggleAirplaneMode'],
    [/^\s*-\s*setLocation\b/m, 'setLocation'],
    [/^\s*-\s*inputText\b/m, 'inputText'],
    [/^\s*-\s*eraseText\b/m, 'eraseText'],
    [/open-my-work-chapter\.yaml/, 'open-my-work-chapter'],
    [
      /open-fixture-chapter-from-milestone\.yaml/,
      'open-fixture-chapter-from-milestone',
    ],
    // Action taps only — assertNotVisible login-email-input is allowed.
    [
      /^\s*-\s*(tapOn|longPressOn)\s*:\s*\n(?:\s+[^\n]*\n)*?\s*id:\s*['"]?record-(start|stop|pause|resume)-button/m,
      'record-control-tap',
    ],
    [
      /^\s*-\s*(tapOn|longPressOn|inputText)\s*:\s*\n(?:\s+[^\n]*\n)*?\s*id:\s*['"]?login-(email|password|submit)/m,
      'login-control-mutation',
    ],
  ];
  for (const [re, label] of forbiddenCommand) {
    if (re.test(body)) {
      return {
        ok: false,
        status: 'BLOCKED',
        reason: `pfo-download flow refuses forbidden mutation/capability: ${label} in ${flowPath}`,
        flows: [flowPath],
      };
    }
  }
  // Wrong project row (any project-row that is not 13).
  if (/project-row-(?!13\b)\d+/.test(body)) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `pfo-download flow targets non-admitted project row in ${flowPath}`,
      flows: [flowPath],
    };
  }
  if (!/project-row-13/.test(body)) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `pfo-download flow missing project-row-13 in ${flowPath}`,
      flows: [flowPath],
    };
  }
  if (!new RegExp(`settings-menu-account-${adm.actorUserId}`).test(body)) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `pfo-download flow missing actor account ${adm.actorUserId} in ${flowPath}`,
      flows: [flowPath],
    };
  }
  // Other gospel expands / multi-chapter selection.
  if (/Expand (Mark|Luke|John|Acts|Romans)\b/.test(body)) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `pfo-download flow expands non-Matthew book in ${flowPath}`,
      flows: [flowPath],
    };
  }
  if (!/Expand Matthew/.test(body) || !/Chapter 1/.test(body)) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `pfo-download flow must select Matthew chapter 1 in ${flowPath}`,
      flows: [flowPath],
    };
  }
  // Tap other chapters (Chapter 2+) — allow text asserts but block tapOn Chapter N≠1.
  const chapterTaps = body.matchAll(
    /tapOn:\s*\n\s*text:\s*'?\^?Chapter\s+(\d+)/g,
  );
  for (const m of chapterTaps) {
    if (Number(m[1]) !== 1) {
      return {
        ok: false,
        status: 'BLOCKED',
        reason: `pfo-download flow taps Chapter ${m[1]} (only 1 admitted) in ${flowPath}`,
        flows: [flowPath],
      };
    }
  }
  if (/Assigned|Select all chapters|Select-all/i.test(body)) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `pfo-download refuses bulk/assigned select-all in ${flowPath}`,
      flows: [flowPath],
    };
  }
  if (!/prepare-offline-download-button/.test(body)) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `pfo-download flow missing prepare-offline-download-button in ${flowPath}`,
      flows: [flowPath],
    };
  }
  // Bare Download text tap forbidden; id tap required.
  if (/tapOn:\s*\n\s*text:\s*'?\^?Download\$?'?/.test(body)) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `pfo-download refuses bare Download text tap in ${flowPath}`,
      flows: [flowPath],
    };
  }
  const downloadTaps = body.match(
    /tapOn:\s*\n\s*id:\s*'prepare-offline-download-button'/g,
  );
  if (!downloadTaps || downloadTaps.length !== 1) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `pfo-download requires exactly one download-button tap in ${flowPath}`,
      flows: [flowPath],
    };
  }
  // Exact observed fixture size literals BEFORE the Download tap (not merely
  // non-zero / wildcard). Drawn from manifest observedUi* labels (2.4 MB).
  const tapMatch = body.match(
    /tapOn:\s*\n\s*id:\s*'prepare-offline-download-button'/,
  );
  if (!tapMatch) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `pfo-download missing download-button tap in ${flowPath}`,
      flows: [flowPath],
    };
  }
  const beforeTap = body.slice(0, tapMatch.index);
  const hasExactTotal =
    /id:\s*'prepare-offline-total-bytes'\s*\n\s*text:\s*'\^2\\\.4 MB\$'/.test(
      beforeTap,
    );
  const hasExactDownload =
    /id:\s*'prepare-offline-download-button'\s*\n\s*enabled:\s*true\s*\n\s*text:\s*'\^Download 2\\\.4 MB\$'/.test(
      beforeTap,
    );
  if (!hasExactTotal || !hasExactDownload) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason:
        `pfo-download must assert exact total ^2\\.4 MB$ and enabled Download ^Download 2\\.4 MB$ before tap in ${flowPath}`,
      flows: [flowPath],
    };
  }
  // Reject oversized / unknown wildcard size asserts ahead of tap.
  if (
    /prepare-offline-total-bytes[\s\S]{0,120}999/.test(beforeTap) ||
    /Download 999/.test(beforeTap) ||
    /prepare-offline-total-bytes[\s\S]{0,160}\\d\+\(\\\.\\d\+\)\?/.test(
      beforeTap,
    ) ||
    /Download \(\?!0 B\$\)/.test(beforeTap)
  ) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `pfo-download refuses non-exact or oversized size assert before tap in ${flowPath}`,
      flows: [flowPath],
    };
  }
  return { ok: true, status: 'PASS', reason: '' };
}

function evaluatePfoDownloadAdmission({
  flows,
  projectId,
  allowlist,
  denylist,
  fixtureEnv,
  cwd,
  fs,
  path,
}) {
  const nodeFs = fs || require('fs');
  const nodePath = path || require('path');
  const env = fixtureEnv || {};
  const loaded = loadPfoDownloadManifest(env, nodeFs, nodePath, cwd);
  if (!loaded.ok) return { ...loaded, flows: (flows || []).map(f => f.path) };

  const project = assertProjectAllowed(projectId, allowlist, denylist);
  if (!project.ok) return { ...project, flows: (flows || []).map(f => f.path) };
  if (String(projectId) !== String(loaded.adm.projectId)) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `pfo-download projectId env ${projectId} != admission ${loaded.adm.projectId}`,
      flows: (flows || []).map(f => f.path),
    };
  }

  for (const flow of flows || []) {
    const tags = parseFlowTags(flow.yaml);
    if (!tags.includes('mutating') || !tags.includes(PFO_DOWNLOAD_TAG)) {
      return {
        ok: false,
        status: 'BLOCKED',
        reason: `pfo-download admission requires mutating+${PFO_DOWNLOAD_TAG} tags: ${flow.path}`,
        flows: [flow.path],
      };
    }
    const scan = scanPfoDownloadFlowBody(flow.yaml, loaded.adm, flow.path);
    if (!scan.ok) return scan;
  }
  return {
    ok: true,
    status: 'PASS',
    reason: '',
    flows: (flows || []).map(f => f.path),
    admission: loaded.adm.id,
  };
}

function evaluateChapterPreflight({
  chapterId,
  milestoneId,
  projectId,
  allowlist,
  denylist,
  flows,
  includeTags,
  excludeTags,
  fixtureEnv,
  cwd,
  fs,
  path,
}) {
  const include = includeTags || [];
  const exclude = excludeTags || [];
  const needingChapter = [];
  const needingMilestone = [];
  const mutating = [];
  const unpinned = [];
  const pfoDownloadFlows = [];
  for (const flow of flows || []) {
    const tags = parseFlowTags(flow.yaml);
    if (!flowSelected(tags, include, exclude)) continue;
    const milestonePinned = referencesMilestoneFixture(flow.yaml, flow.path);
    const pinned = referencesFixtureChapter(flow.yaml) || milestonePinned;
    if (milestonePinned) needingMilestone.push(flow.path);
    if (pinned) needingChapter.push(flow.path);
    if (!tags.includes('mutating')) continue;
    mutating.push(flow.path);
    if (pinned) continue;
    if (tags.includes(PFO_DOWNLOAD_TAG)) {
      pfoDownloadFlows.push(flow);
      continue;
    }
    unpinned.push(flow.path);
  }
  if (unpinned.length > 0) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'mutating flow does not target MAESTRO_FIXTURE_CHAPTER_ID',
      flows: unpinned,
    };
  }
  // ALWAYS enforce project allow/deny for any mutating flow. PFO admission
  // adds a stricter path; it must never replace this gate.
  if (mutating.length > 0) {
    const project = assertProjectAllowed(projectId, allowlist, denylist);
    if (!project.ok) return { ...project, flows: mutating };
  }
  if (pfoDownloadFlows.length > 0) {
    const admitted = evaluatePfoDownloadAdmission({
      flows: pfoDownloadFlows,
      projectId,
      allowlist,
      denylist,
      fixtureEnv,
      cwd,
      fs,
      path,
    });
    if (!admitted.ok) return admitted;
  }
  if (needingChapter.length === 0) {
    return { ok: true, status: 'PASS', reason: '', flows: [] };
  }
  if (!String(chapterId ?? '').trim()) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'MAESTRO_FIXTURE_CHAPTER_ID is empty',
      flows: needingChapter,
    };
  }
  if (
    needingMilestone.length > 0 &&
    (!/^[1-9][0-9]*$/.test(String(milestoneId ?? '')) ||
      !/^[1-9][0-9]*$/.test(String(chapterId ?? '')))
  ) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason:
        'milestone fixture requires positive MAESTRO_FIXTURE_MILESTONE_ID and MAESTRO_FIXTURE_CHAPTER_ID',
      flows: needingMilestone,
    };
  }
  return { ok: true, status: 'PASS', reason: '', flows: needingChapter };
}

function collectYamlFiles(target, fs, path) {
  if (!fs.existsSync(target)) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: `flow path not found: ${target}`,
      files: [],
    };
  }
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    const yaml = target.endsWith('.yaml') || target.endsWith('.yml');
    return {
      ok: true,
      status: 'PASS',
      reason: '',
      files: yaml ? [target] : [],
    };
  }
  const files = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'test_output') continue;
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) {
      const nested = collectYamlFiles(full, fs, path);
      if (!nested.ok) return nested;
      files.push(...nested.files);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))
    ) {
      files.push(full);
    }
  }
  return { ok: true, status: 'PASS', reason: '', files };
}

// Ordered journeys inspect every reachable static dependency, even conditional
// children. Unknown/dynamic paths and fixture overrides fail closed; no JS runs.
function collectJourneyDependencies(files, env, fs, path) {
  const flows = [];
  const visiting = new Set();
  const visited = new Set();
  function visit(file) {
    file = path.resolve(file);
    if (visiting.has(file))
      throw new Error(`cyclic runFlow dependency: ${file}`);
    if (visited.has(file)) return;
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new Error(`nested flow path not found: ${file}`);
    }
    visiting.add(file);
    const yaml = fs.readFileSync(file, 'utf8');
    flows.push({ path: file, yaml });
    const lines = yaml.split(/\r?\n/);
    const tags = parseFlowTags(yaml);
    // A reviewed readonly classification is explicit; arbitrary tap/input/script
    // fragments are not silently treated as harmless because their tags omit
    // "mutating". Capture/reset/recovery stay separate even with that tag.
    if (
      /^\s*-\s*(launchApp|clearState|clearKeychain|startRecording|stopRecording)\s*:/m.test(
        yaml,
      )
    ) {
      throw new Error(
        `cold/capture/auth flow must remain independent: ${file}`,
      );
    }
    if (
      /^\s*-\s*(tapOn|longPressOn|inputText|eraseText|runScript|evalScript|setLocation|pressKey)\s*:/m.test(
        yaml,
      ) &&
      !tags.includes('mutating') &&
      !tags.includes('ordered-readonly')
    ) {
      throw new Error(
        `unclassified action flow; declare reviewed ordered-readonly or mutating: ${file}`,
      );
    }
    for (let i = 0; i < lines.length; i += 1) {
      const action = lines[i].match(/^(\s*)-\s*(tapOn|longPressOn)\s*:/);
      if (action) {
        let block = lines[i];
        for (let j = i + 1; j < lines.length; j += 1) {
          if (
            lines[j].trim() &&
            lines[j].match(/^\s*/)[0].length <= action[1].length
          )
            break;
          block += '\n' + lines[j];
        }
        if (
          /record-(start|stop|pause|resume)-button|login-(email|password|submit)/.test(
            block,
          )
        ) {
          throw new Error(
            `capture/auth action must remain independent: ${file}`,
          );
        }
      }
      if (lines[i].trim().startsWith('#')) continue;
      if (/^\s*env\s*:\s*[^#\s]/.test(lines[i])) {
        throw new Error(
          `inline/dynamic env unsupported in ordered journeys: ${file}`,
        );
      }
      if (/(^|:\s*|-\s*)[&*][A-Za-z_][\w-]*/.test(lines[i])) {
        throw new Error(
          `YAML anchors/aliases unsupported in ordered journeys: ${file}`,
        );
      }
      const dependencyLine = /["']?(runFlow|runScript)["']?\s*:/.test(lines[i]);
      const canonicalDependency = /^(\s*)-\s+(runFlow|runScript)\s*:/.test(
        lines[i],
      );
      if (dependencyLine && !canonicalDependency) {
        throw new Error(`unsupported dependency syntax in ${file}`);
      }
      const override = lines[i].match(
        /^\s*["']?(MAESTRO_(?:FIXTURE|DISPOSABLE|INCOMPLETE|A|B)_[A-Z0-9_]+)["']?:\s*(.*?)\s*$/,
      );
      if (override) {
        const value = override[2].replace(/^(['"])(.*)\1$/, '$2');
        if (value !== env[override[1]] && value !== '${' + override[1] + '}') {
          throw new Error(
            `nested fixture override refused: ${override[1]} in ${file}`,
          );
        }
      }
      const command = lines[i].match(
        /^(\s*)-\s+(runFlow|runScript)\s*:\s*(.*?)\s*$/,
      );
      if (!command) continue;
      const kind = command[2];
      let target = command[3];
      if (!target || target.startsWith('#')) {
        target = '';
        const indent = command[1].length;
        for (let j = i + 1; j < lines.length; j += 1) {
          if (!lines[j].trim() || lines[j].trim().startsWith('#')) continue;
          const nextIndent = lines[j].match(/^\s*/)[0].length;
          if (nextIndent <= indent) break;
          const fileField = lines[j].match(/^\s*file:\s*(.*?)\s*$/);
          if (fileField) {
            target = fileField[1];
            break;
          }
        }
      }
      if (!target) continue; // Inline commands are scanned by this same loop.
      target = target.replace(/\s+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2');
      if (
        target.includes('${') ||
        !(kind === 'runFlow' ? /\.ya?ml$/ : /\.js$/).test(target)
      ) {
        throw new Error(`unsupported ${kind} path in ${file}`);
      }
      const dependency = path.resolve(path.dirname(file), target);
      if (kind === 'runFlow') visit(dependency);
      else if (
        !fs.existsSync(dependency) ||
        !fs.statSync(dependency).isFile()
      ) {
        throw new Error(`nested script path not found: ${dependency}`);
      }
    }
    visiting.delete(file);
    visited.add(file);
  }
  for (const file of files) visit(file);
  return flows;
}

function preflightFromArgv({
  chapterId,
  milestoneId,
  projectId,
  allowlist,
  denylist,
  argv,
  recursive = false,
  fixtureEnv = {},
  cwd,
  fs,
  path,
}) {
  const nodeFs = fs || require('fs');
  const nodePath = path || require('path');
  const parsed = parseMaestroInvocation(argv);
  const base = cwd || process.cwd();
  const flows = [];
  for (const raw of parsed.paths) {
    const target = nodePath.resolve(base, raw);
    const collected = collectYamlFiles(target, nodeFs, nodePath);
    if (!collected.ok) return { ...collected, flows: [] };
    for (const file of collected.files) {
      flows.push({ path: file, yaml: nodeFs.readFileSync(file, 'utf8') });
    }
  }
  if (recursive) {
    try {
      const nested = collectJourneyDependencies(
        flows.map(flow => flow.path),
        fixtureEnv,
        nodeFs,
        nodePath,
      );
      // Child tags are not CLI selection boundaries. Do not let tag filters hide
      // a dependency that its selected parent executes.
      return evaluateChapterPreflight({
        chapterId,
        milestoneId,
        projectId,
        allowlist,
        denylist,
        flows: nested,
        includeTags: [],
        excludeTags: [],
        fixtureEnv,
        cwd: base,
        fs: nodeFs,
        path: nodePath,
      });
    } catch (error) {
      return { ok: false, status: 'BLOCKED', reason: error.message, flows: [] };
    }
  }
  return evaluateChapterPreflight({
    chapterId,
    milestoneId,
    projectId,
    allowlist,
    denylist,
    flows,
    includeTags: parsed.includeTags,
    excludeTags: parsed.excludeTags,
    fixtureEnv,
    cwd: base,
    fs: nodeFs,
    path: nodePath,
  });
}

function runPreflightCli(argv, env, io) {
  const stderr = io && io.stderr ? io.stderr : console.error;
  const exit = io && io.exit ? io.exit : code => process.exit(code);
  const recursive = argv[0] === '--recursive';
  if (recursive) argv = argv.slice(1);
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const result = preflightFromArgv({
    chapterId: env.MAESTRO_FIXTURE_CHAPTER_ID,
    milestoneId: env.MAESTRO_FIXTURE_MILESTONE_ID,
    projectId: env.MAESTRO_FIXTURE_PROJECT_ID,
    allowlist: env.MAESTRO_FIXTURE_PROJECT_ALLOWLIST,
    denylist: env.MAESTRO_FIXTURE_PROJECT_DENYLIST,
    argv: args,
    recursive,
    fixtureEnv: env,
  });
  if (!result.ok) {
    stderr(`BLOCKED: ${result.reason}`);
    for (const file of result.flows || []) stderr(`  ${file}`);
    exit(2);
    return;
  }
  exit(0);
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv[0] !== '--preflight') {
    console.error(
      'usage: node scripts/maestro-fixture-guard.cjs --preflight -- [maestro args]',
    );
    process.exit(1);
  }
  runPreflightCli(argv.slice(1), process.env);
}

module.exports = {
  parseIdList,
  assertProjectAllowed,
  parseFlowTags,
  parseMaestroInvocation,
  referencesFixtureChapter,
  flowSelected,
  stripYamlComments,
  loadPfoDownloadManifest,
  evaluateObservedSizeCompleteness,
  scanPfoDownloadFlowBody,
  evaluatePfoDownloadAdmission,
  evaluateChapterPreflight,
  preflightFromArgv,
  runPreflightCli,
  PFO_DOWNLOAD_TAG,
};
