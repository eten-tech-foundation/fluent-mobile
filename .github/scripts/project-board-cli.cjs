#!/usr/bin/env node
/**
 * Agent CLI for Project 4 Status moves.
 *
 * Usage:
 *   node .github/scripts/project-board-cli.cjs set-status --issue 464 --to "In Progress (Dev)"
 *   node .github/scripts/project-board-cli.cjs set-status --issue 464 --to "In PR Review"
 *
 * Auth: uses `gh` (GITHUB_TOKEN or `gh auth login`). Soft-fails with WARN exit 0
 * unless --strict is passed.
 *
 * Never moves Product-owned columns. Adds the issue to Project 4 when missing.
 */

'use strict';

const { execFileSync } = require('child_process');
const {
  DEFAULT_PROJECT_ID,
  DEFAULT_STATUS_FIELD_ID,
  DEFAULT_OWNER,
  DEFAULT_REPO,
  STATUS_OPTIONS,
  PRODUCT_OWNED_STATUSES,
  IN_PROGRESS_FROM,
  IN_PR_REVIEW_FROM,
  optionIdForStatus,
} = require('./project-board.cjs');

function usage() {
  return `Usage:
  node .github/scripts/project-board-cli.cjs set-status --issue <n> --to <Status> [--strict]

Known statuses: ${Object.keys(STATUS_OPTIONS).join(', ')}
Presets: "In Progress (Dev)", "In PR Review"`;
}

function parseArgs(argv) {
  const args = { command: null, issue: null, to: null, strict: false };
  const rest = [...argv];
  args.command = rest.shift() || null;
  while (rest.length) {
    const flag = rest.shift();
    if (flag === '--issue') args.issue = Number(rest.shift());
    else if (flag === '--to') args.to = rest.shift();
    else if (flag === '--strict') args.strict = true;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return args;
}

function ghJson(args) {
  const out = execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out.trim() ? JSON.parse(out) : null;
}

function allowlistForTarget(target) {
  if (target === 'In Progress (Dev)') return IN_PROGRESS_FROM;
  if (target === 'In PR Review') return IN_PR_REVIEW_FROM;
  return null;
}

async function setStatus({ issue, to, strict }) {
  if (!Number.isInteger(issue) || issue <= 0) {
    throw new Error('--issue must be a positive integer');
  }
  if (!to || !optionIdForStatus(to)) {
    throw new Error(`Unknown --to status: ${to}`);
  }

  const optionId = optionIdForStatus(to);
  const projectId = process.env.FLUENT_PROJECT_ID || DEFAULT_PROJECT_ID;
  const statusFieldId =
    process.env.FLUENT_STATUS_FIELD_ID || DEFAULT_STATUS_FIELD_ID;
  const owner = DEFAULT_OWNER;
  const repo = DEFAULT_REPO;

  const page = ghJson([
    'api',
    'graphql',
    '-f',
    `query=query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        issue(number: $number) {
          id
          projectItems(first: 20) {
            nodes {
              id
              project { id number }
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
            }
          }
        }
      }
    }`,
    '-F',
    `owner=${owner}`,
    '-F',
    `repo=${repo}`,
    '-F',
    `number=${issue}`,
  ]);

  const issueNode = page?.data?.repository?.issue;
  if (!issueNode) {
    console.warn(`WARN: issue #${issue} not found`);
    if (strict) process.exit(1);
    return;
  }

  let item = (issueNode.projectItems?.nodes || []).find(
    n => n.project?.id === projectId || n.project?.number === 4,
  );

  if (!item) {
    console.log(`#${issue} not on Project 4 — adding…`);
    execFileSync(
      'gh',
      [
        'project',
        'item-add',
        '4',
        '--owner',
        owner,
        '--url',
        `https://github.com/${owner}/${repo}/issues/${issue}`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const again = ghJson([
      'api',
      'graphql',
      '-f',
      `query=query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $number) {
            projectItems(first: 20) {
              nodes {
                id
                project { id number }
                fieldValueByName(name: "Status") {
                  ... on ProjectV2ItemFieldSingleSelectValue { name }
                }
              }
            }
          }
        }
      }`,
      '-F',
      `owner=${owner}`,
      '-F',
      `repo=${repo}`,
      '-F',
      `number=${issue}`,
    ]);
    item = (again?.data?.repository?.issue?.projectItems?.nodes || []).find(
      n => n.project?.id === projectId || n.project?.number === 4,
    );
  }

  if (!item?.id) {
    console.warn(`WARN: #${issue} still not on Project 4; skipping.`);
    if (strict) process.exit(1);
    return;
  }

  const current = item.fieldValueByName?.name || '';
  if (current === to) {
    console.log(`#${issue} already ${to}`);
    return;
  }

  if (PRODUCT_OWNED_STATUSES.has(current)) {
    console.warn(
      `WARN: #${issue} Status is Product-owned ("${current}") — not moving.`,
    );
    if (strict) process.exit(1);
    return;
  }

  const allowed = allowlistForTarget(to);
  if (allowed && !allowed.has(current)) {
    console.warn(
      `WARN: #${issue} Status is "${
        current || '(none)'
      }" — not moving to ${to}.`,
    );
    if (strict) process.exit(1);
    return;
  }

  ghJson([
    'api',
    'graphql',
    '-f',
    `query=mutation($item: ID!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: "${projectId}"
        itemId: $item
        fieldId: "${statusFieldId}"
        value: { singleSelectOptionId: "${optionId}" }
      }) { projectV2Item { id } }
    }`,
    '-F',
    `item=${item.id}`,
  ]);

  console.log(`Moved issue #${issue} to ${to}.`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exit(2);
  }

  if (args.command !== 'set-status') {
    console.error(usage());
    process.exit(2);
  }

  try {
    await setStatus(args);
  } catch (error) {
    console.warn(`WARN: board move failed: ${error.message}`);
    if (args.strict) process.exit(1);
  }
}

main();
