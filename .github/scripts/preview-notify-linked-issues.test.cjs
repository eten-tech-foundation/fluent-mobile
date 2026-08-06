const { execFileSync } = require('child_process');
const path = require('path');

const notifyLinkedIssues = require('./preview-notify-linked-issues.cjs');
const {
  collectLinkedIssueNumbersFromText,
  resolveLinkedIssueNumbers,
  isPartOfOnlyReference,
  moveIssuesToInQa,
  ALLOWED_FROM_STATUS_NAMES,
} = notifyLinkedIssues;

const DETAILS_REFS_BODY = `### TLDR

Example change.

### Reviewer checklist

- [x] GitHub issue linked in Details (\`Refs #NNN\` — do **not** use \`Closes\` / \`Fixes\` / \`Resolves\`)

### Details

Refs #188

Resources tab shell.

**Type of change:**

- [x] New feature
`;

describe('collectLinkedIssueNumbersFromText', () => {
  it('matches exact Details-line Refs #NNN formatting', () => {
    expect(
      collectLinkedIssueNumbersFromText(
        '[#188]: Add Resources tab unit-synced content shell',
        DETAILS_REFS_BODY,
        281,
      ),
    ).toEqual([188]);
  });

  it('matches Refs with optional colon and case variants', () => {
    expect(
      collectLinkedIssueNumbersFromText('Title', 'refs #12\nRefs: #34', 99),
    ).toEqual([12, 34]);
  });

  it('still matches legacy closing keywords', () => {
    expect(
      collectLinkedIssueNumbersFromText(
        'Title',
        'Closes #10\nFixes #11\nResolves #12',
        99,
      ),
    ).toEqual([10, 11, 12]);
  });

  it('does not treat Part of #NNN as a linked ticket', () => {
    expect(
      collectLinkedIssueNumbersFromText(
        '[#274]: Stacked work',
        'Part of #274\n\nStacked PR toward the epic.',
        99,
      ),
    ).toEqual([]);
    expect(
      isPartOfOnlyReference(
        '[#274]: Stacked work',
        'Part of #274\n\nStacked PR toward the epic.',
        274,
      ),
    ).toBe(true);
  });

  it('keeps Refs when Part of also appears for a different issue', () => {
    expect(
      collectLinkedIssueNumbersFromText(
        '[#188]: Shell',
        'Refs #188\n\nPart of #192 — offline data later.',
        281,
      ),
    ).toEqual([188]);
    expect(
      isPartOfOnlyReference(
        '[#188]: Shell',
        'Refs #188\n\nPart of #192 — offline data later.',
        192,
      ),
    ).toBe(true);
  });

  it('excludes the PR number even when Refs matches it', () => {
    expect(
      collectLinkedIssueNumbersFromText('Title', 'Refs #301', 301),
    ).toEqual([]);
  });

  it('does not match checklist placeholder Refs #NNN (letters)', () => {
    expect(
      collectLinkedIssueNumbersFromText(
        'Title',
        '- [ ] linked (`Refs #NNN` — never Closes)',
        1,
      ),
    ).toEqual([]);
  });

  it('does not match bare [#NNN] title brackets alone', () => {
    expect(
      collectLinkedIssueNumbersFromText(
        '[#188]: Shell only',
        'No link line.',
        281,
      ),
    ).toEqual([]);
  });
});

describe('resolveLinkedIssueNumbers', () => {
  function mockGithub({ title, body, closingNodes = [] }) {
    return {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: { title, body },
          }),
        },
      },
      graphql: jest.fn().mockResolvedValue({
        repository: {
          pullRequest: {
            closingIssuesReferences: { nodes: closingNodes },
          },
        },
      }),
    };
  }

  it('resolves Refs from the PR body and drops the PR number', async () => {
    const github = mockGithub({
      title: '[#188]: Shell',
      body: DETAILS_REFS_BODY,
    });
    await expect(
      resolveLinkedIssueNumbers(github, 'o', 'r', 281),
    ).resolves.toEqual([188]);
  });

  it('merges GraphQL closingIssuesReferences but still excludes PR number', async () => {
    const github = mockGithub({
      title: 'Title',
      body: 'Refs #50',
      closingNodes: [{ number: 50 }, { number: 99 }, { number: 77 }],
    });
    await expect(
      resolveLinkedIssueNumbers(github, 'o', 'r', 99),
    ).resolves.toEqual([50, 77]);
  });

  it('returns empty for Part of-only bodies even if GraphQL is empty', async () => {
    const github = mockGithub({
      title: 'Stacked',
      body: 'Part of #274',
    });
    await expect(
      resolveLinkedIssueNumbers(github, 'o', 'r', 100),
    ).resolves.toEqual([]);
  });

  it('falls back to body parse when closingIssuesReferences fails', async () => {
    const github = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: { title: 'T', body: 'Refs #42' },
          }),
        },
      },
      graphql: jest.fn().mockRejectedValue(new Error('unavailable')),
    };
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    await expect(
      resolveLinkedIssueNumbers(github, 'o', 'r', 1),
    ).resolves.toEqual([42]);
    log.mockRestore();
  });
});

