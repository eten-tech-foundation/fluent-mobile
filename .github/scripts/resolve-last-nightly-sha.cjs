/**
 * Find the HEAD SHA of the last Nightly Preview run that actually
 * considered an APK (built via EAS, or intentionally skipped for
 * unchanged HEAD). Ignores green “ignored schedule / drifted” no-ops
 * that never reached the build window (#459).
 */

const EAS_STEP = '🚀 EAS nightly Android build (binary only)';
const SKIP_SUMMARY_STEP = 'Write skip summary';

function runConsideredApk(jobs) {
  const apkJob = (jobs || []).find((j) => j.name === 'Nightly Android APK');
  if (!apkJob || !Array.isArray(apkJob.steps)) {
    return false;
  }
  return apkJob.steps.some(
    (s) =>
      s.conclusion === 'success' &&
      (s.name === EAS_STEP || s.name === SKIP_SUMMARY_STEP)
  );
}

/**
 * @param {object[]} runs - workflow_runs from the Actions API
 * @param {(runId: number) => object[]} getJobs - returns jobs for a run
 * @returns {string} head_sha or ''
 */
function resolveLastNightlySha(runs, getJobs) {
  for (const run of runs || []) {
    if (run.conclusion !== 'success' || !run.head_sha) {
      continue;
    }
    let jobs;
    try {
      jobs = getJobs(run.id);
    } catch {
      continue;
    }
    if (runConsideredApk(jobs)) {
      return run.head_sha;
    }
  }
  return '';
}

function fetchViaGh(env = process.env) {
  const { execFileSync } = require('child_process');
  const repo = env.GITHUB_REPOSITORY;
  if (!repo) {
    throw new Error('GITHUB_REPOSITORY is required');
  }
  const runsJson = execFileSync(
    'gh',
    [
      'api',
      '-H',
      'Accept: application/vnd.github+json',
      `/repos/${repo}/actions/workflows/nightly-preview.yml/runs?branch=main&status=completed&per_page=30`,
    ],
    { encoding: 'utf8', env }
  );
  const runs = JSON.parse(runsJson).workflow_runs || [];
  return resolveLastNightlySha(runs, (runId) => {
    const jobsJson = execFileSync(
      'gh',
      [
        'api',
        '-H',
        'Accept: application/vnd.github+json',
        `/repos/${repo}/actions/runs/${runId}/jobs`,
      ],
      { encoding: 'utf8', env }
    );
    return JSON.parse(jobsJson).jobs || [];
  });
}

function printGithubOutput(env = process.env) {
  const sha = fetchViaGh(env);
  process.stdout.write(`prev_sha=${sha}\n`);
  return sha;
}

module.exports = {
  EAS_STEP,
  SKIP_SUMMARY_STEP,
  runConsideredApk,
  resolveLastNightlySha,
  fetchViaGh,
  printGithubOutput,
};

if (require.main === module) {
  try {
    printGithubOutput();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.stdout.write('prev_sha=\n');
    process.exit(0);
  }
}
