const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
let dir, env, calls, adbCalls, a, b, list;
function invoke(args = ['--flow-list', list]) {
  // Never permit these tests to resolve the real Maestro/ADB executables.
  const probe = spawnSync(
    'bash',
    ['-c', 'command -v maestro; command -v adb'],
    {
      env,
      encoding: 'utf8',
    },
  );
  expect(probe.status).toBe(0);
  for (const executable of probe.stdout.trim().split('\n')) {
    expect(
      executable.startsWith(path.join(env.HOME, '.maestro', 'bin') + '/'),
    ).toBe(true);
  }
  const result = spawnSync('bash', ['scripts/maestro-test-qa.sh', ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 15000,
  });
  return result;
}
function captured() {
  return fs.existsSync(calls)
    ? fs.readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse)
    : [];
}
function expectNoDevice() {
  expect(captured()).toEqual([]);
  expect(fs.existsSync(adbCalls)).toBe(false);
}
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluent-ordered-stub-'));
  const home = path.join(dir, 'home');
  const bin = path.join(home, '.maestro', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  calls = path.join(dir, 'calls.jsonl');
  adbCalls = path.join(dir, 'adb.log');
  fs.writeFileSync(
    path.join(bin, 'maestro'),
    `#!${process.execPath}\nconst fs=require('fs');const argv=process.argv.slice(2);const flow=argv.filter(x=>/\.ya?ml$/.test(x)).slice(-1)[0];fs.appendFileSync(process.env.STUB_CALLS,JSON.stringify({argv,flow,journey:fs.readFileSync(flow,'utf8')})+'\\n');process.exit(Number(process.env.STUB_EXIT||0));\n`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(bin, 'adb'),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$STUB_ADB"\ncase "$1" in devices) printf "List of devices attached\\nemulator-5554\\tdevice\\n";; esac\nexit 0\n',
    { mode: 0o755 },
  );
  const qa = path.join(dir, '.env.maestro.qa');
  fs.writeFileSync(
    qa,
    'EXPO_PUBLIC_API_BASE_URL=https://qa.api.fluent.bible\n',
  );
  a = path.join(dir, 'a flow.yaml');
  b = path.join(dir, 'b.yaml');
  fs.writeFileSync(a, 'appId: com.eten.fluent\n---\n- assertTrue: true\n');
  fs.writeFileSync(b, 'appId: com.eten.fluent\n---\n- assertTrue: false\n');
  list = path.join(dir, 'ordered.txt');
  fs.writeFileSync(
    list,
    '# Ordered, relative to this file\nb.yaml\n\na flow.yaml\n',
  );
  env = {
    HOME: home,
    PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
    TMPDIR: dir,
    MAESTRO_ENV_FILE: qa,
    ANDROID_SERIAL: 'emulator-5554',
    STUB_CALLS: calls,
    STUB_ADB: adbCalls,
  };
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

it('launches one ordered parent, preserving relative paths with spaces and CLI options', () => {
  const result = invoke([
    '--flow-list',
    list,
    '-e',
    'MARKER=literal value',
    '--test-output-dir',
    path.join(dir, 'output'),
  ]);
  expect(result.status).toBe(0);
  const rows = captured();
  expect(rows).toHaveLength(1);
  expect(rows[0].argv.slice(0, 5)).toEqual([
    'test',
    '-p',
    'android',
    '--device',
    'emulator-5554',
  ]);
  expect(rows[0].argv).toContain('MARKER=literal value');
  expect(rows[0].journey).toBe(
    `appId: com.eten.fluent\nname: Ordered Fluent journey\n---\n- runFlow: ${JSON.stringify(
      b,
    )}\n- runFlow: ${JSON.stringify(a)}\n`,
  );
  expect(fs.existsSync(rows[0].flow)).toBe(false);
  expect(fs.readFileSync(adbCalls, 'utf8')).toContain(
    '-s emulator-5554 reverse tcp:8081 tcp:8081',
  );
});
it('preserves existing positional multiple-flow forwarding as one CLI invocation', () => {
  expect(
    invoke([b, a, '--test-output-dir', path.join(dir, 'output')]).status,
  ).toBe(0);
  expect(captured()).toHaveLength(1);
  expect(captured()[0].argv.slice(5, 7)).toEqual([b, a]);
});
it('preflights every listed flow before ADB, including an unsafe second child', () => {
  fs.writeFileSync(
    a,
    'appId: com.eten.fluent\ntags: [mutating]\n---\n- assertTrue: true\n',
  );
  const result = invoke();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('mutating flow does not target');
  expectNoDevice();
});
it('retains QA API pin rejection before any device operation', () => {
  const result = invoke([
    '--flow-list',
    list,
    '-e',
    'EXPO_PUBLIC_API_BASE_URL=https://dev.api.fluent.bible',
  ]);
  expect(result.status).toBe(2);
  expect(result.stderr).toMatch(/immutable pin/);
  expectNoDevice();
});
it.each([
  ['--include-tags', 'smoke'],
  ['--exclude-tags=mutating'],
  ['--device', 'emulator-5556'],
  ['--shard-split', '2'],
  [a],
])('rejects ambiguous or guard-changing ordered options %j', (...args) => {
  expect(invoke(['--flow-list', list, ...args]).status).toBe(2);
  expectNoDevice();
});
it.each(['missing.yaml\n', '', 'b.yaml\nb.yaml\n'])(
  'rejects invalid/empty/duplicate lists before ADB: %j',
  content => {
    fs.writeFileSync(list, content);
    expect(invoke().status).toBe(2);
    expectNoDevice();
  },
);
it('preserves CLI failure status and removes the temporary parent on failure', () => {
  env.STUB_EXIT = '9';
  expect(invoke().status).toBe(9);
  expect(captured()).toHaveLength(1);
  expect(fs.existsSync(captured()[0].flow)).toBe(false);
});
it('blocks a nested mutating dependency even when its parent has no mutating tag', () => {
  fs.writeFileSync(
    b,
    `appId: com.eten.fluent\n---\n- runFlow: ${JSON.stringify(a)}\n`,
  );
  fs.writeFileSync(
    a,
    'appId: com.eten.fluent\ntags: [mutating]\n---\n- assertTrue: true\n',
  );
  fs.writeFileSync(list, 'b.yaml\n');
  const result = invoke();
  expect(result.status).toBe(2);
  expect(result.stderr).toContain('mutating flow does not target');
  expectNoDevice();
});
it.each([
  '- runFlow: missing.yaml',
  '- runFlow: ${DYNAMIC_FLOW}',
  '- runFlow: b.yaml',
  '- runFlow:\n    file: a flow.yaml\n    env:\n      MAESTRO_FIXTURE_PROJECT_ID: 99',
])(
  'blocks unresolved/cyclic dependencies and nested fixture overrides: %j',
  command => {
    fs.writeFileSync(b, `appId: com.eten.fluent\n---\n${command}\n`);
    fs.writeFileSync(list, 'b.yaml\n');
    expect(invoke().status).toBe(2);
    expectNoDevice();
  },
);
it('accepts a static nested fragment with unchanged fixture parameters in one invocation', () => {
  env.MAESTRO_FIXTURE_PROJECT_ID = '12';
  fs.writeFileSync(
    b,
    'appId: com.eten.fluent\n---\n- runFlow:\n    file: a flow.yaml\n    env:\n      MAESTRO_FIXTURE_PROJECT_ID: ${MAESTRO_FIXTURE_PROJECT_ID}\n',
  );
  fs.writeFileSync(list, 'b.yaml\n');
  expect(invoke().status).toBe(0);
  expect(captured()).toHaveLength(1);
});

it('blocks a missing script dependency before ADB', () => {
  fs.writeFileSync(
    b,
    'appId: com.eten.fluent\ntags: [ordered-readonly]\n---\n- runScript: missing.js\n',
  );
  fs.writeFileSync(list, 'b.yaml\n');
  expect(invoke().status).toBe(2);
  expectNoDevice();
});
it('validates static script existence without executing untrusted script contents', () => {
  fs.writeFileSync(
    path.join(dir, 'untrusted.js'),
    'throw new Error("MUST NOT EXECUTE");',
  );
  fs.writeFileSync(
    b,
    'appId: com.eten.fluent\ntags: [ordered-readonly]\n---\n- runScript: untrusted.js\n',
  );
  fs.writeFileSync(list, 'b.yaml\n');
  expect(invoke().status).toBe(0);
  expect(captured()).toHaveLength(1);
});

it.each([
  'MAESTRO_DISPOSABLE_PROJECT_ID',
  'MAESTRO_INCOMPLETE_USER_ID',
  'MAESTRO_B_ASSIGNMENT_ID',
])('rejects a changed nested context alias %s', key => {
  fs.writeFileSync(
    b,
    `appId: com.eten.fluent\n---\n- runFlow:\n    file: a flow.yaml\n    env:\n      ${key}: 99\n`,
  );
  fs.writeFileSync(list, 'b.yaml\n');
  expect(invoke().status).toBe(2);
  expectNoDevice();
});
it.each([
  '- "runFlow": a flow.yaml',
  '- { runFlow: "a flow.yaml" }',
  '- runFlow: &alias a flow.yaml',
  '- *alias',
  '- tapOn: arbitrary-action',
  '- tapOn: record-start-button',
])('fails closed on unclassified action or dependency syntax: %j', command => {
  fs.writeFileSync(b, `appId: com.eten.fluent\n---\n${command}\n`);
  fs.writeFileSync(list, 'b.yaml\n');
  expect(invoke().status).toBe(2);
  expectNoDevice();
});
it('accepts explicitly reviewed readonly navigation without treating it as fixture mutation', () => {
  fs.writeFileSync(
    b,
    'appId: com.eten.fluent\ntags: [ordered-readonly]\n---\n- tapOn: home-settings-button\n',
  );
  fs.writeFileSync(list, 'b.yaml\n');
  expect(invoke().status).toBe(0);
  expect(captured()).toHaveLength(1);
});

it.each([
  '- runFlow:\n    file: a flow.yaml\n    env:\n      "MAESTRO_B_PROJECT_ID": 99',
  '- runFlow:\n    file: a flow.yaml\n    env: { MAESTRO_B_PROJECT_ID: 99 }',
])('rejects quoted/inline fixture parameter bypasses: %j', command => {
  fs.writeFileSync(b, `appId: com.eten.fluent\n---\n${command}\n`);
  fs.writeFileSync(list, 'b.yaml\n');
  expect(invoke().status).toBe(2);
  expectNoDevice();
});

it('allows readonly absence guards for login/capture without admitting their actions', () => {
  fs.writeFileSync(
    b,
    'appId: com.eten.fluent\n---\n- assertNotVisible:\n    id: login-email-input\n- assertNotVisible:\n    id: record-stop-button\n',
  );
  fs.writeFileSync(list, 'b.yaml\n');
  expect(invoke().status).toBe(0);
  expect(captured()).toHaveLength(1);
});
