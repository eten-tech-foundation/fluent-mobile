import { useEffect } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as syncEvents from '../services/syncEvents';
import { useHomeSyncState } from './useHomeSyncState';

const mockSearchParams: { newUserLoading?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useIsFocused: () => true,
  useLocalSearchParams: () => mockSearchParams,
}));

jest.mock('./usePreferences', () => ({
  usePreferences: () => ({ uploadOverCellular: false }),
}));

const mockHomeFlags = {
  reauthRequired: false,
  hasResolved: true,
  isOnline: true,
  isLinkOnline: true,
  hasPendingUploads: false,
  claimsPending: false,
  advancesPending: false,
  advancesReadFails: false,
};

jest.mock('./useConnectivity', () => ({
  useConnectivity: () => ({
    isOnline: mockHomeFlags.isOnline,
    hasResolved: mockHomeFlags.hasResolved,
    isLinkOnline: mockHomeFlags.isLinkOnline,
    isWifi: true,
    connectionType: 'wifi',
    hasTransferResolved: true,
  }),
}));

jest.mock('./useSync', () => ({
  useSync: () => ({ isSyncing: false, triggerSync: jest.fn() }),
}));

jest.mock('./useSyncStatus', () => ({
  useSyncStatus: () => ({
    status: 'online_synced',
    needsDownloadSync: false,
    isOnline: true,
    failedErrorText: null,
    hasPendingUploads: mockHomeFlags.hasPendingUploads,
  }),
}));

jest.mock('./useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => false,
}));

jest.mock('./useReauthRequired', () => {
  const refreshReauthRequired = jest.fn();
  return {
    useReauthRequired: () => ({
      reauthRequired: mockHomeFlags.reauthRequired,
      refreshReauthRequired,
    }),
  };
});

jest.mock('../services/launchRecoveryGate', () => ({
  launchRecoveryGate: {
    isSettled: () => true,
    whenSettled: () => Promise.resolve(),
  },
}));

jest.mock('../services/storage', () => ({
  getPrepareOfflineDownloadStarted: jest.fn(),
}));

jest.mock('../db/queries', () => ({
  getProjectsWithSummary: jest.fn(),
  isUserAssignedToProject: jest.fn(),
  hasPendingChapterClaimsForUser: () =>
    Promise.resolve(mockHomeFlags.claimsPending),
  hasPendingStageAdvancesForUser: () =>
    mockHomeFlags.advancesReadFails
      ? Promise.reject(new Error('db unavailable'))
      : Promise.resolve(mockHomeFlags.advancesPending),
}));

jest.mock('../utils/parseUserId', () => ({
  parseUserId: () => 1,
}));

