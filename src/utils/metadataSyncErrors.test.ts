const mockGetSyncError = jest.fn();

jest.mock('@op-engineering/op-sqlite', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    getItemSync: jest.fn(() => null),
    setItemSync: jest.fn(),
    removeItemSync: jest.fn(),
  })),
}));

jest.mock('../services/storage', () => {
  const actual = jest.requireActual('../services/storage');
  return {
    ...actual,
    getSyncError: (key: string) => mockGetSyncError(key),
  };
});

import { KV_KEYS } from '../services/storage';
import {
  getFailedMetadataSyncStepLabels,
  hasPersistedMetadataSyncErrors,
  METADATA_SYNC_ERROR_STEPS,
} from './metadataSyncErrors';

describe('metadataSyncErrors', () => {
  beforeEach(() => {
    mockGetSyncError.mockReset();
    mockGetSyncError.mockReturnValue(undefined);
  });

  it('exposes the PR #472 metadata sync_error_* key list', () => {
    expect(METADATA_SYNC_ERROR_STEPS.map(step => step.key)).toEqual([
      KV_KEYS.SYNC_ERROR_USER,
      KV_KEYS.SYNC_ERROR_MASTER_DATA,
      KV_KEYS.SYNC_ERROR_PROJECTS,
      KV_KEYS.SYNC_ERROR_CHAPTER_CLAIMS,
      KV_KEYS.SYNC_ERROR_CHAPTER_ASSIGNMENTS,
      KV_KEYS.SYNC_ERROR_PROJECT_UNITS,
      KV_KEYS.SYNC_ERROR_BIBLE_TEXTS,
      KV_KEYS.SYNC_ERROR_PERICOPE_SETS,
      KV_KEYS.SYNC_ERROR_PERICOPES,
    ]);
  });

  it('returns false when no metadata sync_error_* is set', () => {
    expect(hasPersistedMetadataSyncErrors()).toBe(false);
    expect(getFailedMetadataSyncStepLabels()).toEqual([]);
  });

  it('detects SYNC_ERROR_BIBLE_TEXTS (bulk-text 404 persisted error)', () => {
    mockGetSyncError.mockImplementation((key: string) =>
      key === KV_KEYS.SYNC_ERROR_BIBLE_TEXTS ? 'Not Found' : undefined,
    );

    expect(hasPersistedMetadataSyncErrors()).toBe(true);
    expect(getFailedMetadataSyncStepLabels()).toEqual(['bible texts']);
  });

  it('detects SYNC_ERROR_USER (auth / expired-session failure semantics)', () => {
    mockGetSyncError.mockImplementation((key: string) =>
      key === KV_KEYS.SYNC_ERROR_USER ? 'Unauthorized' : undefined,
    );

    expect(hasPersistedMetadataSyncErrors()).toBe(true);
    expect(getFailedMetadataSyncStepLabels()).toEqual(['user']);
  });

  it('ignores prepare-offline bible-text errors (not in metadata list)', () => {
    mockGetSyncError.mockImplementation((key: string) =>
      key === KV_KEYS.SYNC_ERROR_PREPARE_OFFLINE_BIBLE_TEXTS
        ? 'prepare failed'
        : undefined,
    );

    expect(hasPersistedMetadataSyncErrors()).toBe(false);
  });
});
