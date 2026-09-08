/**
 * Post-merge ticket handoff for Project 4.
 *
 * When a PR merges:
 *   - **Needs QA? Yes** → comment, assign @Roslin22, Project 4 → In QA
 *   - **Needs QA? No** (engineering-only) → comment, Project 4 → Done, close issue
 *
 * Soft-fails: merge success must not fail if issue/board side effects fail.
 *
 * Linked tickets: same contract as preview-notify-linked-issues.cjs
 * (`Refs #NNN` + legacy closing keywords; ignore `Part of #NNN`).
 *
 * Env (optional):
 *   PROJECT_BOARD_TOKEN — PAT with org project write (preferred for Project 4)
 *   FLUENT_PROJECT_ID / FLUENT_STATUS_FIELD_ID / FLUENT_*_OPTION_ID
 *   QA_ASSIGNEE_LOGIN — default Roslin22
 */

'use strict';

const {
  resolveLinkedIssueNumbers,
} = require('./preview-notify-linked-issues.cjs');
const {
  moveIssuesToInQa,
  moveIssueStatus,
  ENG_HANDOFF_FROM,
} = require('./project-board.cjs');

const HANDOFF_MARKER = '<!-- qa-nightly-handoff -->';
const ENG_DONE_MARKER = '<!-- eng-done-on-merge -->';
const DEFAULT_QA_ASSIGNEE = 'Roslin22';
const DEPENDABOT_LOGINS = new Set([
  'dependabot',
  'dependabot[bot]',
  'dependabot-preview[bot]',
]);

/**
 * Scope text to the **Needs QA?** block when present.
 * @param {string | null | undefined} body
 * @returns {string}
 */
function needsQaSection(body) {
  const text = String(body || '');
  const sectionMatch = text.match(
    /\*\*Needs QA\?\*\*[\s\S]*?(?=\n\*\*[^*]|\n### |\n## |$)/i,
  );
  return sectionMatch ? sectionMatch[0] : text;
}

/**
 * Detect checked "Yes" under **Needs QA?** in the PR body.
 * @param {string | null | undefined} body
 * @returns {boolean}
 */
function needsQaYes(body) {
  return /^\s*[-*]\s*\[[xX]\]\s*Yes\b/m.test(needsQaSection(body));
}

/**
 * Detect checked "No" under **Needs QA?** (engineering-only).
 * @param {string | null | undefined} body
 * @returns {boolean}
 */
function needsQaNo(body) {
  return /^\s*[-*]\s*\[[xX]\]\s*No\b/m.test(needsQaSection(body));
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
 * @param {{ prNumber: number, prUrl: string, mergeSha?: string | null }} opts
 * @returns {string}
 */
function buildEngDoneCommentBody({ prNumber, prUrl, mergeSha }) {
  const lines = [
    ENG_DONE_MARKER,
    '',
    '## Engineering-only — closed on merge',
    '',
    `PR [**#${prNumber}**](${prUrl}) merged with **Needs QA? No**. Project 4 → **Done**; closing this issue.`,
  ];
  if (mergeSha) {
    lines.push('', `**Merged commit:** \`${String(mergeSha).slice(0, 7)}\``);
  }
  lines.push(
    '',
    '---',
    '_Post-merge eng-done handoff. See `docs/guides/qa-process.md`._',
  );
  return lines.join('\n');
}

/**
 * Upsert a bot comment identified by marker (delete prior, then create).
 */
async function upsertMarkedComment({
  github,
  core,
  owner,
  repo,
  issueNumber,
  marker,
  body,
}) {
  const { data: comments } = await github.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });
  const prior = comments.filter(
    c =>
      c.user?.login === 'github-actions[bot]' && c.body?.includes(marker),
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
        `Could not delete old comment ${comment.id}: ${error.message}`,
      );
    }
  }
  await github.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
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
    core.info('PR closed without merge — skipping ticket handoff');
    return { skipped: true, reason: 'not_merged' };
  }

  const authorLogin = pr.user?.login;
  if (isDependabotAuthor(authorLogin)) {
    core.info(`Dependabot PR — skipping ticket handoff (${authorLogin})`);
    return { skipped: true, reason: 'dependabot' };
  }

  const wantsQa = needsQaYes(pr.body);
  const engOnly = needsQaNo(pr.body);

  if (!wantsQa && !engOnly) {
    core.info(
      'Needs QA? neither Yes nor No checked — skipping ticket handoff',
    );
    return { skipped: true, reason: 'needs_qa_unset' };
  }

  if (wantsQa && engOnly) {
    core.warning(
      'Needs QA? has both Yes and No checked — treating as Needs QA Yes',
    );
  }

  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const prNumber = pr.number;
  const prUrl =
    pr.html_url || `https://github.com/${owner}/${repo}/pull/${prNumber}`;
  const mergeSha = pr.merge_commit_sha || null;

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
      'No linked Refs #NNN issues — skipping comments / board',
    );
    return { skipped: true, reason: 'no_linked_issues' };
  }

  if (wantsQa) {
    return runQaHandoff({
      github,
      core,
      getOctokit,
      owner,
      repo,
      prNumber,
      prUrl,
      mergeSha,
      issueNumbers,
    });
  }

  return runEngDoneHandoff({
    github,
    core,
    getOctokit,
    owner,
    repo,
    prNumber,
    prUrl,
    mergeSha,
    issueNumbers,
  });
}

