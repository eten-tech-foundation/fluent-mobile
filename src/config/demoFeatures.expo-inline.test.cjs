'use strict';

/**
 * Proves Expo production inlining for demoFeatures — not Jest process.env
 * assignment. babel-preset-expo only replaces static
 * `process.env.EXPO_PUBLIC_*` member access
 * (https://docs.expo.dev/guides/environment-variables/).
 *
 * Lives in .cjs so tsc (jest types only, no @types/node) stays clean.
 */

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const DEMO_ENV_KEY = 'EXPO_PUBLIC_DEMO_PREPARE_OFFLINE_AUTO_PROMPT';
const filename = path.resolve(__dirname, 'demoFeatures.ts');
const source = fs.readFileSync(filename, 'utf8');
const projectRoot = path.resolve(__dirname, '../..');

function transformProduction(code, filenameForTransform) {
  const result = babel.transformSync(code, {
    filename: filenameForTransform,
    babelrc: false,
    configFile: false,
    presets: ['babel-preset-expo'],
    caller: {
      name: 'metro',
      bundler: 'metro',
      platform: 'android',
      isDev: false,
      projectRoot,
    },
  });
  if (!result?.code) {
    throw new Error('Expected babel transform to produce code');
  }
  return result.code;
}

describe('demoFeatures Expo production env inlining', () => {
  afterEach(() => {
    delete process.env[DEMO_ENV_KEY];
  });

  it('inlines the demo flag from static process.env.EXPO_PUBLIC_* getters', () => {
    process.env[DEMO_ENV_KEY] = 'true';
    const code = transformProduction(source, filename);

    expect(code).toMatch(/["']true["']/);
    expect(code).not.toMatch(
      /process\.env\.EXPO_PUBLIC_DEMO_PREPARE_OFFLINE_AUTO_PROMPT/,
    );
    expect(code).not.toMatch(/process\.env\[/);
  });

  it('inlines unset as undefined (default-off) rather than leaving a dynamic lookup', () => {
    delete process.env[DEMO_ENV_KEY];
    const code = transformProduction(source, filename);

    expect(code).toMatch(/\bundefined\b/);
    expect(code).not.toMatch(
      /process\.env\.EXPO_PUBLIC_DEMO_PREPARE_OFFLINE_AUTO_PROMPT/,
    );
    expect(code).not.toMatch(/process\.env\[/);
  });

  it('does not inline computed process.env[key] (Expo docs negative control)', () => {
    process.env[DEMO_ENV_KEY] = '1';
    const computed = `
      const KEY = '${DEMO_ENV_KEY}';
      export function read() {
        return process.env[KEY];
      }
    `;
    const code = transformProduction(
      computed,
      path.resolve(__dirname, 'demoFeatures.computed-control.js'),
    );

    expect(code).toMatch(/process\.env\[/);
    expect(code).not.toMatch(/["']1["']/);
  });
});
