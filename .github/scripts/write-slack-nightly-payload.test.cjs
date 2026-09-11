const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const script = path.join(__dirname, 'write-slack-nightly-payload.sh');

describe('write-slack-nightly-payload', () => {
  it('writes JSON that notify-slack can reload', () => {
    const out = path.join(os.tmpdir(), `slack-payload-${Date.now()}.json`);
    execFileSync('bash', [script], {
      env: {
        ...process.env,
        SLACK_PAYLOAD_OUT: out,
        STATUS: 'failure',
        TRIGGER: 'schedule',
        SHA: 'abc1234deadbeef',
        RUN_URL: 'https://github.com/org/repo/actions/runs/1',
        FAILED_STEP: 'nightly-preview',
        CHANGELOG: 'line one\nline two',
      },
    });
    const payload = JSON.parse(fs.readFileSync(out, 'utf8'));
    fs.unlinkSync(out);
    expect(payload.pending).toBeUndefined();
    expect(payload.STATUS).toBe('failure');
    expect(payload.CHANGELOG).toBe('line one\nline two');
    expect(payload.SHA).toBe('abc1234deadbeef');
  });
});
