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
      if (flag === '--include-tags') includeTags.push(...parseTagArg(inline[2]));
      else if (flag === '--exclude-tags') {
        excludeTags.push(...parseTagArg(inline[2]));
      }
      continue;
    }
    if (VALUE_FLAGS.has(arg)) {
      const value = args[i + 1];
      i += 1;
      if (arg === '--include-tags') includeTags.push(...parseTagArg(value));
      else if (arg === '--exclude-tags') excludeTags.push(...parseTagArg(value));
      continue;
    }
    if (arg.startsWith('-')) continue;
    paths.push(arg);
  }
  return { includeTags, excludeTags, paths };
}

function evaluateChapterPreflight({
  chapterId,
  projectId,
  allowlist,
  denylist,
  flows,
  includeTags,
  excludeTags,
}) {
  const include = includeTags || [];
  const exclude = excludeTags || [];
  const needingChapter = [];
  const mutating = [];
  const unpinned = [];
  for (const flow of flows || []) {
    const tags = parseFlowTags(flow.yaml);
    if (!flowSelected(tags, include, exclude)) continue;
    const pinned = referencesFixtureChapter(flow.yaml);
    if (pinned) needingChapter.push(flow.path);
    if (!tags.includes('mutating')) continue;
    mutating.push(flow.path);
    if (!pinned) unpinned.push(flow.path);
  }
  if (unpinned.length > 0) {
    return {
      ok: false,
      status: 'BLOCKED',
      reason: 'mutating flow does not target MAESTRO_FIXTURE_CHAPTER_ID',
      flows: unpinned,
    };
  }
  if (mutating.length > 0) {
    const project = assertProjectAllowed(projectId, allowlist, denylist);
    if (!project.ok) return { ...project, flows: mutating };
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
    return { ok: true, status: 'PASS', reason: '', files: yaml ? [target] : [] };
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

function preflightFromArgv({
  chapterId,
  projectId,
  allowlist,
  denylist,
  argv,
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
  return evaluateChapterPreflight({
    chapterId,
    projectId,
    allowlist,
    denylist,
    flows,
    includeTags: parsed.includeTags,
    excludeTags: parsed.excludeTags,
  });
}

function runPreflightCli(argv, env, io) {
  const stderr = io && io.stderr ? io.stderr : console.error;
  const exit = io && io.exit ? io.exit : code => process.exit(code);
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const result = preflightFromArgv({
    chapterId: env.MAESTRO_FIXTURE_CHAPTER_ID,
    projectId: env.MAESTRO_FIXTURE_PROJECT_ID,
    allowlist: env.MAESTRO_FIXTURE_PROJECT_ALLOWLIST,
    denylist: env.MAESTRO_FIXTURE_PROJECT_DENYLIST,
    argv: args,
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
  evaluateChapterPreflight,
  preflightFromArgv,
  runPreflightCli,
};
