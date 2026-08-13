#!/usr/bin/env node
'use strict';

/**
 * npm-only guard + Yarn CLI shim.
 *
 * - `node scripts/package-manager.cjs --enforce` (preinstall): block yarn/pnpm/bun installs.
 * - Yarn Classic `yarn-path` / Berry `yarnPath`: forward `yarn …` to npm so muscle
 *   memory does not write yarn.lock / PnP files (those break Expo).
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const NPM_ONLY_HINT = `This repo uses npm only (package-lock.json). Yarn PnP breaks Expo.

  yarn                 →  npm install
  yarn install         →  npm install
  yarn add <pkg>       →  npm install <pkg>   (Expo modules: npx expo install <pkg>)
  yarn remove <pkg>    →  npm uninstall <pkg>
  yarn start           →  npm start
  yarn android         →  npm run android
  yarn test            →  npm test

See README.md troubleshooting.`;

const NPM_BINS = new Set([
  'audit',
  'bin',
  'cache',
  'ci',
  'config',
  'exec',
  'explain',
  'fund',
  'help',
  'link',
  'outdated',
  'pack',
  'publish',
  'restart',
  'root',
  'start',
  'stop',
  'test',
  'unlink',
  'version',
]);

/**
 * @param {string} cwd
 * @returns {Set<string>}
 */
function loadScriptNames(cwd) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'),
    );
    return new Set(Object.keys(pkg.scripts || {}));
  } catch {
    return new Set();
  }
}

/**
 * npm run / start / test treat flags after the command as npm's own unless `--`
 * separates them. Yarn forwarded extra args to the script. Do not double `--`.
 * @param {string[]} extra
 * @returns {string[]}
 */
function withNpmScriptPassthrough(extra) {
  if (extra.length === 0) {
    return [];
  }
  if (extra[0] === '--') {
    return extra;
  }
  return ['--', ...extra];
}

const FROZEN_INSTALL_FLAGS = new Set(['--frozen-lockfile', '--immutable']);
const NPM_CI_PASSTHROUGH_FLAGS = new Set(['--ignore-scripts']);

/**
 * @param {string[]} yarnArgs
 * @param {Set<string>} scriptNames
 * @returns {{ kind: 'npm', args: string[] } | { kind: 'npx', args: string[] } | { kind: 'help' } | { kind: 'version' } | { kind: 'reject', message: string }}
 */
function translateYarnArgs(yarnArgs, scriptNames) {
  const args = yarnArgs.filter(a => a !== '');
  if (args.length === 0) {
    return { kind: 'npm', args: ['install'] };
  }

  const first = args[0];
  if (first === '--help' || first === '-h' || first === 'help') {
    return { kind: 'help' };
  }
  if (first === '--version' || first === '-v' || first === '-V') {
    return { kind: 'version' };
  }

  if (first.startsWith('-')) {
    return translateYarnArgs(['install', ...args], scriptNames);
  }

  const rest = args.slice(1);

  if (first === 'install' || first === 'i') {
    const frozen = rest.some(a => FROZEN_INSTALL_FLAGS.has(a));
    if (frozen) {
      const ciArgs = ['ci'];
      const unsupported = [];
      for (const flag of rest) {
        if (FROZEN_INSTALL_FLAGS.has(flag)) {
          continue;
        }
        if (NPM_CI_PASSTHROUGH_FLAGS.has(flag)) {
          ciArgs.push(flag);
          continue;
        }
        unsupported.push(flag);
      }
      if (unsupported.length > 0) {
        return {
          kind: 'reject',
          message: `Unsupported Yarn install flags for npm ci: ${unsupported.join(
            ' ',
          )}`,
        };
      }
      return { kind: 'npm', args: ciArgs };
    }
    return { kind: 'npm', args: ['install', ...rest] };
  }

  if (first === 'add') {
    return { kind: 'npm', args: ['install', ...rest] };
  }
  if (first === 'remove' || first === 'uninstall') {
    return { kind: 'npm', args: ['uninstall', ...rest] };
  }
  if (first === 'run' || first === 'run-script') {
    if (rest.length === 0) {
      return { kind: 'npm', args: ['run'] };
    }
    return {
      kind: 'npm',
      args: ['run', rest[0], ...withNpmScriptPassthrough(rest.slice(1))],
    };
  }
  if (first === 'dlx') {
    return { kind: 'npx', args: rest };
  }
  if (first === 'why') {
    return { kind: 'npm', args: ['explain', ...rest] };
  }
  if (first === 'upgrade' || first === 'upgrade-interactive') {
    return { kind: 'npm', args: ['update', ...rest] };
  }

  if (first === 'start' || first === 'test') {
    return { kind: 'npm', args: [first, ...withNpmScriptPassthrough(rest)] };
  }
  if (scriptNames.has(first)) {
    return {
      kind: 'npm',
      args: ['run', first, ...withNpmScriptPassthrough(rest)],
    };
  }
  if (NPM_BINS.has(first)) {
    return { kind: 'npm', args: [first, ...rest] };
  }

  return {
    kind: 'npm',
    args: ['run', first, ...withNpmScriptPassthrough(rest)],
  };
}

/**
 * First token of npm_config_user_agent (same idea as only-allow / which-pm-runs).
 * Do not substring-match npm_execpath — paths like `…/Yarn/…/npm.cmd` are still npm.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'npm' | 'yarn' | 'pnpm' | 'bun' | 'unknown'}
 */
