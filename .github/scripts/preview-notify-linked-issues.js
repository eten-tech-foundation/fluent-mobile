/**
 * After a preview-build PR comment is posted, mirror it onto linked GitHub
 * issues and (best-effort) move those cards to Project 4 Status "In QA".
 *
 * Soft-fails: preview success must not fail if issue/board side effects fail.
 *
 * Env (optional):
 *   PROJECT_BOARD_TOKEN — PAT with org project write (preferred for Project 4)
 *   FLUENT_PROJECT_ID — Projects V2 node id (default: Fluent Project 4)
 *   FLUENT_STATUS_FIELD_ID — Status field node id
 *   FLUENT_IN_QA_OPTION_ID — "In QA" single-select option id
 *
 * @param {object} args
 * @param {import('@octokit/rest').Octokit} args.github
 * @param {import('@actions/github').Context} args.context
 * @param {{ warning: Function, info: Function }} args.core
 * @param {string} args.body — same markdown posted on the PR
 * @param {string[]} args.commentMarkers — substrings that identify prior bot preview comments
 * @param {typeof import('@actions/github').getOctokit} [args.getOctokit]
 */
module.exports = async function notifyLinkedIssues({
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
};

const CLOSING_KEYWORD_RE =
  /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s*#(\d+)/gi;

async function resolveLinkedIssueNumbers(github, owner, repo, prNumber) {
  const numbers = new Set();

  const { data: pr } = await github.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  for (const match of `${pr.title}\n${pr.body || ''}`.matchAll(
    CLOSING_KEYWORD_RE,
  )) {
    numbers.add(Number(match[1]));
  }

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

const DEFAULT_PROJECT_ID = 'PVT_kwDOB8vK1s4A34c5'; // eten-tech-foundation Project 4 (Fluent)
const DEFAULT_STATUS_FIELD_ID = 'PVTSSF_lADOB8vK1s4A34c5zgs8akY';
const DEFAULT_IN_QA_OPTION_ID = 'bb3c3d02';

/** Only move from eng handoff statuses — never Product / terminal columns. */
const ALLOWED_FROM_STATUS_NAMES = new Set([
  'In Progress (Dev)',
  'In PR Review',
]);

async function moveIssuesToInQa({
  github,
  core,
  getOctokit,
  owner,
  repo,
  issueNumbers,
}) {
  const projectId = process.env.FLUENT_PROJECT_ID || DEFAULT_PROJECT_ID;
  const statusFieldId =
    process.env.FLUENT_STATUS_FIELD_ID || DEFAULT_STATUS_FIELD_ID;
  const inQaOptionId =
    process.env.FLUENT_IN_QA_OPTION_ID || DEFAULT_IN_QA_OPTION_ID;

  const boardGithub = await resolveBoardClient(github, getOctokit, core);
  if (!boardGithub) return;

  for (const issueNumber of issueNumbers) {
    try {
      const item = await findProjectItem(
        boardGithub,
        projectId,
        owner,
        repo,
        issueNumber,
      );
      if (!item) {
        core.info(`#${issueNumber} is not on Project 4 — skipping board move`);
        continue;
      }

      const currentStatus = item.statusName || '';
      if (currentStatus === 'In QA') {
        core.info(`#${issueNumber} already In QA`);
        continue;
      }
      if (!ALLOWED_FROM_STATUS_NAMES.has(currentStatus)) {
        core.info(
          `#${issueNumber} Status is "${
            currentStatus || '(none)'
          }" — not moving to In QA (allowlist: ${[
            ...ALLOWED_FROM_STATUS_NAMES,
          ].join(', ')})`,
        );
        continue;
      }

      await boardGithub.graphql(
        `
        mutation ($project: ID!, $item: ID!, $field: ID!, $option: String!) {
          updateProjectV2ItemFieldValue(
            input: {
              projectId: $project
              itemId: $item
              fieldId: $field
              value: { singleSelectOptionId: $option }
            }
          ) {
            projectV2Item { id }
          }
        }
      `,
        {
          project: projectId,
          item: item.itemId,
          field: statusFieldId,
          option: inQaOptionId,
        },
      );
      core.info(`Moved #${issueNumber} → In QA (was ${currentStatus})`);
    } catch (error) {
      core.warning(`Board move failed for #${issueNumber}: ${error.message}`);
    }
  }
}

async function resolveBoardClient(github, getOctokit, core) {
  const projectToken = process.env.PROJECT_BOARD_TOKEN;
  if (projectToken && typeof getOctokit === 'function') {
    core.info('Using PROJECT_BOARD_TOKEN for Project 4 updates');
    return getOctokit(projectToken);
  }
  if (projectToken) {
    core.warning(
      'PROJECT_BOARD_TOKEN is set but getOctokit was not provided — falling back to GITHUB_TOKEN',
    );
  } else {
    core.info(
      'PROJECT_BOARD_TOKEN unset — attempting Project 4 update with GITHUB_TOKEN (org projects often need a PAT)',
    );
  }
  return github;
}

async function findProjectItem(github, projectId, owner, repo, issueNumber) {
  const result = await github.graphql(
    `
    query ($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          projectItems(first: 20) {
            nodes {
              id
              project { id }
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
            }
          }
        }
      }
    }
  `,
    { owner, repo, number: issueNumber },
  );

  const match = (result.repository?.issue?.projectItems?.nodes || []).find(
    node => node.project?.id === projectId,
  );
  if (!match) return null;
  return {
    itemId: match.id,
    statusName: match.fieldValueByName?.name || '',
  };
}
