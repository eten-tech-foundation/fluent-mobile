const { execFileSync } = require('child_process');
const path = require('path');

const nightlyNotifyQaIssues = require('./nightly-notify-qa-issues.cjs');
const {
  buildNightlyInstallComment,
  INSTALL_MARKER,
  findHandoffIssueNumbers,
} = nightlyNotifyQaIssues;
const { HANDOFF_MARKER } = require('./qa-handoff-on-merge.cjs');

describe('buildNightlyInstallComment', () => {
  it('includes marker and install URL', () => {
    const body = buildNightlyInstallComment({
      installUrl: 'https://expo.dev/builds/abc',
      buildId: 'abc',
      appVersion: '1.2.3',
      shortSha: 'deadbee',
      runUrl: 'https://github.com/org/repo/actions/runs/1',
    });
    expect(body).toContain(INSTALL_MARKER);
    expect(body).toContain('https://expo.dev/builds/abc');
    expect(body).toContain('1.2.3');
    expect(body).toContain('deadbee');
  });
});

describe('findHandoffIssueNumbers', () => {
  it('collects issue numbers from bot handoff comments', async () => {
    const github = {
      rest: {
        issues: {
          listCommentsForRepo: jest.fn().mockResolvedValue({
            data: [
              {
                body: `${HANDOFF_MARKER}\nhello`,
                user: { login: 'github-actions[bot]' },
                issue_url:
                  'https://api.github.com/repos/org/repo/issues/188',
              },
              {
                body: 'unrelated',
                user: { login: 'github-actions[bot]' },
                issue_url:
                  'https://api.github.com/repos/org/repo/issues/189',
              },
              {
                body: HANDOFF_MARKER,
                user: { login: 'someone-else' },
                issue_url:
                  'https://api.github.com/repos/org/repo/issues/190',
              },
            ],
          }),
        },
      },
    };
    await expect(
      findHandoffIssueNumbers(github, 'org', 'repo', '2026-08-01T00:00:00Z'),
    ).resolves.toEqual([188]);
  });
});

describe('nightlyNotifyQaIssues', () => {
  function createCore() {
    return { info: jest.fn(), warning: jest.fn() };
  }

  it('skips without install URL', async () => {
    const core = createCore();
    const result = await nightlyNotifyQaIssues({
      github: { rest: {} },
      context: { repo: { owner: 'o', repo: 'r' } },
      core,
      installUrl: '',
    });
    expect(result.reason).toBe('no_install_url');
  });

  it('posts install comments on handoff issues (not PRs)', async () => {
    const createComment = jest.fn().mockResolvedValue({});
    const deleteComment = jest.fn().mockResolvedValue({});
    const github = {
      rest: {
        repos: {
          getCommit: jest.fn().mockResolvedValue({
            data: {
              commit: { committer: { date: '2026-08-19T06:00:00Z' } },
            },
          }),
        },
        issues: {
          listCommentsForRepo: jest.fn().mockResolvedValue({
            data: [
              {
                body: HANDOFF_MARKER,
                user: { login: 'github-actions[bot]' },
                issue_url:
                  'https://api.github.com/repos/org/fluent-mobile/issues/188',
              },
            ],
          }),
          get: jest.fn().mockResolvedValue({
            data: { number: 188, pull_request: undefined },
          }),
          listComments: jest.fn().mockResolvedValue({ data: [] }),
          createComment,
          deleteComment,
        },
      },
    };
    const core = createCore();
    const result = await nightlyNotifyQaIssues({
      github,
      context: { repo: { owner: 'org', repo: 'fluent-mobile' } },
      core,
      installUrl: 'https://expo.dev/builds/xyz',
      buildId: 'xyz',
      prevSha: 'abc123',
      shortSha: 'abcdef1',
    });
    expect(result.skipped).toBe(false);
    expect(result.issueNumbers).toEqual([188]);
    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        issue_number: 188,
        body: expect.stringContaining(INSTALL_MARKER),
      }),
    );
  });
});

describe('workflow require() contract', () => {
  it('exports a callable function when required by plain Node', () => {
    const scriptPath = path.join(__dirname, 'nightly-notify-qa-issues.cjs');
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
