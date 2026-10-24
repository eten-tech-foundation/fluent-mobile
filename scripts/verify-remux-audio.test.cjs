'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');

const repoRoot = path.join(__dirname, '..');
const scriptPath = path.join(repoRoot, 'scripts/verify-remux-audio.mjs');
const fixturePath = path.join(repoRoot, 'fixtures/audio/1khz-tone.aac');

function runScript(args) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
  });
}

function hasFfmpeg() {
  return (
    spawnSync('ffprobe', ['-version'], {
      encoding: 'utf8',
      timeout: 5000,
    }).status === 0 &&
    spawnSync('ffmpeg', ['-version'], {
      encoding: 'utf8',
      timeout: 5000,
    }).status === 0
  );
}

describe('verify-remux-audio', () => {
  it('fails when the input path is missing', () => {
    const missing = path.join(
      repoRoot,
      'fixtures/audio/does-not-exist-719.aac',
    );
    const result = runScript([missing]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/FAIL missing input/);
  });

  it('keeps the known non-silent fixture in the tree', () => {
    expect(fs.existsSync(fixturePath)).toBe(true);
    expect(fs.statSync(fixturePath).size).toBeGreaterThan(0);
  });
});

const describeFfmpeg = hasFfmpeg() ? describe : describe.skip;

describeFfmpeg('verify-remux-audio (ffmpeg)', () => {
  it('decodes the committed 1 kHz fixture as non-silent', () => {
    const result = runScript([fixturePath]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/ok .*AAC-LC/);
    expect(result.stdout).toMatch(/RMS -?\d+(\.\d+)? dBFS/);
  });

  it('fails a silent AAC', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-remux-719-'));
    const silentPath = path.join(tmp, 'silence.aac');
    const encoded = spawnSync(
      'ffmpeg',
      [
        '-nostdin',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'anullsrc=r=44100:cl=mono',
        '-t',
        '1',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-profile:a',
        'aac_low',
        silentPath,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 },
    );
    expect(encoded.status).toBe(0);
    try {
      const result = runScript([silentPath]);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/FAIL/);
      expect(result.stderr).toMatch(/RMS|silence/i);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
