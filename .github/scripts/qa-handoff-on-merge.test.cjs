const { execFileSync } = require('child_process');
const path = require('path');

const qaHandoffOnMerge = require('./qa-handoff-on-merge.cjs');
const {
  needsQaYes,
  isDependabotAuthor,
  buildHandoffCommentBody,
  HANDOFF_MARKER,
  DEFAULT_QA_ASSIGNEE,
} = qaHandoffOnMerge;

const NEEDS_QA_YES_BODY = `### TLDR

Ship the feature.

### Details

Refs #188

**Needs QA?**

- [ ] No — engineering-only (docs, CI, refactor, logging, etc.)
- [x] Yes — see Needs QA? in \`docs/guides/qa-process.md\`

### How to verify

1. npm test -- --ci
`;

const NEEDS_QA_NO_BODY = `### TLDR

Docs only.

### Details

Refs #275

**Needs QA?**

- [x] No — engineering-only (docs, CI, refactor, logging, etc.)
- [ ] Yes — see Needs QA? in \`docs/guides/qa-process.md\`

### How to verify

1. Read the docs
`;

describe('needsQaYes', () => {
  it('detects checked Yes under Needs QA?', () => {
    expect(needsQaYes(NEEDS_QA_YES_BODY)).toBe(true);
  });

  it('ignores unchecked Yes when No is checked', () => {
    expect(needsQaYes(NEEDS_QA_NO_BODY)).toBe(false);
  });

  it('ignores empty / missing body', () => {
    expect(needsQaYes('')).toBe(false);
    expect(needsQaYes(null)).toBe(false);
  });

  it('matches uppercase X checkbox', () => {
    expect(needsQaYes('- [X] Yes — device QA')).toBe(true);
  });
});

describe('isDependabotAuthor', () => {
  it('matches Dependabot logins', () => {
    expect(isDependabotAuthor('dependabot[bot]')).toBe(true);
    expect(isDependabotAuthor('Dependabot')).toBe(true);
  });

  it('does not match humans', () => {
    expect(isDependabotAuthor('mattrace-gloo')).toBe(false);
  });
});

describe('buildHandoffCommentBody', () => {
  it('includes marker, PR link, and QA assignee', () => {
    const body = buildHandoffCommentBody({
      prNumber: 400,
      prUrl: 'https://github.com/eten-tech-foundation/fluent-mobile/pull/400',
      mergeSha: 'abcdef1234567890',
    });
    expect(body).toContain(HANDOFF_MARKER);
    expect(body).toContain('#400');
    expect(body).toContain('@Roslin22');
    expect(body).toContain('abcdef1');
    expect(body).toContain('nightly');
  });
});

describe('qaHandoffOnMerge', () => {
  function createCore() {
    return { info: jest.fn(), warning: jest.fn() };
  }

  it('skips when Needs QA? is No', async () => {
    const github = {
      rest: {
        pulls: { get: jest.fn() },
        issues: {
          createComment: jest.fn(),
          addAssignees: jest.fn(),
        },
      },
      graphql: jest.fn(),
    };
    const core = createCore();
    const result = await qaHandoffOnMerge({
      github,
      context: {
        repo: { owner: 'org', repo: 'fluent-mobile' },
        payload: {
          pull_request: {
            number: 100,
            merged: true,
            body: NEEDS_QA_NO_BODY,
            user: { login: 'mattrace-gloo' },
            html_url: 'https://example.com/pull/100',
          },
        },
      },
      core,
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('needs_qa_no');
    expect(github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('skips Dependabot', async () => {
    const core = createCore();
    const result = await qaHandoffOnMerge({
      github: { rest: { issues: {} }, graphql: jest.fn() },
      context: {
        repo: { owner: 'org', repo: 'fluent-mobile' },
        payload: {
          pull_request: {
            number: 50,
            merged: true,
            body: NEEDS_QA_YES_BODY,
            user: { login: 'dependabot[bot]' },
          },
        },
      },
      core,
    });
    expect(result.reason).toBe('dependabot');
  });

  it('comments, assigns Roslin22, and moves In QA for Refs', async () => {
    const createComment = jest.fn().mockResolvedValue({});
    const addAssignees = jest.fn().mockResolvedValue({});
    const graphql = jest
      .fn()
      // closingIssuesReferences (resolveLinkedIssueNumbers)
      .mockResolvedValueOnce({
        repository: {
          pullRequest: { closingIssuesReferences: { nodes: [] } },
        },
      })
      // findProjectItem
      .mockResolvedValueOnce({
        repository: {
          issue: {
            projectItems: {
              nodes: [
                {
                  id: 'item-188',
                  project: { id: 'PVT_kwDOB8vK1s4A34c5' },
                  fieldValueByName: { name: 'In PR Review' },
                },
              ],
            },
          },
        },
      })
      // updateProjectV2ItemFieldValue
      .mockResolvedValueOnce({ projectV2Item: { id: 'item-188' } });

    const github = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              title: '[#188]: Shell',
              body: NEEDS_QA_YES_BODY,
            },
          }),
        },
        issues: {
          createComment,
          addAssignees,
          listComments: jest.fn().mockResolvedValue({ data: [] }),
          deleteComment: jest.fn(),
        },
      },
      graphql,
    };

    const core = createCore();
    const result = await qaHandoffOnMerge({
      github,
      context: {
        repo: { owner: 'org', repo: 'fluent-mobile' },
        payload: {
          pull_request: {
            number: 281,
            merged: true,
            body: NEEDS_QA_YES_BODY,
            user: { login: 'B3RN153' },
            html_url:
              'https://github.com/eten-tech-foundation/fluent-mobile/pull/281',
            merge_commit_sha: 'deadbeefcafebabe',
          },
        },
      },
      core,
    });

    expect(result.skipped).toBe(false);
    expect(result.issueNumbers).toEqual([188]);
    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 188,
        body: expect.stringContaining(HANDOFF_MARKER),
      }),
    );
    expect(addAssignees).toHaveBeenCalledWith({
      owner: 'org',
      repo: 'fluent-mobile',
      issue_number: 188,
      assignees: [DEFAULT_QA_ASSIGNEE],
    });
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('Moved #188 → In QA'),
    );
  });

  it('skips Part of #NNN only', async () => {
    const createComment = jest.fn();
    const github = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              title: 'Stacked',
              body: 'Part of #274\n\n**Needs QA?**\n\n- [x] Yes',
            },
          }),
        },
        issues: { createComment, addAssignees: jest.fn() },
      },
      graphql: jest.fn().mockResolvedValue({
        repository: {
          pullRequest: { closingIssuesReferences: { nodes: [] } },
        },
      }),
    };
    const core = createCore();
    const result = await qaHandoffOnMerge({
      github,
      context: {
        repo: { owner: 'org', repo: 'fluent-mobile' },
        payload: {
          pull_request: {
            number: 99,
            merged: true,
            body: 'Part of #274\n\n**Needs QA?**\n\n- [x] Yes',
            user: { login: 'dev' },
            html_url: 'https://example.com/pull/99',
          },
        },
      },
      core,
    });
    expect(result.reason).toBe('no_linked_issues');
    expect(createComment).not.toHaveBeenCalled();
  });
});

describe('workflow require() contract', () => {
  it('exports a callable function when required by plain Node', () => {
    const scriptPath = path.join(__dirname, 'qa-handoff-on-merge.cjs');
    const exported = execFileSync(
      process.execPath,
      [
        '-e',
        `process.stdout.write(typeof require(${JSON.stringify(scriptPath)}))`,
      ],
      { encoding: 'utf8' },
    );
    expect(exported).toBe('function');
  });
});
