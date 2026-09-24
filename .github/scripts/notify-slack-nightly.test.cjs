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

  it('names the failed gate step for STATUS=gate_failure', () => {
    const payload = dryRunPayload({
      STATUS: 'gate_failure',
      TRIGGER: 'schedule',
      BRANCH: 'main',
      SHA: 'abc1234deadbeef',
      RUN_URL: 'https://github.com/org/repo/actions/runs/1',
      FAILED_STEP: 'Expo doctor',
    });

    expect(payload.text).toBe(':warning: Fluent nightly failed before APK build');
    expect(payload.attachments[0].color).toBe('#e8b339');
    expect(payload.text).not.toMatch(/:x:/);

    const body = payload.attachments[0].text;
    expect(body).toMatch(/\*Status:\* failed \(before APK\)/);
    expect(body).toMatch(/\*Trigger:\* schedule/);
    expect(body).toMatch(/\*Branch:\* `main`/);
    expect(body).toMatch(/\*Commit:\* `abc1234`/);
    expect(body).toMatch(/Workflow run/);
    expect(body).toMatch(/Failed step: `Expo doctor`/);
    expect(body).toMatch(/before EAS started/);
    expect(body).not.toMatch(/skipped \(no APK\)/);
    expect(body).not.toMatch(/Owner:/);
  });

  it('reports EAS failure for STATUS=build_failure', () => {
    const payload = dryRunPayload({
      STATUS: 'build_failure',
      TRIGGER: 'schedule',
      BRANCH: 'main',
      SHA: 'abc1234deadbeef',
      RUN_URL: 'https://github.com/org/repo/actions/runs/1',
      FAILED_STEP: 'EAS nightly Android build (binary only)',
    });

    expect(payload.text).toBe(':warning: Fluent nightly APK build failed');
    const body = payload.attachments[0].text;
    expect(body).toMatch(/\*Status:\* failed \(EAS\)/);
    expect(body).toMatch(/Failed step: `EAS nightly Android build \(binary only\)`/);
    expect(body).not.toMatch(/skipped \(no APK\)/);
  });

  it('maps legacy STATUS=failure to build_failure copy', () => {
    const payload = dryRunPayload({
      STATUS: 'failure',
      TRIGGER: 'schedule',
      BRANCH: 'main',
      SHA: 'abc1234deadbeef',
      RUN_URL: 'https://github.com/org/repo/actions/runs/1',
      FAILED_STEP: 'EAS nightly Android build (binary only)',
    });

    expect(payload.text).toBe(':warning: Fluent nightly APK build failed');
    expect(payload.attachments[0].text).toMatch(/\*Status:\* failed \(EAS\)/);
  });
});
