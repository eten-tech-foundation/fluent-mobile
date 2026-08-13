'use strict';

const path = require('path');

const {
  detectInstaller,
  enforceNpm,
  envForNpmChild,
  extractUserArgs,
  npmCliBin,
  runForward,
  translateYarnArgs,
} = require('./package-manager.cjs');

const SCRIPTS = new Set(['android', 'lint', 'start', 'test', 'doctor']);

describe('extractUserArgs', () => {
  it('drops node + script path', () => {
    expect(
      extractUserArgs(['node', '/repo/scripts/package-manager.cjs', 'start']),
    ).toEqual(['start']);
  });

  it('drops the script when it is argv0', () => {
    expect(
      extractUserArgs(['/repo/scripts/package-manager.cjs', 'install']),
    ).toEqual(['install']);
  });

  it('normalizes Windows script paths', () => {
    expect(
      extractUserArgs([
        'node.exe',
        'C:\\repo\\scripts\\package-manager.cjs',
        'android',
      ]),
    ).toEqual(['android']);
  });
});

describe('translateYarnArgs', () => {
  it('maps bare yarn to npm install', () => {
    expect(translateYarnArgs([], SCRIPTS)).toEqual({
      kind: 'npm',
      args: ['install'],
    });
  });

  it('maps install and add/remove', () => {
    expect(translateYarnArgs(['install'], SCRIPTS)).toEqual({
      kind: 'npm',
      args: ['install'],
    });
    expect(translateYarnArgs(['add', 'left-pad'], SCRIPTS)).toEqual({
      kind: 'npm',
      args: ['install', 'left-pad'],
    });
    expect(translateYarnArgs(['remove', 'left-pad'], SCRIPTS)).toEqual({
      kind: 'npm',
      args: ['uninstall', 'left-pad'],
    });
  });

  it('maps frozen install to npm ci', () => {
    expect(
      translateYarnArgs(['install', '--frozen-lockfile'], SCRIPTS),
    ).toEqual({
      kind: 'npm',
      args: ['ci'],
    });
    expect(translateYarnArgs(['install', '--immutable'], SCRIPTS)).toEqual({
      kind: 'npm',
      args: ['ci'],
    });
  });

  it('maps start/test and package scripts', () => {
    expect(translateYarnArgs(['start'], SCRIPTS)).toEqual({
      kind: 'npm',
      args: ['start'],
    });
    expect(translateYarnArgs(['test', '--ci'], SCRIPTS)).toEqual({
      kind: 'npm',
      args: ['test', '--', '--ci'],
    });
    expect(translateYarnArgs(['android'], SCRIPTS)).toEqual({
      kind: 'npm',
      args: ['run', 'android'],
    });
    expect(translateYarnArgs(['run', 'lint'], SCRIPTS)).toEqual({
      kind: 'npm',
      args: ['run', 'lint'],
    });
  });

  it('passes extra script args through npm --', () => {
    expect(translateYarnArgs(['android', '--device'], SCRIPTS)).toEqual({
      kind: 'npm',
      args: ['run', 'android', '--', '--device'],
    });
    expect(translateYarnArgs(['start', '--offline'], SCRIPTS)).toEqual({
      kind: 'npm',
      args: ['start', '--', '--offline'],
    });
    expect(
      translateYarnArgs(['run', 'android', '--', '--device'], SCRIPTS),
    ).toEqual({
      kind: 'npm',
      args: ['run', 'android', '--', '--device'],
    });
  });

  it('maps dlx to npx and why to npm explain', () => {
    expect(translateYarnArgs(['dlx', 'expo-doctor'], SCRIPTS)).toEqual({
      kind: 'npx',
      args: ['expo-doctor'],
    });
    expect(translateYarnArgs(['why', 'react'], SCRIPTS)).toEqual({
      kind: 'npm',
      args: ['explain', 'react'],
    });
  });

  it('treats help and version as meta commands', () => {
    expect(translateYarnArgs(['--help'], SCRIPTS)).toEqual({ kind: 'help' });
    expect(translateYarnArgs(['-v'], SCRIPTS)).toEqual({ kind: 'version' });
  });
});

describe('detectInstaller / enforceNpm', () => {
  let errorSpy;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('allows npm user agents', () => {
    expect(
      detectInstaller({ npm_config_user_agent: 'npm/10.9.8 node/24.14.0' }),
    ).toBe('npm');
    expect(
      enforceNpm({ npm_config_user_agent: 'npm/10.9.8 node/24.14.0' }),
    ).toBe(0);
  });

  it('does not treat Yarn in the exec path as the installer', () => {
    expect(
      detectInstaller({
        npm_config_user_agent: 'npm/10.9.8 node/24.14.0',
        npm_execpath: String.raw`C:\Users\yarn\AppData\Local\Yarn\npm.cmd`,
      }),
    ).toBe('npm');
  });

  it('blocks yarn, pnpm, and bun from the user-agent prefix', () => {
    expect(
      detectInstaller({ npm_config_user_agent: 'yarn/1.22.22 npm/? node/v24' }),
    ).toBe('yarn');
    expect(
      detectInstaller({ npm_config_user_agent: 'pnpm/9.0.0 npm/? node/v24' }),
    ).toBe('pnpm');
    expect(enforceNpm({ npm_config_user_agent: 'yarn/1.22.22' })).toBe(1);
    expect(enforceNpm({ npm_config_user_agent: 'pnpm/9.0.0' })).toBe(1);
    expect(enforceNpm({ npm_config_user_agent: 'bun/1.0.0' })).toBe(1);
  });
});

describe('envForNpmChild / npmCliBin / runForward', () => {
  it('strips YARN_IGNORE_PATH so nested yarn can still hit the shim', () => {
    expect(envForNpmChild({ YARN_IGNORE_PATH: '1', PATH: '/usr/bin' })).toEqual(
      { PATH: '/usr/bin' },
    );
  });

  it('uses npm.cmd on Windows without a shell', () => {
    expect(npmCliBin('npm', 'win32')).toBe('npm.cmd');
    expect(npmCliBin('npx', 'win32')).toBe('npx.cmd');
    expect(npmCliBin('npm', 'darwin')).toBe('npm');
  });

  it('forwards yarn start to npm start and passes a cleaned env', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const spawn = jest.fn(() => ({ status: 0 }));
    const status = runForward(['start'], {
      cwd: path.join(__dirname, '..'),
      spawn,
      platform: 'darwin',
      env: { YARN_IGNORE_PATH: '1', PATH: '/usr/bin' },
    });
    expect(status).toBe(0);
    expect(spawn).toHaveBeenCalledWith(
      'npm',
      ['start'],
      expect.objectContaining({
        env: { PATH: '/usr/bin' },
      }),
    );
    expect(spawn.mock.calls[0][2].shell).toBeUndefined();
    errorSpy.mockRestore();
  });
});

describe('loadScriptNames (repo package.json)', () => {
  const { loadScriptNames } = require('./package-manager.cjs');
  const root = path.join(__dirname, '..');

  it('reads android and start scripts', () => {
    const names = loadScriptNames(root);
    expect(names.has('android')).toBe(true);
    expect(names.has('start')).toBe(true);
  });
});
