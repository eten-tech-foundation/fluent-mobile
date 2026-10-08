/**
 * Unit tests for project-board-cli argument parsing.
 */

'use strict';

const { parseArgs, allowlistForTarget } = require('./project-board-cli.cjs');

describe('project-board-cli parseArgs', () => {
  it('parses set-status with issue and target', () => {
    expect(
      parseArgs([
        'set-status',
        '--issue',
        '588',
        '--to',
        'In Progress (Dev)',
      ]),
    ).toEqual({
      command: 'set-status',
      issue: 588,
      to: 'In Progress (Dev)',
      strict: false,
      allowProductOwned: false,
    });
  });

  it('parses --allow-product-owned and --strict', () => {
    expect(
      parseArgs([
        'set-status',
        '--issue',
        '588',
        '--to',
        'In PR Review',
        '--allow-product-owned',
        '--strict',
      ]),
    ).toEqual({
      command: 'set-status',
      issue: 588,
      to: 'In PR Review',
      strict: true,
      allowProductOwned: true,
    });
  });

  it('rejects unknown flags', () => {
    expect(() => parseArgs(['set-status', '--force'])).toThrow(/Unknown/);
  });
});

describe('project-board-cli allowlistForTarget', () => {
  it('returns allowlists for eng presets', () => {
    expect(allowlistForTarget('In Progress (Dev)').has('Dev Ready')).toBe(true);
    expect(allowlistForTarget('In PR Review').has('In Progress (Dev)')).toBe(
      true,
    );
    expect(allowlistForTarget('In PR Review').has('In QA')).toBe(false);
    expect(allowlistForTarget('Done')).toBeNull();
  });
});
