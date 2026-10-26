const fs = require('fs');
const path = require('path');
const {
  assertProjectAllowed,
  evaluateChapterPreflight,
  parseFlowTags,
  parseIdList,
  parseMaestroInvocation,
  preflightFromArgv,
} = require('./maestro-fixture-guard.cjs');

const root = path.join(__dirname, '..');

describe('maestro fixture guard', () => {
  it('parses comma-separated ids', () => {
    expect(parseIdList(' 12, 34 ,,')).toEqual(['12', '34']);
    expect(parseIdList('')).toEqual([]);
  });

  it('blocks an empty allowlist', () => {
    const result = assertProjectAllowed('9', '', '');
    expect(result.ok).toBe(false);
    expect(result.status).toBe('BLOCKED');
  });

  it('blocks denylisted demo projects even when allowlisted', () => {
    const result = assertProjectAllowed('5', '5,6', '5');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/denylisted/);
  });

  it('allows an allowlisted disposable project', () => {
    expect(assertProjectAllowed('6', '5,6', '5').ok).toBe(true);
  });
});

describe('chapter fixture preflight', () => {
  const pinned = `
tags:
  - record
---
- runFlow: ../../shared/nav/open-my-work-chapter.yaml
`;
  const smoke = `
tags:
  - smoke
  - record
---
- runFlow: ../../shared/nav/open-any-chapter.yaml
`;
  const auth = `
tags:
  - auth
  - smoke
---
- assertVisible:
    id: login-email-input
`;

  it('reads yaml tags', () => {
    expect(parseFlowTags(pinned)).toEqual(['record']);
  });

  it('parses include and exclude tags without treating paths as flags', () => {
    expect(
      parseMaestroInvocation([
        '--config',
        '.maestro/config.yaml',
        '--include-tags',
        'smoke',
        '--exclude-tags',
        'offline,permissions,ownership',
        '.maestro',
      ]),
    ).toEqual({
      includeTags: ['smoke'],
      excludeTags: ['offline', 'permissions', 'ownership'],
      paths: ['.maestro'],
    });
  });

  it('blocks a selected fixture-chapter flow when the chapter id is empty', () => {
    const result = evaluateChapterPreflight({
      chapterId: '  ',
      includeTags: ['record'],
      excludeTags: [],
      flows: [
        { path: 'recording-nav-guard.yaml', yaml: pinned },
        { path: 'record-stop-play-delete.yaml', yaml: smoke },
        { path: 'login-happy-path.yaml', yaml: auth },
      ],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.flows).toEqual(['recording-nav-guard.yaml']);
  });

  it('blocks a mutating flow that still opens the first row', () => {
    const result = evaluateChapterPreflight({
      chapterId: '42',
      projectId: '6',
      allowlist: '6',
      denylist: '',
      includeTags: ['record'],
      excludeTags: [],
      flows: [
        {
          path: 'record-stop-play-delete.yaml',
          yaml: `
tags:
  - record
  - mutating
---
- runFlow: ../../shared/nav/open-any-chapter.yaml
`,
        },
      ],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toMatch(/MAESTRO_FIXTURE_CHAPTER_ID/);
    expect(result.flows).toEqual(['record-stop-play-delete.yaml']);
  });

  it('blocks a pinned mutating flow when the project is not allowlisted', () => {
    const mutating = `
tags:
  - record
  - mutating
---
- runFlow: ../../shared/nav/open-my-work-chapter.yaml
`;
    const denied = evaluateChapterPreflight({
      chapterId: '42',
      projectId: '5',
      allowlist: '5,6',
      denylist: '5',
      includeTags: [],
      excludeTags: [],
      flows: [{ path: 'record-to-synced.yaml', yaml: mutating }],
    });
    expect(denied.status).toBe('BLOCKED');
    expect(denied.reason).toMatch(/denylisted/);
    const emptyAllow = evaluateChapterPreflight({
      chapterId: '42',
      projectId: '6',
      allowlist: '',
      denylist: '',
      includeTags: [],
      excludeTags: [],
      flows: [{ path: 'record-to-synced.yaml', yaml: mutating }],
    });
    expect(emptyAllow.status).toBe('BLOCKED');
    expect(emptyAllow.reason).toMatch(/ALLOWLIST/);
  });

  it('passes smoke and auth filters when the chapter id is empty', () => {
    const flows = [
      { path: 'recording-nav-guard.yaml', yaml: pinned },
      { path: 'login-happy-path.yaml', yaml: auth },
    ];
    expect(
      evaluateChapterPreflight({
        chapterId: '',
        includeTags: ['smoke'],
        excludeTags: ['offline', 'permissions'],
        flows,
      }).ok,
    ).toBe(true);
    expect(
      evaluateChapterPreflight({
        chapterId: '',
        includeTags: ['auth'],
        excludeTags: [],
        flows,
      }).ok,
    ).toBe(true);
  });

  it('passes when the selected fixture flow has a chapter id', () => {
    expect(
      evaluateChapterPreflight({
        chapterId: '42',
        includeTags: [],
        excludeTags: [],
        flows: [{ path: 'recording-nav-guard.yaml', yaml: pinned }],
      }).ok,
    ).toBe(true);
  });
});

describe('checked-in npm Maestro lanes', () => {
  const { scripts } = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  );
  const lanes = Object.entries(scripts)
    .filter(([, command]) => command.includes('scripts/maestro-test.sh '))
    .map(([name, command]) => [
      name,
      command.split('scripts/maestro-test.sh ')[1].trim().split(/\s+/),
    ]);
  const emptyFixture = {
    chapterId: '',
    milestoneId: '',
    projectId: '',
    allowlist: '',
    denylist: '',
  };

  it('finds the maestro-test.sh npm lanes', () => {
    expect(lanes.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        'maestro:test',
        'maestro:test:smokes',
        'maestro:test:record',
      ]),
    );
  });

  it.each(lanes)('%s passes preflight without fixture env', (_name, argv) => {
    const result = preflightFromArgv({ ...emptyFixture, cwd: root, argv });
    expect(result).toMatchObject({ ok: true, status: 'PASS' });
  });

  it('does not select mutating flows from smoke or auth even without excludes', () => {
    for (const tag of ['smoke', 'auth']) {
      const result = preflightFromArgv({
        ...emptyFixture,
        cwd: root,
        argv: [
          '--config',
          '.maestro/config.yaml',
          '--include-tags',
          tag,
          '.maestro',
        ],
      });
      expect(result.ok).toBe(true);
    }
  });

  it('blocks an unfiltered workspace run without fixture env', () => {
    const result = preflightFromArgv({
      ...emptyFixture,
      cwd: root,
      argv: ['--config', '.maestro/config.yaml', '.maestro'],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.flows.length).toBeGreaterThan(0);
  });

  it('passes the record lane when the chapter and project are allowlisted', () => {
    const result = preflightFromArgv({
      chapterId: '42',
      projectId: '6',
      allowlist: '6',
      denylist: '5',
      cwd: root,
      argv: [
        '--config',
        '.maestro/config.yaml',
        '--include-tags',
        'record',
        '.maestro',
      ],
    });
    expect(result.ok).toBe(true);
  });
});

describe('exact milestone fixture helper', () => {
  const flowPath = path.join(
    root,
    '.maestro/flows/recording/fixture-capture.yaml',
  );
  const command =
    '- runFlow: ../../shared/nav/open-fixture-chapter-from-milestone.yaml';
  const yaml = `tags:\n  - record\n  - mutating\n---\n${command}\n`;
  const input = {
    chapterId: '42',
    milestoneId: '19',
    projectId: '6',
    allowlist: '6',
    denylist: '5',
    flows: [{ path: flowPath, yaml }],
  };

  it('accepts the actual named unconditional runFlow helper', () => {
    expect(evaluateChapterPreflight(input).ok).toBe(true);
  });

  it('accepts an absolute canonical helper call from a temporary flow', () => {
    const target = path.join(
      root,
      '.maestro/shared/nav/open-fixture-chapter-from-milestone.yaml',
    );
    expect(
      evaluateChapterPreflight({
        ...input,
        flows: [
          {
            path: '/tmp/authorized-capture.yaml',
            yaml: `tags:\n  - mutating\n---\n- runFlow: '${target}'\n`,
          },
        ],
      }).ok,
    ).toBe(true);
  });

  it.each([
    ['missing chapter', { chapterId: '' }],
    ['missing milestone', { milestoneId: '' }],
    ['non-positive milestone', { milestoneId: '0' }],
    ['denied project', { denylist: '6' }],
    ['unallowlisted project', { allowlist: '13' }],
    ['missing project', { projectId: '' }],
  ])('blocks %s', (_name, overrides) => {
    expect(evaluateChapterPreflight({ ...input, ...overrides }).ok).toBe(false);
  });

  it.each([
    `# ${command}`,
    '- evalScript: "open-fixture-chapter-from-milestone.yaml"',
    `- runFlow:\n    when:\n      visible: home-tab-projects\n    commands:\n      ${command}`,
    '- runFlow: ../../untrusted/open-fixture-chapter-from-milestone.yaml',
  ])(
    'rejects comments, strings, conditional or different-path lookalikes: %s',
    body => {
      expect(
        evaluateChapterPreflight({
          ...input,
          flows: [
            { path: flowPath, yaml: `tags:\n  - mutating\n---\n${body}\n` },
          ],
        }).ok,
      ).toBe(false);
    },
  );
});
