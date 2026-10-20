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

describe('checked-in chapter navigation', () => {
  const fixtureFlows = [
    '.maestro/flows/recording/recording-nav-guard.yaml',
    '.maestro/flows/drafting/source-audio-dock.yaml',
    '.maestro/flows/recording/take-view-toggle.yaml',
    '.maestro/flows/edges/mic-denied.yaml',
  ];
  const mutatingFlows = [
    '.maestro/flows/recording/record-stop-play-delete.yaml',
    '.maestro/flows/sync/record-to-synced.yaml',
    '.maestro/flows/recording/recording-nav-guard.yaml',
  ];
  const smokeChapterFlows = [
    '.maestro/flows/recording/verse-bounds.yaml',
    '.maestro/flows/drafting/resources-sections.yaml',
    '.maestro/flows/navigation/my-work-to-drafting.yaml',
    '.maestro/flows/drafting/tabs.yaml',
    '.maestro/flows/drafting/bible-verse-to-record.yaml',
  ];

  it('pins non-smoke chapter flows to the fixture helper', () => {
    for (const file of fixtureFlows) {
      const yaml = fs.readFileSync(path.join(root, file), 'utf8');
      expect(yaml).toContain('open-my-work-chapter.yaml');
      expect(yaml).not.toContain('open-any-chapter.yaml');
    }
  });

  it('pins mutating flows to the fixture chapter and drops the smoke tag', () => {
    for (const file of mutatingFlows) {
      const yaml = fs.readFileSync(path.join(root, file), 'utf8');
      expect(yaml).toContain('open-my-work-chapter.yaml');
      expect(yaml).not.toContain('open-any-chapter.yaml');
      expect(yaml).toMatch(/\n  - mutating\n/);
      expect(yaml).not.toMatch(/\n  - smoke\n/);
    }
  });

  it('leaves read-only smoke chapter flows on their existing navigation helpers', () => {
    for (const file of smokeChapterFlows) {
      const yaml = fs.readFileSync(path.join(root, file), 'utf8');
      expect(yaml).toContain(
        file === '.maestro/flows/drafting/resources-sections.yaml'
          ? 'open-fixture-chapter.yaml'
          : 'open-any-chapter.yaml',
      );
      expect(yaml).not.toContain('open-my-work-chapter.yaml');
      expect(yaml).toMatch(/\n  - smoke\n/);
    }
  });

  it('does not require a chapter id for the smoke or auth npm invocations', () => {
    const smoke = preflightFromArgv({
      chapterId: '',
      cwd: root,
      argv: [
        '--config',
        '.maestro/config.yaml',
        '--include-tags',
        'smoke',
        '--exclude-tags',
        'offline,permissions,ownership,mutating',
        '.maestro',
      ],
    });
    const smokeWithoutExclude = preflightFromArgv({
      chapterId: '',
      projectId: '',
      allowlist: '',
      denylist: '',
      cwd: root,
      argv: [
        '--config',
        '.maestro/config.yaml',
        '--include-tags',
        'smoke',
        '.maestro',
      ],
    });
    expect(smokeWithoutExclude.ok).toBe(true);
    const auth = preflightFromArgv({
      chapterId: '',
      cwd: root,
      argv: [
        '--config',
        '.maestro/config.yaml',
        '--include-tags',
        'auth',
        '.maestro',
      ],
    });
    expect(smoke.ok).toBe(true);
    expect(auth.ok).toBe(true);
  });

  it('blocks the default suite, which selects fixture chapter flows', () => {
    const result = preflightFromArgv({
      chapterId: '',
      cwd: root,
      argv: [
        '--config',
        '.maestro/config.yaml',
        '--exclude-tags',
        'multi-account,accounts,empty-assignments,offline,permissions,ownership',
        '.maestro',
      ],
    });
    expect(result.status).toBe('BLOCKED');
    const names = result.flows.map(file => path.basename(file));
    expect(result.reason).toMatch(/project id is empty/);
    expect(names).toEqual(
      expect.arrayContaining([
        'recording-nav-guard.yaml',
        'record-stop-play-delete.yaml',
        'record-to-synced.yaml',
      ]),
    );
    expect(names).not.toContain('mic-denied.yaml');
    expect(names).not.toContain('verse-bounds.yaml');
  });

  it('still blocks fixture navigation when the project is allowlisted and the chapter id is empty', () => {
    const result = preflightFromArgv({
      chapterId: '',
      projectId: '6',
      allowlist: '6',
      denylist: '5',
      cwd: root,
      argv: [
        '--config',
        '.maestro/config.yaml',
        '--exclude-tags',
        'multi-account,accounts,empty-assignments,offline,permissions,ownership',
        '.maestro',
      ],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toMatch(/MAESTRO_FIXTURE_CHAPTER_ID/);
    const names = result.flows.map(file => path.basename(file));
    expect(names).toEqual(
      expect.arrayContaining([
        'record-stop-play-delete.yaml',
        'record-to-synced.yaml',
        'source-audio-dock.yaml',
      ]),
    );
  });

  it('blocks the record tag lane until the project is allowlisted', () => {
    const result = preflightFromArgv({
      chapterId: '',
      cwd: root,
      argv: [
        '--config',
        '.maestro/config.yaml',
        '--include-tags',
        'record',
        '.maestro',
      ],
    });
    expect(result.status).toBe('BLOCKED');
    expect(result.reason).toMatch(/project id is empty/);
    const names = result.flows.map(file => path.basename(file));
    expect(names).toEqual(
      expect.arrayContaining([
        'recording-nav-guard.yaml',
        'record-stop-play-delete.yaml',
        'record-to-synced.yaml',
      ]),
    );
    expect(names).not.toContain('verse-bounds.yaml');
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
    chapterId: '1183',
    milestoneId: '19',
    projectId: '12',
    allowlist: '12',
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
    ['denied project', { denylist: '12' }],
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

  it('keeps the new helper navigation-only and pinned to exact IDs', () => {
    const helper = fs.readFileSync(
      path.join(
        root,
        '.maestro/shared/nav/open-fixture-chapter-from-milestone.yaml',
      ),
      'utf8',
    );
    expect(helper).toContain('^milestone-row-${MAESTRO_FIXTURE_MILESTONE_ID}$');
    expect(helper).toContain('^chapter-row-${MAESTRO_FIXTURE_CHAPTER_ID}$');
    expect(helper).toContain('id: home-tab-my-work');
    expect(helper).toContain('id: drafting-tab-bar');
    expect(helper).not.toMatch(
      /goto-home|ensure-no-modal|clearState|record-start-button|record-new-take-button/,
    );
  });
});
