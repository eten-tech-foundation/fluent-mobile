/**
 * Shared Project 4 (Fluent Mobile Board) helpers.
 *
 * Used by post-merge CI (qa-handoff / eng-done) and the agent CLI
 * (`project-board-cli.cjs`). Soft-fail callers must not fail the primary job
 * when board side effects fail.
 *
 * Env (optional):
 *   PROJECT_BOARD_TOKEN — PAT with org project write (preferred for Project 4)
 *   FLUENT_PROJECT_ID / FLUENT_STATUS_FIELD_ID
 *   FLUENT_<STATUS>_OPTION_ID — override a single-select option id
 */

'use strict';

const DEFAULT_PROJECT_ID = 'PVT_kwDOB8vK1s4A34c5'; // eten-tech-foundation Project 4
const DEFAULT_STATUS_FIELD_ID = 'PVTSSF_lADOB8vK1s4A34c5zgs8akY';
const DEFAULT_PROJECT_NUMBER = 4;
const DEFAULT_OWNER = 'eten-tech-foundation';
const DEFAULT_REPO = 'fluent-mobile';

/** Verified Status option ids (Project 4, as of 2026-09). */
const STATUS_OPTIONS = Object.freeze({
  Backlog: 'f75ad846',
  'In Progress (Product)': '47fc9ee4',
  'Product Ready': '98236657',
  'Sprint Shaping': '75636d82',
  'Dev Ready': '400f32e3',
  'In Progress (Dev)': 'db53740f',
  'In PR Review': '19224fda',
  'In QA': 'bb3c3d02',
  'Passed QA': 'effbac47',
  'To Deploy': '8706b8cd',
  Done: '3c942df6',
});

const PRODUCT_OWNED_STATUSES = Object.freeze(
  new Set([
    'In Progress (Product)',
    'Product Ready',
    'Sprint Shaping',
  ]),
);

/** Eng handoff → In QA / Done (never Product / terminal). */
const ENG_HANDOFF_FROM = Object.freeze(
  new Set(['In Progress (Dev)', 'In PR Review']),
);

/** `/start-issue` may claim from these (not Product-owned). */
const IN_PROGRESS_FROM = Object.freeze(
  new Set([
    'Backlog',
    'Dev Ready',
    'In Progress (Dev)',
    'In PR Review',
    'In QA',
    'Passed QA',
    'To Deploy',
    'Done',
    '', // unset Status
  ]),
);

/** `/create-pr` → In PR Review. */
const IN_PR_REVIEW_FROM = Object.freeze(
  new Set([
    'Backlog',
    'Dev Ready',
    'In Progress (Dev)',
    'In PR Review',
    '',
  ]),
);

/**
 * @param {string} statusName
 * @returns {string | null}
 */
function optionIdForStatus(statusName) {
  if (!statusName || typeof statusName !== 'string') return null;
  const envKey = `FLUENT_${statusName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')}_OPTION_ID`;
  if (process.env[envKey]) return process.env[envKey];
  return STATUS_OPTIONS[statusName] || null;
}

/**
 * @param {import('@octokit/rest').Octokit} github
 * @param {typeof import('@actions/github').getOctokit} [getOctokit]
 * @param {{ warning: Function, info: Function }} core
 */
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

/**
 * @param {import('@octokit/rest').Octokit} github
 * @param {string} projectId
 * @param {string} owner
 * @param {string} repo
 * @param {number} issueNumber
 * @returns {Promise<{ itemId: string, statusName: string, contentId: string | null } | null>}
 */
