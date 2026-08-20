/**
 * Post-merge QA handoff for Needs-QA PRs.
 *
 * When a PR with **Needs QA? Yes** merges:
 *   - Comment on linked issues (`Refs #NNN`) that QA should test the next nightly
 *   - Add @Roslin22 as an assignee (keeps existing assignees)
 *   - Best-effort Project 4 Status → In QA
 *
 * Soft-fails: merge success must not fail if issue/board side effects fail.
 *
 * Linked tickets: same contract as preview-notify-linked-issues.cjs
 * (`Refs #NNN` + legacy closing keywords; ignore `Part of #NNN`).
 *
 * Env (optional):
 *   PROJECT_BOARD_TOKEN — PAT with org project write (preferred for Project 4)
 *   FLUENT_PROJECT_ID / FLUENT_STATUS_FIELD_ID / FLUENT_IN_QA_OPTION_ID
 *   QA_ASSIGNEE_LOGIN — default Roslin22
 */

'use strict';

const {
  resolveLinkedIssueNumbers,
  moveIssuesToInQa,
} = require('./preview-notify-linked-issues.cjs');

const HANDOFF_MARKER = '<!-- qa-nightly-handoff -->';
const DEFAULT_QA_ASSIGNEE = 'Roslin22';
const DEPENDABOT_LOGINS = new Set([
  'dependabot',
  'dependabot[bot]',
  'dependabot-preview[bot]',
]);

/**
 * Detect checked "Yes" under **Needs QA?** in the PR body.
 * Matches common template forms:
 *   - [x] Yes — …
 *   - [X] Yes
 * Avoids matching unchecked `[ ] Yes` or the No checkbox.
 *
 * @param {string | null | undefined} body
 * @returns {boolean}
 */
