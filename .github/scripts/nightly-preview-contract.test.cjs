const fs = require('fs');
const path = require('path');

const workflowPath = path.join(
  __dirname,
  '..',
  'workflows',
  'nightly-preview.yml'
);

describe('nightly-preview workflow contract (#549)', () => {
  const yaml = fs.readFileSync(workflowPath, 'utf8');

  it('registers exactly one schedule cron', () => {
    const crons = [...yaml.matchAll(/^\s+- cron:\s*'([^']+)'/gm)].map(
      (m) => m[1]
    );
    expect(crons).toEqual(['17 15 * * *']);
  });

  it('does not revive pending Slack delivery / dual-cron job', () => {
    expect(yaml).not.toMatch(/deliver-pending-slack-nightly/);
    expect(yaml).not.toMatch(/nightly-slack-payload/);
    expect(yaml).not.toMatch(/name:\s*Slack in Pacific business hours/);
    expect(yaml).not.toMatch(/7 9 \* \* \*/);
    expect(yaml).not.toMatch(/17 23 \* \* \*/);
  });

  it('runs deterministic expo-doctor matching Quality Gates', () => {
    expect(yaml).toMatch(/EXPO_DOCTOR_SKIP_DEPENDENCY_VERSION_CHECK:\s*'1'/);
    expect(yaml).toMatch(/EXPO_DOCTOR_WARN_ON_NETWORK_ERRORS:\s*'1'/);
  });

  it('runs offline expo:check before EAS', () => {
    const doctorIdx = yaml.indexOf('id: doctor');
    const expoCheckIdx = yaml.indexOf('id: expo-check');
    const buildIdx = yaml.indexOf('id: build');
    expect(doctorIdx).toBeGreaterThan(-1);
    expect(expoCheckIdx).toBeGreaterThan(doctorIdx);
    expect(buildIdx).toBeGreaterThan(expoCheckIdx);
    expect(yaml).toMatch(/EXPO_OFFLINE:\s*'1'/);
    expect(yaml).toMatch(/npm run expo:check/);
  });

  it('requires build id and install URL for success Slack', () => {
    expect(yaml).toMatch(
      /Notify Slack \(success\)[\s\S]*?steps\.build\.outputs\.build_id != ''[\s\S]*?steps\.build\.outputs\.install_url != ''/
    );
  });

  it('suppresses failure Slack after a successful EAS step', () => {
    expect(yaml).toMatch(
      /Notify Slack \(failure\)[\s\S]*?steps\.build\.conclusion != 'success'/
    );
    expect(yaml).toMatch(
      /Write Slack payload \(failure\)[\s\S]*?steps\.build\.conclusion != 'success'/
    );
  });

  it('resolves the real failed step for Slack', () => {
    expect(yaml).toMatch(/resolve-nightly-failed-step\.cjs/);
    expect(yaml).toMatch(/STATUS: \$\{\{ steps\.failed\.outputs\.kind/);
    expect(yaml).toMatch(
      /FAILED_STEP: \$\{\{ steps\.failed\.outputs\.failed_step/
    );
    expect(yaml).not.toMatch(
      /FAILED_STEP: \$\{\{ github\.job \}\}/
    );
  });
});