async function runQaHandoff({
  github,
  core,
  getOctokit,
  owner,
  repo,
  prNumber,
  prUrl,
  mergeSha,
  issueNumbers,
}) {
  const qaAssignee = process.env.QA_ASSIGNEE_LOGIN || DEFAULT_QA_ASSIGNEE;
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
      await upsertMarkedComment({
        github,
        core,
        owner,
        repo,
        issueNumber,
        marker: HANDOFF_MARKER,
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

  return { skipped: false, path: 'qa', issueNumbers };
}

async function runEngDoneHandoff({
  github,
  core,
  getOctokit,
  owner,
  repo,
  prNumber,
  prUrl,
  mergeSha,
  issueNumbers,
}) {
  core.info(
    `Eng-done handoff for PR #${prNumber} → ${issueNumbers
      .map(n => `#${n}`)
      .join(', ')}`,
  );

  const commentBody = buildEngDoneCommentBody({
    prNumber,
    prUrl,
    mergeSha,
  });

  for (const issueNumber of issueNumbers) {
    try {
      await upsertMarkedComment({
        github,
        core,
        owner,
        repo,
        issueNumber,
        marker: ENG_DONE_MARKER,
        body: commentBody,
      });
      core.info(`Posted eng-done comment on #${issueNumber}`);
    } catch (error) {
      core.warning(
        `Could not comment on #${issueNumber}: ${error.message}`,
      );
    }

    let boardOk = false;
    try {
      const moved = await moveIssueStatus({
        github,
        core,
        getOctokit,
        owner,
        repo,
        issueNumber,
        targetStatus: 'Done',
        allowedFrom: ENG_HANDOFF_FROM,
        addIfMissing: false,
      });
      boardOk = Boolean(moved?.ok);
    } catch (error) {
      core.warning(
        `Could not update Project 4 Status for #${issueNumber}: ${error.message}`,
      );
    }

    if (!boardOk) {
      core.warning(
        `Skipping close for #${issueNumber} — Project 4 was not moved to Done (allowlist / Product / missing)`,
      );
      continue;
    }

    try {
      await github.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        state: 'closed',
        state_reason: 'completed',
      });
      core.info(`Closed #${issueNumber} (engineering-only merge)`);
    } catch (error) {
      core.warning(`Could not close #${issueNumber}: ${error.message}`);
    }
  }

  return { skipped: false, path: 'eng_done', issueNumbers };
}

module.exports = qaHandoffOnMerge;
module.exports.needsQaYes = needsQaYes;
module.exports.needsQaNo = needsQaNo;
module.exports.isDependabotAuthor = isDependabotAuthor;
module.exports.buildHandoffCommentBody = buildHandoffCommentBody;
module.exports.buildEngDoneCommentBody = buildEngDoneCommentBody;
module.exports.HANDOFF_MARKER = HANDOFF_MARKER;
module.exports.ENG_DONE_MARKER = ENG_DONE_MARKER;
module.exports.DEFAULT_QA_ASSIGNEE = DEFAULT_QA_ASSIGNEE;
