/**
 * Exercises useMyWorkChapters through the real getMyWorkChapters query
 * boundary (mock DB execute only). Does not mock getMyWorkChapters itself.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockExecute = jest.fn();

jest.mock('../db/db', () => ({
  getDatabase: () => ({
    execute: mockExecute,
  }),
}));

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => callback(), [callback]);
  },
}));

jest.mock('../services/storage', () => ({
  getActiveUserId: jest.fn(() => '7'),
}));

jest.mock('../services/userOrgGrants', () => ({
  getObserverProjectIds: jest.fn(() => []),
}));

jest.mock('../utils/myWorkDraftDownload', () => ({
  getTranslatorProjectIds: jest.fn(() => []),
}));

jest.mock('../services/sync', () => ({
  refreshChapterMetadataIfOnline: jest.fn(async () => undefined),
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: jest.fn(() => 7),
}));

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

jest.mock('../db/queries', () => {
  const actual = jest.requireActual(
    '../db/queries',
  ) as typeof import('../db/queries');
  const mockConnection = {};
  return {
    ...actual,
    getDatabaseWriteMark: jest.fn(async () => ({
      connection: mockConnection,
      changes: 0,
    })),
  };
});

import { useMyWorkChapters } from './useMyWorkChapters';

describe('useMyWorkChapters query boundary', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  it('surfaces SQL execute failures as error, not an empty success', async () => {
    mockExecute.mockRejectedValue(new Error('disk I/O error'));

    const { result } = renderHook(() => useMyWorkChapters());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.chapters).toEqual([]);
    expect(result.current.reading).toBe(false);
  });

  it('clears error after a successful retry through the same query boundary', async () => {
    mockExecute
      .mockRejectedValueOnce(new Error('disk I/O error'))
      .mockResolvedValueOnce({ rows: [] });

    const { result } = renderHook(() => useMyWorkChapters());

    await waitFor(() => expect(result.current.error).toBe(true));

    await act(async () => {
      await result.current.refresh();
    });

    await waitFor(() => expect(result.current.error).toBe(false));
    expect(result.current.chapters).toEqual([]);
    expect(result.current.reading).toBe(false);
  });
});
