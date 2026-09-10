/**
 * Shared helpers for linked-issue resolution (and re-export of In QA moves).
 *
 * Historically called from preview-build to mirror PR comments onto issues.
 * Post-merge ticket handoff owns issue comments / assignee / Status via
 * qa-handoff-on-merge.cjs. This module still exports:
 *   - collectLinkedIssueNumbersFromText / resolveLinkedIssueNumbers
 *   - moveIssuesToInQa (from project-board.cjs)
 *
 * Soft-fails: callers must not fail the primary job if board side effects fail.
 *
 * Linked tickets are resolved from PR title/body via `Refs #NNN` (preferred)
 * and legacy closing keywords (`Closes` / `Fixes` / `Resolves`). `Part of #NNN`
 * is intentionally ignored so stacked/partial work does not get QA handoff.
 *
 * @param {object} args
 * @param {import('@octokit/rest').Octokit} args.github
 * @param {import('@actions/github').Context} args.context
 * @param {{ warning: Function, info: Function }} args.core
 * @param {string} args.body — markdown body (legacy notifyLinkedIssues path)
 * @param {string[]} args.commentMarkers — substrings that identify prior bot comments
 * @param {typeof import('@actions/github').getOctokit} [args.getOctokit]
 */
async function notifyLinkedIssues({
  github,
  context,
  core,
  body,
  commentMarkers,
  getOctokit,
}) {
  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const prNumber = context.payload.pull_request?.number ?? context.issue.number;

  if (!body || typeof body !== 'string') {
    core.warning('preview-notify-linked-issues: empty body — skipping');
    return;
  }

  const issueNumbers = await resolveLinkedIssueNumbers(
    github,
    owner,
    repo,
    prNumber,
  );
  if (issueNumbers.length === 0) {
    core.info(
      'No linked issues on this PR — skipping ticket comments / board move',
    );
    return;
  }

  core.info(`Linked issues: ${issueNumbers.map(n => `#${n}`).join(', ')}`);

  for (const issueNumber of issueNumbers) {
    try {
      await upsertIssueComment(
        github,
        owner,
        repo,
        issueNumber,
        body,
        commentMarkers,
      );
      core.info(`Upserted preview comment on #${issueNumber}`);
    } catch (error) {
      core.warning(`Could not comment on #${issueNumber}: ${error.message}`);
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
}

/**
 * Preferred non-closing link (`Refs #NNN`) plus legacy GitHub closing keywords.
 * Does not match `Part of #NNN`.
 */
const LINKED_ISSUE_RE =
  /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs)\s*:?\s*#(\d+)/gi;

/**
 * Stacked / partial work — must not trigger preview ticket comments or In QA.
 * Exported for regression tests only.
 */
const PART_OF_ISSUE_RE = /\bpart\s+of\s*:?\s*#(\d+)/gi;

/**
 * Collect issue numbers from PR title + body text.
 * Includes `Refs #NNN` and closing keywords; excludes `Part of #NNN`.
 *
 * @param {string} title
 * @param {string | null | undefined} body
 * @param {number} prNumber — excluded so the PR is never treated as a ticket
 * @returns {number[]}
 */
function collectLinkedIssueNumbersFromText(title, body, prNumber) {
  const numbers = new Set();
  const text = `${title}\n${body || ''}`;

  for (const match of text.matchAll(LINKED_ISSUE_RE)) {
    numbers.add(Number(match[1]));
  }

  // Never treat the PR itself as a ticket (same number space)
  numbers.delete(prNumber);
  return [...numbers].sort((a, b) => a - b);
}

/**
 * True when the number appears only as `Part of #NNN` (or not as a linked
 * Refs/closing keyword). Used in tests to document the Part of contract.
 *
 * @param {string} title
 * @param {string | null | undefined} body
 * @param {number} issueNumber
 */
function isPartOfOnlyReference(title, body, issueNumber) {
  const text = `${title}\n${body || ''}`;
  const linked = new Set();
  for (const match of text.matchAll(LINKED_ISSUE_RE)) {
    linked.add(Number(match[1]));
  }
  if (linked.has(issueNumber)) return false;

  for (const match of text.matchAll(PART_OF_ISSUE_RE)) {
    if (Number(match[1]) === issueNumber) return true;
  }
  return false;
}

async function resolveLinkedIssueNumbers(github, owner, repo, prNumber) {
  const { data: pr } = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  const numbers = new Set(
    collectLinkedIssueNumbersFromText(pr.title, pr.body, prNumber),
  );

  try {
    const result = await github.graphql(
      `
      query ($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            closingIssuesReferences(first: 50) {
              nodes { number }
            }
          }
        }
      }
    `,
      { owner, repo, number: prNumber },
    );
    for (const node of result.repository?.pullRequest?.closingIssuesReferences
      ?.nodes || []) {
      if (node?.number) numbers.add(node.number);
    }
  } catch (error) {
    // closingIssuesReferences may be unavailable; body parse is enough
    console.log(`closingIssuesReferences lookup failed: ${error.message}`);
  }

  // Never treat the PR itself as a ticket (same number space)
  numbers.delete(prNumber);
  return [...numbers].sort((a, b) => a - b);
}

async function upsertIssueComment(
  github,
  owner,
  repo,
  issueNumber,
  body,
  commentMarkers,
) {
  const { data: comments } = await github.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  const botComments = comments.filter(
    comment =>
      comment.user?.login === 'github-actions[bot]' &&
      commentMarkers.some(marker => comment.body?.includes(marker)),
  );

  for (const comment of botComments) {
    try {
      await github.rest.issues.deleteComment({
        owner,
        repo,
        comment_id: comment.id,
      });
    } catch (error) {
      console.log(
        `⚠️ Could not delete comment ${comment.id} on #${issueNumber}: ${error.message}`,
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

const {
  ENG_HANDOFF_FROM,
  moveIssuesToInQa,
} = require('./project-board.cjs');

/** @deprecated Prefer ENG_HANDOFF_FROM from project-board.cjs */
const ALLOWED_FROM_STATUS_NAMES = ENG_HANDOFF_FROM;

module.exports = notifyLinkedIssues;
module.exports.collectLinkedIssueNumbersFromText =
  collectLinkedIssueNumbersFromText;
module.exports.resolveLinkedIssueNumbers = resolveLinkedIssueNumbers;
module.exports.isPartOfOnlyReference = isPartOfOnlyReference;
module.exports.LINKED_ISSUE_RE = LINKED_ISSUE_RE;
module.exports.PART_OF_ISSUE_RE = PART_OF_ISSUE_RE;
module.exports.ALLOWED_FROM_STATUS_NAMES = ALLOWED_FROM_STATUS_NAMES;
module.exports.moveIssuesToInQa = moveIssuesToInQa;