describe('useHomeSyncState', () => {
  beforeEach(() => {
    delete mockSearchParams.newUserLoading;
    syncEvents.emitSyncComplete();
    mockHomeFlags.reauthRequired = false;
    mockHomeFlags.hasResolved = true;
    mockHomeFlags.isOnline = true;
    mockHomeFlags.isLinkOnline = true;
    mockHomeFlags.hasPendingUploads = false;
    mockHomeFlags.claimsPending = false;
    mockHomeFlags.advancesPending = false;
    mockHomeFlags.advancesReadFails = false;
  });

  it('bumps the re-read in the render where the post-login sync ends', async () => {
    const commits: { active: boolean; refreshKey: number }[] = [];
    const hook = await renderHook(
      ({ active }: { active: boolean }) => {
        const state = useHomeSyncState({
          postLoginSyncActive: active,
          userSwitchEpoch: 0,
        });
        const { refreshKey } = state;
        useEffect(() => {
          commits.push({ active, refreshKey });
        }, [active, refreshKey]);
        return state;
      },
      { initialProps: { active: true } },
    );
    const before = hook.result.current.refreshKey;

    await hook.rerender({ active: false });

    expect(hook.result.current.refreshKey).toBe(before + 1);
    expect(hook.result.current.showLoading).toBe(false);
    // No commit shows the ended sync with the old key, which would let Home
    // paint the pre-sync (empty) lists for a frame.
    expect(commits.filter(c => !c.active && c.refreshKey === before)).toEqual(
      [],
    );
  });

  it('shows the session banner when online and a claim is waiting', async () => {
    mockHomeFlags.reauthRequired = true;
    mockHomeFlags.claimsPending = true;
    const hook = await renderHook(
      () =>
        useHomeSyncState({ postLoginSyncActive: false, userSwitchEpoch: 0 }),
      { initialProps: undefined },
    );
    await waitFor(() => {
      expect(hook.result.current.showSessionExpiredBanner).toBe(true);
    });
    expect(hook.result.current.signInToSyncLabel).toBe('Sign in to sync');
  });

  it('shows the session banner when online and a stage advance is waiting', async () => {
    mockHomeFlags.reauthRequired = true;
    mockHomeFlags.advancesPending = true;
    const hook = await renderHook(
      () =>
        useHomeSyncState({ postLoginSyncActive: false, userSwitchEpoch: 0 }),
      { initialProps: undefined },
    );
    await waitFor(() => {
      expect(hook.result.current.showSessionExpiredBanner).toBe(true);
    });
  });

  it('keeps a waiting claim visible when the stage-advance read fails', async () => {
    mockHomeFlags.reauthRequired = true;
    mockHomeFlags.claimsPending = true;
    mockHomeFlags.advancesReadFails = true;
    const hook = await renderHook(
      () =>
        useHomeSyncState({ postLoginSyncActive: false, userSwitchEpoch: 0 }),
      { initialProps: undefined },
    );
    await waitFor(() => {
      expect(hook.result.current.showSessionExpiredBanner).toBe(true);
    });
  });

  it('stays quiet while offline, and a Sync tap only counts during reauth', async () => {
    const hook = await renderHook(
      () =>
        useHomeSyncState({ postLoginSyncActive: false, userSwitchEpoch: 0 }),
      { initialProps: undefined },
    );
    hook.result.current.noteSyncOpened();

    mockHomeFlags.reauthRequired = true;
    mockHomeFlags.isOnline = false;
    mockHomeFlags.isLinkOnline = false;
    await hook.rerender(undefined);
    expect(hook.result.current.showSessionExpiredBanner).toBe(false);
    expect(hook.result.current.signInToSyncLabel).toBeNull();

    mockHomeFlags.isOnline = true;
    mockHomeFlags.isLinkOnline = true;
    await hook.rerender(undefined);
    expect(hook.result.current.showSessionExpiredBanner).toBe(false);

    hook.result.current.noteSyncOpened();
    await waitFor(() => {
      expect(hook.result.current.showSessionExpiredBanner).toBe(true);
    });
  });

  it.each([
    ['Fluent is unreachable', { hasResolved: true, isOnline: false }],
    [
      'the first /health answer is pending',
      { hasResolved: false, isOnline: true },
    ],
  ])('stays quiet on a connected link while %s', async (_case, reach) => {
    mockHomeFlags.reauthRequired = true;
    mockHomeFlags.claimsPending = true;
    mockHomeFlags.hasResolved = reach.hasResolved;
    mockHomeFlags.isOnline = reach.isOnline;
    mockHomeFlags.isLinkOnline = true;
    const hook = await renderHook(
      () =>
        useHomeSyncState({ postLoginSyncActive: false, userSwitchEpoch: 0 }),
      { initialProps: undefined },
    );
    hook.result.current.noteSyncOpened();
    // Let the queued-claims read settle so only reachability can hide it.
    await act(async () => {
      await Promise.resolve();
    });
    await hook.rerender(undefined);
    expect(hook.result.current.showSessionExpiredBanner).toBe(false);
    expect(hook.result.current.signInToSyncLabel).toBeNull();

    mockHomeFlags.hasResolved = true;
    mockHomeFlags.isOnline = true;
    await hook.rerender(undefined);
    await waitFor(() => {
      expect(hook.result.current.showSessionExpiredBanner).toBe(true);
    });
    expect(hook.result.current.signInToSyncLabel).toBe('Sign in to sync');
  });

  it('drops the full-screen loader when the first sync ends while a later sync is still running', async () => {
    mockSearchParams.newUserLoading = 'true';
    const hook = await renderHook(
      ({ active }: { active: boolean }) =>
        useHomeSyncState({ postLoginSyncActive: active, userSwitchEpoch: 0 }),
      { initialProps: { active: true } },
    );
    expect(hook.result.current.showLoading).toBe(true);

    await act(async () => {
      syncEvents.emitSyncStart();
    });
    expect(hook.result.current.showLoading).toBe(true);
    expect(hook.result.current.isSyncingChapters).toBe(true);

    await hook.rerender({ active: false });
    await waitFor(() => {
      expect(hook.result.current.showLoading).toBe(false);
    });
    // The route loader is gone; chapter reads still know a sync is in flight.
    expect(hook.result.current.isSyncingChapters).toBe(true);
  });

  it('re-reads lists when an upload session completes, not on progress', async () => {
    const hook = await renderHook(() =>
      useHomeSyncState({ postLoginSyncActive: false, userSwitchEpoch: 0 }),
    );
    const before = hook.result.current.refreshKey;

    await act(async () => {
      syncEvents.emitUploadSessionEvent({ type: 'start', totalChapters: 1 });
      syncEvents.emitUploadSessionEvent({
        type: 'progress',
        completedChapters: 0,
        totalChapters: 1,
      });
    });
    expect(hook.result.current.refreshKey).toBe(before);

    await act(async () => {
      syncEvents.emitUploadSessionEvent({ type: 'complete' });
    });
    expect(hook.result.current.refreshKey).toBe(before + 1);
  });

  it('drops the upload-session subscription when Home unmounts', async () => {
    let subscriptions = 0;
    const unsubscribe = jest.fn(() => {
      subscriptions -= 1;
    });
    const spy = jest
      .spyOn(syncEvents, 'onUploadSessionEvent')
      .mockImplementation(() => {
        subscriptions += 1;
        return unsubscribe;
      });

    const hook = await renderHook(() =>
      useHomeSyncState({ postLoginSyncActive: false, userSwitchEpoch: 0 }),
    );
    expect(spy).toHaveBeenCalled();
    expect(subscriptions).toBeGreaterThan(0);
    await hook.unmount();
    expect(unsubscribe).toHaveBeenCalled();
    expect(subscriptions).toBe(0);

    spy.mockRestore();
  });
});
