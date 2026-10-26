const { execFileSync } = require('child_process');
const path = require('path');

const qaHandoffOnMerge = require('./qa-handoff-on-merge.cjs');
const {
  needsQaYes,
  needsQaNo,
  isDependabotAuthor,
  buildHandoffCommentBody,
  buildEngDoneCommentBody,
  HANDOFF_MARKER,
  ENG_DONE_MARKER,
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

/** Full standard PR template shape (inline checklist marker + standalone block). */
function fullTemplateBody({ yesChecked = false, noChecked = false } = {}) {
  const yes = yesChecked ? 'x' : ' ';
  const no = noChecked ? 'x' : ' ';
  return `### TLDR

Ship the feature.

### Reviewer checklist

- [ ] GitHub issue linked in Details (\`Refs #NNN\` — do **not** use \`Closes\` / \`Fixes\` / \`Resolves\`; use \`Refs: none\` only for explicit no-ticket chores)
- [ ] How to verify steps completed or valid waiver noted below
- [ ] Acceptance criteria met, **or** unmet AC waived **in the issue** with linked follow-up (see \`AGENTS.md\`)
- [ ] Scope limited to this issue — no adjacent tickets implemented/stubbed without approval
- [ ] **Needs QA?** decided (see \`docs/guides/qa-process.md\`)

### Details

Refs #679

**Needs QA?**

- [${no}] No — engineering-only (docs, CI, refactor, logging, etc.)
- [${yes}] Yes — post-merge nightly QA (see \`docs/guides/qa-process.md\`)

**Type of change:**

- [x] Bug fix

#### Technical changes

- \`.github/scripts/qa-handoff-on-merge.cjs\`

#### Testing

Focused unit tests for the handoff parser.

### How to verify

1. npm test -- --ci .github/scripts/qa-handoff-on-merge.test.cjs

**Expected:** Parser reads the standalone Needs QA block.

### Follow-ups

None.
`;
}

const FULL_TEMPLATE_YES = fullTemplateBody({ yesChecked: true });
const FULL_TEMPLATE_NO = fullTemplateBody({ noChecked: true });
const FULL_TEMPLATE_NEITHER = fullTemplateBody();
const FULL_TEMPLATE_BOTH = fullTemplateBody({
  yesChecked: true,
  noChecked: true,
});
const INLINE_MARKER_ONLY = `### Reviewer checklist

- [ ] **Needs QA?** decided (see \`docs/guides/qa-process.md\`)

### Details

Refs #1

No standalone Needs QA block here.
`;

describe('needsQaYes / needsQaNo', () => {
  it('detects checked Yes under Needs QA?', () => {
    expect(needsQaYes(NEEDS_QA_YES_BODY)).toBe(true);
    expect(needsQaNo(NEEDS_QA_YES_BODY)).toBe(false);
  });

  it('detects checked No when engineering-only', () => {
    expect(needsQaNo(NEEDS_QA_NO_BODY)).toBe(true);
    expect(needsQaYes(NEEDS_QA_NO_BODY)).toBe(false);
  });

  it('ignores empty / missing body', () => {
    expect(needsQaYes('')).toBe(false);
    expect(needsQaYes(null)).toBe(false);
    expect(needsQaNo('')).toBe(false);
    expect(needsQaNo(null)).toBe(false);
  });

  it('matches uppercase X checkbox', () => {
    expect(needsQaYes('**Needs QA?**\n\n- [X] Yes — device QA')).toBe(true);
    expect(needsQaNo('**Needs QA?**\n\n- [X] No — engineering-only')).toBe(
      true,
    );
  });

  it('does not match checked No outside the Needs QA section', () => {
    expect(needsQaNo('Refs #1\n\n- [x] No — unrelated checklist item')).toBe(
      false,
    );
    expect(needsQaYes('Refs #1\n\n- [x] Yes — unrelated checklist item')).toBe(
      false,
    );
  });

  it('full template with Yes checked uses standalone block (PR #771 shape)', () => {
    expect(needsQaYes(FULL_TEMPLATE_YES)).toBe(true);
    expect(needsQaNo(FULL_TEMPLATE_YES)).toBe(false);
  });

  it('full template with No checked uses standalone block', () => {
    expect(needsQaNo(FULL_TEMPLATE_NO)).toBe(true);
    expect(needsQaYes(FULL_TEMPLATE_NO)).toBe(false);
  });

  it('full template with neither checked stays unset', () => {
    expect(needsQaYes(FULL_TEMPLATE_NEITHER)).toBe(false);
    expect(needsQaNo(FULL_TEMPLATE_NEITHER)).toBe(false);
  });

  it('full template with both checked keeps Yes and No true (ambiguous safety)', () => {
    expect(needsQaYes(FULL_TEMPLATE_BOTH)).toBe(true);
    expect(needsQaNo(FULL_TEMPLATE_BOTH)).toBe(true);
  });

  it('inline checklist marker alone does not invent Yes or No', () => {
    expect(needsQaYes(INLINE_MARKER_ONLY)).toBe(false);
    expect(needsQaNo(INLINE_MARKER_ONLY)).toBe(false);
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

describe('buildEngDoneCommentBody', () => {
  it('includes eng-done marker and Done wording', () => {
    const body = buildEngDoneCommentBody({
      prNumber: 401,
      prUrl: 'https://github.com/eten-tech-foundation/fluent-mobile/pull/401',
      mergeSha: 'fedcba9876543210',
    });
    expect(body).toContain(ENG_DONE_MARKER);
    expect(body).toContain('#401');
    expect(body).toContain('Done');
    expect(body).toContain('fedcba9');
  });
});

describe('qaHandoffOnMerge', () => {
  function createCore() {
    return { info: jest.fn(), warning: jest.fn() };
  }

  it('skips when Needs QA? is unset', async () => {
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
            body: 'Refs #1\n\nNo Needs QA section',
            user: { login: 'mattrace-gloo' },
            html_url: 'https://example.com/pull/100',
          },
        },
      },
      core,
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('needs_qa_unset');
    expect(github.rest.issues.createComment).not.toHaveBeenCalled();
  });

  it('closes linked issues and moves Done when Needs QA? is No', async () => {
    const createComment = jest.fn().mockResolvedValue({});
    const update = jest.fn().mockResolvedValue({});
    const graphql = jest
      .fn()
      .mockResolvedValueOnce({
        repository: {
          pullRequest: { closingIssuesReferences: { nodes: [] } },
        },
      })
      .mockResolvedValueOnce({
        repository: {
          issue: {
            id: 'issue-node-275',
            projectItems: {
              nodes: [
                {
                  id: 'item-275',
                  project: { id: 'PVT_kwDOB8vK1s4A34c5' },
                  fieldValueByName: { name: 'In PR Review' },
                },
              ],
            },
          },
        },
      })
      .mockResolvedValueOnce({ projectV2Item: { id: 'item-275' } });

    const github = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              title: '[#275]: Docs',
              body: NEEDS_QA_NO_BODY,
            },
          }),
        },
        issues: {
          createComment,
          listComments: jest.fn().mockResolvedValue({ data: [] }),
          deleteComment: jest.fn(),
          update,
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
            number: 100,
            merged: true,
            body: NEEDS_QA_NO_BODY,
            user: { login: 'mattrace-gloo' },
            html_url: 'https://example.com/pull/100',
            merge_commit_sha: 'abc1234567890',
          },
        },
      },
      core,
    });

    expect(result.skipped).toBe(false);
    expect(result.path).toBe('eng_done');
    expect(result.issueNumbers).toEqual([275]);
    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 275,
        body: expect.stringContaining(ENG_DONE_MARKER),
      }),
    );
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('Moved #275 → Done'),
    );
    expect(update).toHaveBeenCalledWith({
      owner: 'org',
      repo: 'fluent-mobile',
      issue_number: 275,
      state: 'closed',
      state_reason: 'completed',
    });
  });

  it('skips eng-done comment and close when Status is outside allowlist', async () => {
    const createComment = jest.fn().mockResolvedValue({});
    const update = jest.fn().mockResolvedValue({});
    const graphql = jest
      .fn()
      .mockResolvedValueOnce({
        repository: {
          pullRequest: { closingIssuesReferences: { nodes: [] } },
        },
      })
      .mockResolvedValueOnce({
        repository: {
          issue: {
            id: 'issue-node-275',
            projectItems: {
              nodes: [
                {
                  id: 'item-275',
                  project: { id: 'PVT_kwDOB8vK1s4A34c5' },
                  fieldValueByName: { name: 'Dev Ready' },
                },
              ],
            },
          },
        },
      });

    const github = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              title: '[#275]: Docs',
              body: NEEDS_QA_NO_BODY,
            },
          }),
        },
        issues: {
          createComment,
          listComments: jest.fn().mockResolvedValue({ data: [] }),
          deleteComment: jest.fn(),
          update,
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
            number: 100,
            merged: true,
            body: NEEDS_QA_NO_BODY,
            user: { login: 'mattrace-gloo' },
            html_url: 'https://example.com/pull/100',
            merge_commit_sha: 'abc1234567890',
          },
        },
      },
      core,
    });

    expect(result.skipped).toBe(false);
    expect(result.path).toBe('eng_done');
    expect(createComment).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Skipping close for #275'),
    );
  });

  it('skips eng-done comment and close when issue is not on Project 4', async () => {
    const createComment = jest.fn().mockResolvedValue({});
    const update = jest.fn().mockResolvedValue({});
    const graphql = jest
      .fn()
      .mockResolvedValueOnce({
        repository: {
          pullRequest: { closingIssuesReferences: { nodes: [] } },
        },
      })
      .mockResolvedValueOnce({
        repository: {
          issue: {
            id: 'issue-node-275',
            projectItems: { nodes: [] },
          },
        },
      });

    const github = {
      rest: {
        pulls: {
          get: jest.fn().mockResolvedValue({
            data: {
              title: '[#275]: Docs',
              body: NEEDS_QA_NO_BODY,
            },
          }),
        },
        issues: {
          createComment,
          listComments: jest.fn().mockResolvedValue({ data: [] }),
          deleteComment: jest.fn(),
          update,
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
            number: 100,
            merged: true,
            body: NEEDS_QA_NO_BODY,
            user: { login: 'mattrace-gloo' },
            html_url: 'https://example.com/pull/100',
            merge_commit_sha: 'abc1234567890',
          },
        },
      },
      core,
    });

    expect(result.skipped).toBe(false);
    expect(result.path).toBe('eng_done');
    expect(createComment).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Skipping close for #275'),
    );
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
    expect(result.path).toBe('qa');
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