function detectInstaller(env = process.env) {
  const ua = String(env.npm_config_user_agent || '').trim();
  if (ua) {
    const name = ua.split(/\s+/)[0].split('/')[0].toLowerCase();
    if (
      name === 'yarn' ||
      name === 'pnpm' ||
      name === 'bun' ||
      name === 'npm'
    ) {
      return name;
    }
  }

  const execBase = path.basename(String(env.npm_execpath || '')).toLowerCase();
  if (
    execBase === 'npm' ||
    execBase === 'npm.cmd' ||
    execBase === 'npm-cli.js'
  ) {
    return 'npm';
  }
  if (
    execBase === 'yarn' ||
    execBase === 'yarn.cmd' ||
    execBase === 'yarn.js' ||
    execBase === 'yarn.cjs'
  ) {
    return 'yarn';
  }
  if (
    execBase === 'pnpm' ||
    execBase === 'pnpm.cmd' ||
    execBase === 'pnpm.cjs'
  ) {
    return 'pnpm';
  }
  if (execBase === 'bun' || execBase === 'bun.exe') {
    return 'bun';
  }
  return 'unknown';
}

/**
 * Yarn sets YARN_IGNORE_PATH so yarn-path does not recurse. Do not leak that
 * into npm children — nested `yarn` would skip this repo's shim.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {NodeJS.ProcessEnv}
 */
function envForNpmChild(env = process.env) {
  const childEnv = { ...env };
  delete childEnv.YARN_IGNORE_PATH;
  return childEnv;
}

/**
 * @param {'npm' | 'npx'} bin
 * @param {string} platform
 * @returns {string}
 */
function npmCliBin(bin, platform) {
  if (platform === 'win32') {
    return bin === 'npx' ? 'npx.cmd' : 'npm.cmd';
  }
  return bin;
}

/**
 * Quote one argv token for cmd.exe so metacharacters cannot break out of the
 * argument. Used only inside a single /s /c command string.
 * @param {string} arg
 * @returns {string}
 */
function quoteForCmd(arg) {
  const value = String(arg);
  if (value.length === 0) {
    return '""';
  }
  if (!/[\s"&|<>^()%!@]/.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Spawn npm/npx without `shell: true`. On Windows, `.cmd` shims must go through
 * cmd.exe; `/d /s /c` plus windowsVerbatimArguments keeps argv boundaries.
 * @param {typeof spawnSync} spawn
 * @param {'npm' | 'npx'} bin
 * @param {string[]} args
 * @param {object} options
 * @param {string} platform
 */
function spawnNpmCli(spawn, bin, args, options, platform) {
  const file = npmCliBin(bin, platform);
  if (platform !== 'win32') {
    return spawn(file, args, { ...options, shell: false });
  }
  const comspec = options.env?.ComSpec || process.env.ComSpec || 'cmd.exe';
  const commandLine = [file, ...args].map(quoteForCmd).join(' ');
  return spawn(comspec, ['/d', '/s', '/c', `"${commandLine}"`], {
    ...options,
    shell: false,
    windowsVerbatimArguments: true,
  });
}

/**
 * Yarn may exec this file with node (`argv[1]` is this script) or as the
 * executable (`argv[0]` is this script).
 * @param {string[]} argv
 * @returns {string[]}
 */
function extractUserArgs(argv) {
  const marker = 'package-manager.cjs';
  const idx = argv.findIndex(a =>
    String(a).replace(/\\/g, '/').endsWith(marker),
  );
  if (idx >= 0) {
    return argv.slice(idx + 1);
  }
  return argv.slice(1);
}

function enforceNpm(env = process.env) {
  const installer = detectInstaller(env);
  if (installer === 'npm') {
    return 0;
  }
  console.error(`\n${NPM_ONLY_HINT}\n`);
  console.error(`Blocked: ${installer} install. Use npm.\n`);
  return 1;
}

function runForward(yarnArgs, options = {}) {
  const {
    cwd = process.cwd(),
    spawn = spawnSync,
    platform = process.platform,
    env = process.env,
  } = options;
  const scriptNames = loadScriptNames(cwd);
  const translated = translateYarnArgs(yarnArgs, scriptNames);
  const childEnv = envForNpmChild(env);

  if (translated.kind === 'help') {
    console.error(NPM_ONLY_HINT);
    return 0;
  }
  if (translated.kind === 'reject') {
    console.error(`\n${NPM_ONLY_HINT}\n`);
    console.error(`${translated.message}\n`);
    return 1;
  }
  if (translated.kind === 'version') {
    const result = spawnNpmCli(
      spawn,
      'npm',
      ['--version'],
      {
        encoding: 'utf8',
        cwd,
        env: childEnv,
      },
      platform,
    );
    const version = String(result.stdout || '').trim();
    if (version) {
      console.log(version);
    }
    console.error('[fluent-mobile] npm-only shim (not Yarn). Use npm.');
    return result.status ?? 0;
  }

  const bin = translated.kind === 'npx' ? 'npx' : 'npm';
  const args = translated.args;
  console.error(`[fluent-mobile] npm-only — running: ${bin} ${args.join(' ')}`);
  const result = spawnNpmCli(
    spawn,
    bin,
    args,
    {
      stdio: 'inherit',
      cwd,
      env: childEnv,
    },
    platform,
  );
  return result.status ?? 1;
}

function main(argv = process.argv, env = process.env) {
  const userArgs = extractUserArgs(argv);
  if (userArgs[0] === '--enforce') {
    return enforceNpm(env);
  }
  return runForward(userArgs);
}

module.exports = {
  NPM_ONLY_HINT,
  detectInstaller,
  enforceNpm,
  envForNpmChild,
  extractUserArgs,
  loadScriptNames,
  main,
  npmCliBin,
  runForward,
  translateYarnArgs,
};

if (require.main === module) {
  process.exit(main(process.argv));
}
