/**
 * Unit tests for Project 4 status option helpers and moveIssueStatus guards.
 */

'use strict';

const {
  DEFAULT_PROJECT_ID,
  STATUS_OPTIONS,
  PRODUCT_OWNED_STATUSES,
  ENG_HANDOFF_FROM,
  optionIdForStatus,
  moveIssueStatus,
} = require('./project-board.cjs');

describe('project-board STATUS_OPTIONS', () => {
  it('includes lifecycle statuses used by agents and CI', () => {
    expect(STATUS_OPTIONS['In Progress (Dev)']).toBe('db53740f');
    expect(STATUS_OPTIONS['In PR Review']).toBe('19224fda');
    expect(STATUS_OPTIONS['In QA']).toBe('bb3c3d02');
    expect(STATUS_OPTIONS.Done).toBe('3c942df6');
  });

  it('resolves option ids by name', () => {
    expect(optionIdForStatus('In QA')).toBe('bb3c3d02');
    expect(optionIdForStatus('nope')).toBeNull();
  });

  it('marks Product columns as owned', () => {
    expect(PRODUCT_OWNED_STATUSES.has('In Progress (Product)')).toBe(true);
    expect(PRODUCT_OWNED_STATUSES.has('In Progress (Dev)')).toBe(false);
  });

  it('allowlists eng handoff from In Progress / In PR Review', () => {
    expect(ENG_HANDOFF_FROM.has('In Progress (Dev)')).toBe(true);
    expect(ENG_HANDOFF_FROM.has('In PR Review')).toBe(true);
    expect(ENG_HANDOFF_FROM.has('Dev Ready')).toBe(false);
  });
});

describe('moveIssueStatus guardrails', () => {
  function createCore() {
    return { info: jest.fn(), warning: jest.fn() };
  }

  function projectItemResponse({ itemId, statusName, projectId = DEFAULT_PROJECT_ID }) {
    return {
      repository: {
        issue: {
          id: 'issue-node-1',
          projectItems: {
            nodes: itemId
              ? [
                  {
                    id: itemId,
                    project: { id: projectId },
                    fieldValueByName: statusName
                      ? { name: statusName }
                      : null,
                  },
                ]
              : [],
          },
        },
      },
    };
  }

  it('refuses Product-owned columns without mutating Status', async () => {
    const graphql = jest.fn().mockResolvedValueOnce(
      projectItemResponse({
        itemId: 'item-1',
        statusName: 'In Progress (Product)',
      }),
    );
    const core = createCore();
    const result = await moveIssueStatus({
      github: { graphql },
      core,
      issueNumber: 1,
      targetStatus: 'Done',
      allowedFrom: ENG_HANDOFF_FROM,
    });
    expect(result).toEqual({
      ok: false,
      reason: 'product_owned',
      from: 'In Progress (Product)',
    });
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it('refuses statuses outside the allowlist without mutating Status', async () => {
    const graphql = jest.fn().mockResolvedValueOnce(
      projectItemResponse({
        itemId: 'item-1',
        statusName: 'Dev Ready',
      }),
    );
    const core = createCore();
    const result = await moveIssueStatus({
      github: { graphql },
      core,
      issueNumber: 2,
      targetStatus: 'Done',
      allowedFrom: ENG_HANDOFF_FROM,
    });
    expect(result).toEqual({
      ok: false,
      reason: 'not_in_allowlist',
      from: 'Dev Ready',
    });
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it('skips issues that are not on Project 4', async () => {
    const graphql = jest.fn().mockResolvedValueOnce(
      projectItemResponse({ itemId: null, statusName: '' }),
    );
    const core = createCore();
    const result = await moveIssueStatus({
      github: { graphql },
      core,
      issueNumber: 3,
      targetStatus: 'Done',
      allowedFrom: ENG_HANDOFF_FROM,
      addIfMissing: false,
    });
    expect(result).toEqual({ ok: false, reason: 'not_on_project' });
    expect(graphql).toHaveBeenCalledTimes(1);
  });
});
