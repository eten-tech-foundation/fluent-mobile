/**
 * After a successful nightly APK, comment the install URL on issues that
 * received a post-merge QA handoff (`<!-- qa-nightly-handoff -->`) since the
 * previous successful nightly (PREV_SHA commit time, or ~36h ago).
 *
 * Soft-fails: nightly success must not fail if issue comments fail.
 *
 * Env:
 *   INSTALL_URL — required
 *   BUILD_ID — optional (shown in comment)
 *   APP_VERSION — optional
 *   SHORT_SHA — optional
 *   PREV_SHA — prior successful nightly head (optional)
 *   RUN_URL — Actions run URL (optional)
 */

'use strict';

const {
  HANDOFF_MARKER,
} = require('./qa-handoff-on-merge.cjs');

const INSTALL_MARKER = '<!-- qa-nightly-install -->';

/**
 * @param {string | null | undefined} prevSha
 * @param {import('@octokit/rest').Octokit} github
 * @param {string} owner
 * @param {string} repo
 * @returns {Promise<string>} ISO timestamp
 */
async function resolveSinceIso(prevSha, github, owner, repo) {
  if (prevSha && typeof prevSha === 'string' && prevSha.trim()) {
    try {
      const { data } = await github.rest.repos.getCommit({
        owner,
        repo,
        ref: prevSha.trim(),
      });
      const date =
        data.commit?.committer?.date || data.commit?.author?.date;
      if (date) return date;
    } catch {
      // fall through
    }
  }
  // No prior nightly — look back ~36h so we don't miss same-day handoffs
  return new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
}

/**
 * @param {{ installUrl: string, buildId?: string | null, appVersion?: string | null, shortSha?: string | null, runUrl?: string | null }} opts
 * @returns {string}
 */
function buildNightlyInstallComment({
  installUrl,
  buildId,
  appVersion,
  shortSha,
  runUrl,
}) {
  const lines = [
    INSTALL_MARKER,
    '',
    '## Nightly APK ready for QA',
    '',
    'A new **Fluent nightly** Android APK is ready. Install this build to QA tickets handed off after the previous nightly.',
    '',
    `### 👉 [Install Fluent nightly](${installUrl})`,
    '',
    '| | |',
    '|---|---|',
  ];
  if (appVersion) lines.push(`| App version | \`${appVersion}\` |`);
  if (buildId) lines.push(`| Build | \`${buildId}\` |`);
  if (shortSha) lines.push(`| Commit | \`${shortSha}\` |`);
  if (runUrl) lines.push(`| Workflow | [run](${runUrl}) |`);
  lines.push(
    '',
    '**Not Expo Go.** Sign in on expo.dev if asked, install the APK, then open **Fluent**.',
    '',
    '---',
    '_Nightly follow-up for post-merge QA. See `docs/guides/qa-preview-testing.md`._',
  );
  return lines.join('\n');
}

/**
 * Collect issue numbers that got a handoff comment since `sinceIso`.
 * @returns {Promise<number[]>}
 */
async function findHandoffIssueNumbers(github, owner, repo, sinceIso) {
  const issueNumbers = new Set();
  let page = 1;
  // Repo issue comments API includes PR comments; we only keep handoff markers.
  while (page <= 10) {
    const { data: comments } = await github.rest.issues.listCommentsForRepo({
      owner,
      repo,
      since: sinceIso,
      per_page: 100,
      page,
      sort: 'created',
      direction: 'asc',
    });
    if (!comments.length) break;
    for (const comment of comments) {
      if (!comment.body?.includes(HANDOFF_MARKER)) continue;
      if (comment.user?.login !== 'github-actions[bot]') continue;
      // issue_url ends with /issues/NNN (PRs use /issues/NNN too in this API)
      const match = String(comment.issue_url || '').match(/\/issues\/(\d+)$/);
      if (match) issueNumbers.add(Number(match[1]));
    }
    if (comments.length < 100) break;
    page += 1;
  }
  return [...issueNumbers].sort((a, b) => a - b);
}

/**
 * @param {object} args
 * @param {import('@octokit/rest').Octokit} args.github
 * @param {import('@actions/github').Context} args.context
 * @param {{ warning: Function, info: Function }} args.core
 * @param {string} args.installUrl
 * @param {string | null} [args.buildId]
 * @param {string | null} [args.appVersion]
 * @param {string | null} [args.shortSha]
 * @param {string | null} [args.prevSha]
 * @param {string | null} [args.runUrl]
 */