function needsQaYes(body) {
  const text = String(body || '');
  // Prefer the Needs QA? block when present
  const sectionMatch = text.match(
    /\*\*Needs QA\?\*\*[\s\S]*?(?=\n\*\*[^*]|\n### |\n## |$)/i,
  );
  const scope = sectionMatch ? sectionMatch[0] : text;
  return /^\s*[-*]\s*\[[xX]\]\s*Yes\b/m.test(scope);
}

/**
 * @param {string | null | undefined} login
 * @returns {boolean}
 */
function isDependabotAuthor(login) {
  if (!login || typeof login !== 'string') return false;
  return DEPENDABOT_LOGINS.has(login.trim().toLowerCase());
}

/**
 * @param {{ prNumber: number, prUrl: string, mergeSha?: string | null, qaAssignee?: string }} opts
 * @returns {string}
 */
function buildHandoffCommentBody({
  prNumber,
  prUrl,
  mergeSha,
  qaAssignee = DEFAULT_QA_ASSIGNEE,
}) {
  const lines = [
    HANDOFF_MARKER,
    '',
    '## QA handoff — test the next nightly',
    '',
    `This ticket’s PR [**#${prNumber}**](${prUrl}) **merged**. Device QA is **post-merge** on the next **nightly** Android APK (not an isolated PR preview).`,
  ];
  if (mergeSha) {
    lines.push('', `**Merged commit:** \`${String(mergeSha).slice(0, 7)}\``);
  }
  lines.push(
    '',
    '### What to do',
    '',
    '1. Wait for the next **Nightly Preview** run (scheduled **06:00 UTC**, or the next successful nightly after this merge).',
    '2. Install from the Slack nightly notice or the follow-up comment this bot posts on this issue when the APK is ready.',
    '3. Test the acceptance criteria for this ticket on that nightly build.',
    '4. **Pass:** move Project 4 Status → **Passed QA** (and comment briefly).',
    '5. **Fail:** open a **new** bug issue (code is already on `main`); link it here.',
    '',
    `cc @${qaAssignee}`,
    '',
    '---',
    '_Post-merge QA handoff. See `docs/guides/qa-process.md`._',
  );
  return lines.join('\n');
}

/**
 * @param {object} args
 * @param {import('@octokit/rest').Octokit} args.github
 * @param {import('@actions/github').Context} args.context
 * @param {{ warning: Function, info: Function }} args.core
 * @param {typeof import('@actions/github').getOctokit} [args.getOctokit]
 */
async function qaHandoffOnMerge({ github, context, core, getOctokit }) {
  const pr = context.payload.pull_request;
  if (!pr) {
    core.warning('qa-handoff-on-merge: no pull_request payload — skipping');
    return { skipped: true, reason: 'no_pull_request' };
  }

  if (!pr.merged) {
    core.info('PR closed without merge — skipping QA handoff');
    return { skipped: true, reason: 'not_merged' };
  }

  const authorLogin = pr.user?.login;
  if (isDependabotAuthor(authorLogin)) {
    core.info(`Dependabot PR — skipping QA handoff (${authorLogin})`);
    return { skipped: true, reason: 'dependabot' };
  }

  if (!needsQaYes(pr.body)) {
    core.info('Needs QA? is not Yes — skipping QA handoff');
    return { skipped: true, reason: 'needs_qa_no' };
  }

  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const prNumber = pr.number;
  const prUrl =
    pr.html_url || `https://github.com/${owner}/${repo}/pull/${prNumber}`;
  const mergeSha = pr.merge_commit_sha || null;
  const qaAssignee = process.env.QA_ASSIGNEE_LOGIN || DEFAULT_QA_ASSIGNEE;

  let issueNumbers;
  try {
    issueNumbers = await resolveLinkedIssueNumbers(
      github,
      owner,
      repo,
      prNumber,
    );
  } catch (error) {
    core.warning(
      `Could not resolve linked issues for PR #${prNumber}: ${error.message}`,
    );
    return { skipped: true, reason: 'resolve_failed' };
  }
  if (issueNumbers.length === 0) {
    core.info(
      'Needs QA? Yes but no linked Refs #NNN issues — skipping comments / board',
    );
    return { skipped: true, reason: 'no_linked_issues' };
  }

  core.info(
    `QA handoff for PR #${prNumber} → ${issueNumbers
      .map(n => `#${n}`)
      .join(', ')}`,
  );

  const commentBody = buildHandoffCommentBody({
    prNumber,
    prUrl,
    mergeSha,
    qaAssignee,
  });

  for (const issueNumber of issueNumbers) {
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
          c.body?.includes(HANDOFF_MARKER),
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
            `Could not delete old handoff comment ${comment.id}: ${error.message}`,
          );
        }
      }
      await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: commentBody,
      });
      core.info(`Posted QA handoff comment on #${issueNumber}`);
    } catch (error) {
      core.warning(
        `Could not comment on #${issueNumber}: ${error.message}`,
      );
    }

    try {
      await github.rest.issues.addAssignees({
        owner,
        repo,
        issue_number: issueNumber,
        assignees: [qaAssignee],
      });
      core.info(`Added assignee ${qaAssignee} on #${issueNumber}`);
    } catch (error) {
      core.warning(
        `Could not add assignee on #${issueNumber}: ${error.message}`,
      );
    }
  }

  try {
    await moveIssuesToInQa({
      github,
      core,
      getOctokit,
      owner,
      repo,
      issueNumbers,
    });
  } catch (error) {
    core.warning(`Could not update Project 4 Status: ${error.message}`);
  }

  return { skipped: false, issueNumbers };
}

module.exports = qaHandoffOnMerge;
module.exports.needsQaYes = needsQaYes;
module.exports.isDependabotAuthor = isDependabotAuthor;
module.exports.buildHandoffCommentBody = buildHandoffCommentBody;
module.exports.HANDOFF_MARKER = HANDOFF_MARKER;
module.exports.DEFAULT_QA_ASSIGNEE = DEFAULT_QA_ASSIGNEE;
