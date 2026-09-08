const {
  EAS_STEP,
  SKIP_SUMMARY_STEP,
  runConsideredApk,
  resolveLastNightlySha,
} = require('./resolve-last-nightly-sha.cjs');

describe('resolve-last-nightly-sha', () => {
  it('ignores green ignored-schedule no-ops that never built', () => {
    const runs = [
      { id: 1, conclusion: 'success', head_sha: 'aaa' },
      { id: 2, conclusion: 'success', head_sha: 'bbb' },
    ];
    const jobsById = {
      1: [
        {
          name: 'Nightly Android APK',
          steps: [
            {
              name: 'Write ignored-schedule summary',
              conclusion: 'success',
            },
            { name: EAS_STEP, conclusion: 'skipped' },
          ],
        },
      ],
      2: [
        {
          name: 'Nightly Android APK',
          steps: [
            { name: EAS_STEP, conclusion: 'success' },
            { name: SKIP_SUMMARY_STEP, conclusion: 'skipped' },
          ],
        },
      ],
    };
    expect(resolveLastNightlySha(runs, (id) => jobsById[id])).toBe('bbb');
  });

  it('treats intentional skip-summary as a considered SHA', () => {
    const runs = [{ id: 9, conclusion: 'success', head_sha: 'ccc' }];
    const jobs = [
      {
        name: 'Nightly Android APK',
        steps: [{ name: SKIP_SUMMARY_STEP, conclusion: 'success' }],
      },
    ];
    expect(runConsideredApk(jobs)).toBe(true);
    expect(resolveLastNightlySha(runs, () => jobs)).toBe('ccc');
  });

  it('returns empty when only no-op successes exist', () => {
    const runs = [{ id: 3, conclusion: 'success', head_sha: 'ddd' }];
    const jobs = [
      {
        name: 'Nightly Android APK',
        steps: [
          {
            name: 'Write drifted-schedule summary',
            conclusion: 'success',
          },
        ],
      },
    ];
    expect(runConsideredApk(jobs)).toBe(false);
    expect(resolveLastNightlySha(runs, () => jobs)).toBe('');
  });
});
