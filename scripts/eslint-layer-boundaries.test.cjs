'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const fixturesDir = path.join(
  repoRoot,
  'src/app/__fixtures__/eslint-layer-boundaries',
);

const cases = [
  {
    file: 'forbidden-fetch.tsx',
    expectMessages: [/must not call fetch\(\)/i],
  },
  {
    file: 'forbidden-sql.tsx',
    expectMessages: [
      /must not import the DB singleton/i,
      /must not call getDatabase\(\)/i,
      /must not call executeSql/i,
    ],
  },
  {
    file: 'forbidden-react-navigation.tsx',
    expectMessages: [/@react-navigation/i],
  },
];

function runEslint(filePath) {
  return spawnSync(
    process.execPath,
    [
      path.join(repoRoot, 'node_modules/eslint/bin/eslint.js'),
      '--no-ignore',
      filePath,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: process.env,
    },
  );
}

describe('ESLint layer-boundary rules (#366)', () => {
  for (const { file, expectMessages } of cases) {
    it(`fails on ${file}`, () => {
      const filePath = path.join(fixturesDir, file);
      const result = runEslint(filePath);
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).not.toBe(0);
      for (const expectMessage of expectMessages) {
        expect(output).toMatch(expectMessage);
      }
    });
  }
});