describe('notifyLinkedIssues preview comments + In QA', () => {
  const previewBody = '## Install Fluent\n\npreview-build marker';
  const markers = ['preview-build marker'];

  function createCore() {
    return {
      info: jest.fn(),
      warning: jest.fn(),
    };
  }

  it('upserts preview comments and moves allowlisted cards to In QA for Refs', async () => {
    const createComment = jest.fn().mockResolvedValue({});
    const listComments = jest.fn().mockResolvedValue({ data: [] });
    const graphql = jest
      .fn()
      // closingIssuesReferences
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
              body: 'Refs #188',
            },
          }),
        },
        issues: {
          listComments,
          createComment,
          deleteComment: jest.fn(),
        },
      },
      graphql,
    };

    const core = createCore();
    await notifyLinkedIssues({
      github,
      context: {
        repo: { owner: 'org', repo: 'fluent-mobile' },
        payload: { pull_request: { number: 281 } },
      },
      core,
      body: previewBody,
      commentMarkers: markers,
    });

    expect(createComment).toHaveBeenCalledWith({
      owner: 'org',
      repo: 'fluent-mobile',
      issue_number: 188,
      body: previewBody,
    });
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('Moved #188 → In QA'),
    );
  });

  it('skips comments and In QA when only Part of #NNN is present', async () => {
    const createComment = jest.fn();
    const github = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              title: 'Stacked',
              body: 'Part of #274',
            },
          }),
        },
        issues: {
          listComments: jest.fn(),
          createComment,
        },
      },
      graphql: jest.fn().mockResolvedValue({
        repository: {
          pullRequest: { closingIssuesReferences: { nodes: [] } },
        },
      }),
    };

    const core = createCore();
    await notifyLinkedIssues({
      github,
      context: {
        repo: { owner: 'org', repo: 'fluent-mobile' },
        payload: { pull_request: { number: 100 } },
      },
      core,
      body: previewBody,
      commentMarkers: markers,
    });

    expect(createComment).not.toHaveBeenCalled();
    expect(core.info).toHaveBeenCalledWith(
      'No linked issues on this PR — skipping ticket comments / board move',
    );
  });
});

// Jest transpiles to CJS, so it cannot see that the root `"type": "module"`
// would make a `.js` copy of this script load as ESM — `require()` from the
// preview-build workflow would then yield `{}` instead of the function.
describe('workflow require() contract', () => {
  it('exports a callable function when required by plain Node', () => {
    const scriptPath = path.join(__dirname, 'preview-notify-linked-issues.cjs');
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

describe('moveIssuesToInQa allowlist', () => {
  it('documents allowlisted handoff statuses', () => {
    expect([...ALLOWED_FROM_STATUS_NAMES].sort()).toEqual([
      'In PR Review',
      'In Progress (Dev)',
    ]);
  });

  it('does not move from non-allowlisted status', async () => {
    const graphql = jest.fn().mockResolvedValue({
      repository: {
        issue: {
          projectItems: {
            nodes: [
              {
                id: 'item-1',
                project: { id: 'PVT_kwDOB8vK1s4A34c5' },
                fieldValueByName: { name: 'Dev Ready' },
              },
            ],
          },
        },
      },
    });
    const core = { info: jest.fn(), warning: jest.fn() };

    await moveIssuesToInQa({
      github: { graphql },
      core,
      getOctokit: undefined,
      owner: 'org',
      repo: 'repo',
      issueNumbers: [188],
    });

    expect(graphql).toHaveBeenCalledTimes(1);
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('not moving to In QA'),
    );
  });
});