async function findProjectItem(github, projectId, owner, repo, issueNumber) {
  const result = await github.graphql(
    `
    query ($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          id
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

  const issue = result.repository?.issue;
  if (!issue) return null;

  const match = (issue.projectItems?.nodes || []).find(
    node => node.project?.id === projectId,
  );
  if (!match) {
    return {
      itemId: null,
      statusName: '',
      contentId: issue.id,
    };
  }
  return {
    itemId: match.id,
    statusName: match.fieldValueByName?.name || '',
    contentId: issue.id,
  };
}

/**
 * @param {import('@octokit/rest').Octokit} github
 * @param {string} projectId
 * @param {string} contentId — Issue node id
 * @returns {Promise<string>} project item id
 */
async function addProjectItem(github, projectId, contentId) {
  const result = await github.graphql(
    `
    mutation ($project: ID!, $content: ID!) {
      addProjectV2ItemById(input: { projectId: $project, contentId: $content }) {
        item { id }
      }
    }
  `,
    { project: projectId, content: contentId },
  );
  return result.addProjectV2ItemById.item.id;
}

/**
 * Move one issue's Project 4 Status.
 *
 * @param {object} opts
 * @param {import('@octokit/rest').Octokit} opts.github
 * @param {{ warning: Function, info: Function }} opts.core
 * @param {typeof import('@actions/github').getOctokit} [opts.getOctokit]
 * @param {string} [opts.owner]
 * @param {string} [opts.repo]
 * @param {number} opts.issueNumber
 * @param {string} opts.targetStatus — exact Status option name
 * @param {Set<string>} [opts.allowedFrom] — when set, only move from these names
 * @param {boolean} [opts.addIfMissing=false]
 * @param {boolean} [opts.refuseProductOwned=true]
 * @returns {Promise<{ ok: boolean, reason?: string, from?: string }>}
 */
async function moveIssueStatus({
  github,
  core,
  getOctokit,
  owner = DEFAULT_OWNER,
  repo = DEFAULT_REPO,
  issueNumber,
  targetStatus,
  allowedFrom,
  addIfMissing = false,
  refuseProductOwned = true,
}) {
  const projectId = process.env.FLUENT_PROJECT_ID || DEFAULT_PROJECT_ID;
  const statusFieldId =
    process.env.FLUENT_STATUS_FIELD_ID || DEFAULT_STATUS_FIELD_ID;
  const optionId = optionIdForStatus(targetStatus);
  if (!optionId) {
    core.warning(`Unknown Project 4 Status "${targetStatus}"`);
    return { ok: false, reason: 'unknown_status' };
  }

  const boardGithub = await resolveBoardClient(github, getOctokit, core);
  if (!boardGithub) return { ok: false, reason: 'no_client' };

  let item = await findProjectItem(
    boardGithub,
    projectId,
    owner,
    repo,
    issueNumber,
  );
  if (!item) {
    core.info(`#${issueNumber} not found — skipping board move`);
    return { ok: false, reason: 'issue_not_found' };
  }

  if (!item.itemId) {
    if (!addIfMissing) {
      core.info(`#${issueNumber} is not on Project 4 — skipping board move`);
      return { ok: false, reason: 'not_on_project' };
    }
    if (!item.contentId) {
      return { ok: false, reason: 'missing_content_id' };
    }
    item = {
      itemId: await addProjectItem(boardGithub, projectId, item.contentId),
      statusName: '',
      contentId: item.contentId,
    };
    core.info(`Added #${issueNumber} to Project 4`);
  }

  const currentStatus = item.statusName || '';
  if (currentStatus === targetStatus) {
    core.info(`#${issueNumber} already ${targetStatus}`);
    return { ok: true, reason: 'already', from: currentStatus };
  }

  if (refuseProductOwned && PRODUCT_OWNED_STATUSES.has(currentStatus)) {
    core.warning(
      `#${issueNumber} Status is Product-owned ("${currentStatus}") — not moving to ${targetStatus}`,
    );
    return { ok: false, reason: 'product_owned', from: currentStatus };
  }

  if (allowedFrom && !allowedFrom.has(currentStatus)) {
    core.info(
      `#${issueNumber} Status is "${
        currentStatus || '(none)'
      }" — not moving to ${targetStatus} (allowlist: ${[...allowedFrom]
        .filter(Boolean)
        .join(', ')})`,
    );
    return { ok: false, reason: 'not_in_allowlist', from: currentStatus };
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
      option: optionId,
    },
  );
  core.info(
    `Moved #${issueNumber} → ${targetStatus} (was ${
      currentStatus || '(none)'
    })`,
  );
  return { ok: true, from: currentStatus };
}

/**
 * @param {object} opts — same as moveIssueStatus plus issueNumbers[]
 * @returns {Promise<Array<{ issueNumber: number, ok: boolean, reason?: string, from?: string }>>}
 */
async function moveIssuesToStatus({
  github,
  core,
  getOctokit,
  owner,
  repo,
  issueNumbers,
  targetStatus,
  allowedFrom,
  addIfMissing = false,
  refuseProductOwned = true,
}) {
  const results = [];
  for (const issueNumber of issueNumbers) {
    try {
      const result = await moveIssueStatus({
        github,
        core,
        getOctokit,
        owner,
        repo,
        issueNumber,
        targetStatus,
        allowedFrom,
        addIfMissing,
        refuseProductOwned,
      });
      results.push({ issueNumber, ...result });
    } catch (error) {
      core.warning(`Board move failed for #${issueNumber}: ${error.message}`);
      results.push({ issueNumber, ok: false, reason: 'threw' });
    }
  }
  return results;
}

async function moveIssuesToInQa(opts) {
  return moveIssuesToStatus({
    ...opts,
    targetStatus: 'In QA',
    allowedFrom: ENG_HANDOFF_FROM,
    addIfMissing: false,
  });
}

async function moveIssuesToDone(opts) {
  return moveIssuesToStatus({
    ...opts,
    targetStatus: 'Done',
    allowedFrom: ENG_HANDOFF_FROM,
    addIfMissing: false,
  });
}

module.exports = {
  DEFAULT_PROJECT_ID,
  DEFAULT_STATUS_FIELD_ID,
  DEFAULT_PROJECT_NUMBER,
  DEFAULT_OWNER,
  DEFAULT_REPO,
  STATUS_OPTIONS,
  PRODUCT_OWNED_STATUSES,
  ENG_HANDOFF_FROM,
  IN_PROGRESS_FROM,
  IN_PR_REVIEW_FROM,
  optionIdForStatus,
  resolveBoardClient,
  findProjectItem,
  addProjectItem,
  moveIssueStatus,
  moveIssuesToStatus,
  moveIssuesToInQa,
  moveIssuesToDone,
};
