const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  assertOrderedArgs,
  readFlowList,
  renderJourney,
  writeJourney,
} = require('./maestro-journey.cjs');

const cli = path.join(__dirname, 'maestro-journey.cjs');
let dir, list, a, b, out;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluent-journey-'));
  fs.mkdirSync(path.join(dir, 'nested'));
  a = path.join(dir, 'a flow.yaml');
  b = path.join(dir, 'nested', 'b.yml');
  fs.writeFileSync(a, 'appId: com.eten.fluent\n---\n- assertTrue: true\n');
  fs.writeFileSync(b, 'appId: com.eten.fluent\n---\n- assertTrue: true\n');
  list = path.join(dir, 'ordered.txt');
  out = path.join(dir, 'out');
  fs.mkdirSync(out);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('readFlowList', () => {
  it('resolves entries relative to the list file, skipping blanks and comments', () => {
    fs.writeFileSync(list, '# order\n  nested/b.yml  \n\r\na flow.yaml\n');
    expect(readFlowList(list)).toEqual([b, a]);
  });

  it.each([
    ['empty', '# only a comment\n\n', /flow list is empty/],
    ['duplicate', 'a flow.yaml\n./a flow.yaml\n', /duplicate flow list entry/],
    ['non-YAML', 'ordered.txt\n', /must be existing YAML files/],
    ['missing', 'missing.yaml\n', /ENOENT/],
  ])('rejects a %s list', (_name, content, message) => {
    fs.writeFileSync(list, content);
    expect(() => readFlowList(list)).toThrow(message);
  });

  it('rejects a YAML-named directory', () => {
    fs.mkdirSync(path.join(dir, 'dir.yaml'));
    fs.writeFileSync(list, 'dir.yaml\n');
    expect(() => readFlowList(list)).toThrow(/must be existing YAML files/);
  });
});

describe('assertOrderedArgs', () => {
  it.each([
    [['--include-tags', 'smoke']],
    [['--exclude-tags=mutating']],
    [['--device', 'emulator-5556']],
    [['--platform', 'android']],
    [['-p', 'android']],
    [['--shard-split', '2']],
    [['--shard-all=2']],
  ])('refuses guard-changing option %j', args => {
    expect(() => assertOrderedArgs(args)).toThrow(/refuse tag filters/);
  });

  it('refuses positional flow paths', () => {
    expect(() => assertOrderedArgs(['--config', 'c.yaml', 'x.yaml'])).toThrow(
      /cannot be combined with positional flow paths/,
    );
  });

  it('allows env and output options', () => {
    expect(() =>
      assertOrderedArgs([
        '--config',
        '.maestro/config.yaml',
        '-e',
        'MARKER=literal value',
        '--test-output-dir',
        '/tmp/out',
      ]),
    ).not.toThrow();
  });
});

describe('renderJourney / writeJourney', () => {
  it('renders one parent with JSON-quoted runFlow children in order', () => {
    expect(renderJourney([b, a])).toBe(
      'appId: com.eten.fluent\nname: Ordered Fluent journey\n---\n' +
        `- runFlow: ${JSON.stringify(b)}\n- runFlow: ${JSON.stringify(a)}\n`,
    );
  });

  it('writes paths.txt and journey.yaml', () => {
    fs.writeFileSync(list, 'nested/b.yml\na flow.yaml\n');
    expect(writeJourney({ listFile: list, destination: out })).toEqual([b, a]);
    expect(fs.readFileSync(path.join(out, 'paths.txt'), 'utf8')).toBe(
      `${b}\n${a}\n`,
    );
    expect(fs.readFileSync(path.join(out, 'journey.yaml'), 'utf8')).toBe(
      renderJourney([b, a]),
    );
  });

  it('checks args before reading the list', () => {
    expect(() =>
      writeJourney({
        listFile: path.join(dir, 'missing.txt'),
        destination: out,
        args: ['--include-tags', 'smoke'],
      }),
    ).toThrow(/refuse tag filters/);
    expect(fs.readdirSync(out)).toEqual([]);
  });
});

describe('CLI', () => {
  function run(args) {
    return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  }

  it('exits 0 and writes the journey', () => {
    fs.writeFileSync(list, 'a flow.yaml\n');
    const result = run([list, out, '-e', 'MARKER=1']);
    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(out, 'journey.yaml'), 'utf8')).toBe(
      renderJourney([a]),
    );
  });

  it('exits 2 with an error line and writes nothing on refusal', () => {
    fs.writeFileSync(list, 'a flow.yaml\na flow.yaml\n');
    const result = run([list, out]);
    expect(result.status).toBe(2);
    expect(result.stderr).toBe('error: duplicate flow list entry\n');
    expect(fs.readdirSync(out)).toEqual([]);
  });
});
