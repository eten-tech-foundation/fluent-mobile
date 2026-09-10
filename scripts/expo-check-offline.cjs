#!/usr/bin/env node
'use strict';

/**
 * Cross-platform offline `expo install --check` (EXPO_OFFLINE=1).
 * Avoids POSIX-only `VAR=value cmd` which fails under Windows cmd.exe.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const expoCli = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo',
  'bin',
  'cli',
);

const result = spawnSync(
  process.execPath,
  [expoCli, 'install', '--check'],
  {
    stdio: 'inherit',
    env: { ...process.env, EXPO_OFFLINE: '1' },
  },
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