async function nightlyNotifyQaIssues({
  github,
  context,
  core,
  installUrl,
  buildId = null,
  appVersion = null,
  shortSha = null,
  prevSha = null,
  runUrl = null,
}) {
  try {
    return await nightlyNotifyQaIssuesInner({
      github,
      context,
      core,
      installUrl,
      buildId,
      appVersion,
      shortSha,
      prevSha,
      runUrl,
    });
  } catch (error) {
    core.warning(
      `nightly-notify-qa-issues failed (soft): ${error.message}`,
    );
    return { skipped: true, reason: 'unexpected_error' };
  }
}

async function nightlyNotifyQaIssuesInner({
  github,
  context,
  core,
  installUrl,
  buildId = null,
  appVersion = null,
  shortSha = null,
  prevSha = null,
  runUrl = null,
}) {
  if (!installUrl || typeof installUrl !== 'string') {
    core.warning('nightly-notify-qa-issues: missing INSTALL_URL — skipping');
    return { skipped: true, reason: 'no_install_url' };
  }

  const owner = context.repo.owner;
  const repo = context.repo.repo;

  let sinceIso;
  try {
    sinceIso = await resolveSinceIso(prevSha, github, owner, repo);
  } catch (error) {
    core.warning(`Could not resolve since date: ${error.message}`);
    sinceIso = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  }
  core.info(`Looking for handoff comments since ${sinceIso}`);

  let issueNumbers;
  try {
    issueNumbers = await findHandoffIssueNumbers(
      github,
      owner,
      repo,
      sinceIso,
    );
  } catch (error) {
    core.warning(`Could not list handoff issues: ${error.message}`);
    return { skipped: true, reason: 'list_failed' };
  }

  if (issueNumbers.length === 0) {
    core.info('No recent QA handoff comments — nothing to notify');
    return { skipped: true, reason: 'no_handoffs', issueNumbers: [] };
  }

  // Drop pull requests (same number space): only notify real issues
  const realIssues = [];
  for (const n of issueNumbers) {
    try {
      const { data } = await github.rest.issues.get({
        owner,
        repo,
        issue_number: n,
      });
      if (data.pull_request) {
        core.info(`#${n} is a PR — skipping nightly install comment`);
        continue;
      }
      realIssues.push(n);
    } catch (error) {
      core.warning(`Could not load #${n}: ${error.message}`);
    }
  }

  if (realIssues.length === 0) {
    core.info('No issue handoffs to notify');
    return { skipped: true, reason: 'no_issues', issueNumbers: [] };
  }

  const body = buildNightlyInstallComment({
    installUrl,
    buildId,
    appVersion,
    shortSha,
    runUrl,
  });

  core.info(
    `Posting nightly install on ${realIssues.map(n => `#${n}`).join(', ')}`,
  );

  for (const issueNumber of realIssues) {
    try {
      const { data: comments } = await github.rest.issues.listComments({
        owner,
        repo,
        issue_number: issueNumber,
        per_page: 100,
      });
      const prior = comments.filter(
        c =>
          c.user?.login === 'github-actions[bot]' &&
          c.body?.includes(INSTALL_MARKER),
      );
      for (const comment of prior) {
        try {
          await github.rest.issues.deleteComment({
            owner,
            repo,
            comment_id: comment.id,
          });
        } catch (error) {
          core.warning(
            `Could not delete old install comment ${comment.id}: ${error.message}`,
          );
        }
      }
      await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });
      core.info(`Posted nightly install comment on #${issueNumber}`);
    } catch (error) {
      core.warning(
        `Could not comment on #${issueNumber}: ${error.message}`,
      );
    }
  }

  return { skipped: false, issueNumbers: realIssues };
}

module.exports = nightlyNotifyQaIssues;
module.exports.buildNightlyInstallComment = buildNightlyInstallComment;
module.exports.findHandoffIssueNumbers = findHandoffIssueNumbers;
module.exports.resolveSinceIso = resolveSinceIso;
module.exports.INSTALL_MARKER = INSTALL_MARKER;
