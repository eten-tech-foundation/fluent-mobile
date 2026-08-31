const { execFileSync } = require('child_process');
const path = require('path');

const script = path.join(__dirname, 'notify-slack-nightly.sh');

function dryRunPayload(env) {
  const raw = execFileSync('bash', [script], {
    env: {
      ...process.env,
      DRY_RUN: 'true',
      ...env,
    },
    encoding: 'utf8',
  });
  return JSON.parse(raw);
}

describe('notify-slack-nightly', () => {
  it('uses the skip-style card for STATUS=failure (no red X / incident copy)', () => {
    const payload = dryRunPayload({
      STATUS: 'failure',
      TRIGGER: 'schedule',
      BRANCH: 'main',
      SHA: 'abc1234deadbeef',
      RUN_URL: 'https://github.com/org/repo/actions/runs/1',
      FAILED_STEP: 'nightly-preview',
    });

    expect(payload.text).toBe(':zzz: Fluent nightly skipped (no APK)');
    expect(payload.attachments[0].color).toBe('#e8b339');
    expect(payload.text).not.toMatch(/:x:/);

    const body = payload.attachments[0].text;
    expect(body).toMatch(/\*Status:\* skipped/);
    expect(body).toMatch(/\*Trigger:\* schedule/);
    expect(body).toMatch(/\*Branch:\* `main`/);
    expect(body).toMatch(/\*Commit:\* `abc1234`/);
    expect(body).toMatch(/Workflow run/);
    expect(body).toMatch(/did not produce an APK/);
    expect(body).toMatch(/nightly-preview/);
    expect(body).not.toMatch(/failed/i);
    expect(body).not.toMatch(/:x:/);
    expect(body).not.toMatch(/#e01e5a/);
    expect(body).not.toMatch(/Owner:/);
  });

  it('keeps the existing no-new-commits skip card', () => {
    const payload = dryRunPayload({
      STATUS: 'skipped',
      TRIGGER: 'schedule',
      BRANCH: 'main',
      SHA: 'abc1234deadbeef',
      RUN_URL: 'https://github.com/org/repo/actions/runs/1',
    });

    expect(payload.text).toBe(':zzz: Fluent nightly skipped (no new commits)');
    expect(payload.attachments[0].color).toBe('#e8b339');
    expect(payload.attachments[0].text).toMatch(/\*Status:\* skipped/);
  });
});
