import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { parseUserId } from '../utils/parseUserId';
import { usePreferences } from './usePreferences';
import { useConnectivity } from './useConnectivity';
import { useSync } from './useSync';
import { useSyncStatus } from './useSyncStatus';
import { useGlobalSyncStatus } from './useGlobalSyncStatus';
import { useReauthRequired } from './useReauthRequired';
import { launchRecoveryGate } from '../services/launchRecoveryGate';
import { onSyncComplete, onSyncStart } from '../services/syncEvents';
import { getPrepareOfflineDownloadStarted } from '../services/storage';
import { isEffectivelyOnlineForTransfer } from '../utils/transportPolicy';
import { createPrepareOfflineAutoPromptController } from '../utils/prepareOfflineAutoPrompt';
import { getProjectsWithSummary, isUserAssignedToProject } from '../db/queries';
import { hrefs } from '../navigation/hrefs';
import { parseOptionalBoolean } from '../navigation/routeParams';
import type { SyncStatus } from '../utils/syncStatusState';

export interface HomeSyncState {
  /** Bumps whenever the chapter lists should re-read the DB. */
  refreshKey: number;
  /** Full-screen "Syncing" after sign-in or adding an account. */
  showLoading: boolean;
  isSyncingChapters: boolean;
  syncStatus: SyncStatus;
  failedErrorText: string | null;
  reauthRequired: boolean;
}

/**
 * Home's sync and session behavior, shared by Legacy and Next Home: the
 * loading state after sign-in or adding an account, the download-repair sync,
 * the Prepare for offline auto-prompt and the reauth banner.
 */
export function useHomeSyncState({
  postLoginSyncActive,
  userSwitchEpoch,
}: {
  postLoginSyncActive: boolean;
  userSwitchEpoch: number;
}): HomeSyncState {
  const router = useRouter();
  const params = useLocalSearchParams<{ newUserLoading?: string }>();
  const [refreshKey, setRefreshKey] = useState(0);
  const [isNewUserLoading, setIsNewUserLoading] = useState(
    () => parseOptionalBoolean(params.newUserLoading) === true,
  );
  const [isSyncingLocal, setIsSyncingLocal] = useState(false);
  const { isLinkOnline, isWifi, connectionType, hasTransferResolved } =
    useConnectivity();
  const { uploadOverCellular } = usePreferences();
  const isFocused = useIsFocused();

  const isWifiRef = useRef(isWifi);
  const isLinkOnlineRef = useRef(isLinkOnline);
  const wasEligibleRef = useRef(false);
  const isFocusedRef = useRef(isFocused);
  const connectionTypeRef = useRef(connectionType);
  const hasTransferResolvedRef = useRef(hasTransferResolved);
  const uploadOverCellularRef = useRef(uploadOverCellular);
  const isSettlingRef = useRef(false);
  const routerRef = useRef(router);
  const appStateRef = useRef(AppState.currentState);

  const autoPromptRef = useRef<ReturnType<
    typeof createPrepareOfflineAutoPromptController
  > | null>(null);
  if (autoPromptRef.current === null) {
    autoPromptRef.current = createPrepareOfflineAutoPromptController({
      isFocused: () => isFocusedRef.current,
      hasTransferResolved: () => hasTransferResolvedRef.current,
      // Hold the auto-prompt while the launch recovery prompt is unanswered (#567).
      isSettling: () =>
        isSettlingRef.current || !launchRecoveryGate.isSettled(),
      getTransport: () => ({
        isOnline: isLinkOnlineRef.current,
        isWifi: isWifiRef.current,
        uploadOverCellular: uploadOverCellularRef.current,
        connectionType: connectionTypeRef.current,
      }),
      getUserId: () => parseUserId(),
      getProjects: async userId => {
        const projects = await getProjectsWithSummary(userId, {
          throwOnError: true,
        });
        return projects.map(project => ({
          id: project.id,
          name: project.name,
          connectivityProfile: project.connectivityProfile ?? null,
        }));
      },
      isAssigned: isUserAssignedToProject,
      hasDownloadStarted: getPrepareOfflineDownloadStarted,
      present: project => {
        routerRef.current.push(
          hrefs.prepareForOffline({
            projectId: project.id,
            projectName: project.name,
          }),
        );
      },
    });
  }
  const autoPrompt = autoPromptRef.current;

  useEffect(() => {
    isWifiRef.current = isWifi;
    isLinkOnlineRef.current = isLinkOnline;
    connectionTypeRef.current = connectionType;
    uploadOverCellularRef.current = uploadOverCellular;
    isFocusedRef.current = isFocused;
    hasTransferResolvedRef.current = hasTransferResolved;
    routerRef.current = router;
  }, [
    isLinkOnline,
    isWifi,
    connectionType,
    uploadOverCellular,
    isFocused,
    hasTransferResolved,
    router,
  ]);

  const handleSyncComplete = useCallback(() => {
    setIsNewUserLoading(false);
    setIsSyncingLocal(false);
    autoPrompt.request();
  }, [autoPrompt]);

  const isSyncingGlobal = useGlobalSyncStatus(() => {
    setIsNewUserLoading(false);
    setRefreshKey(key => key + 1);
    autoPrompt.request();
  });
  const { isSyncing, triggerSync } = useSync({
    onSyncComplete: handleSyncComplete,
  });

  const {
    status: syncStatus,
    needsDownloadSync,
    isOnline: syncIsOnline,
    failedErrorText,
  } = useSyncStatus({
    isSyncing: isSyncing || isSyncingGlobal,
    refreshKey,
  });

  const autoRepairSyncAttempted = useRef(false);

  const isSettling =
    isNewUserLoading || postLoginSyncActive || isSyncingLocal || isSyncing;
  // Keep settling readable at evaluate time (not only after a later effect).
  isSettlingRef.current = isSettling;

  useEffect(() => {
    autoPrompt.notifySettlingChanged();
  }, [isSettling, autoPrompt]);

  useEffect(() => {
    const unsubscribeComplete = onSyncComplete(() => {
      setIsNewUserLoading(false);
      setIsSyncingLocal(false);
      setRefreshKey(key => key + 1);
      autoPrompt.request();
    });
    const unsubscribeStart = onSyncStart(() => {
      setIsSyncingLocal(true);
    });

    return () => {
      unsubscribeComplete();
      unsubscribeStart();
    };
  }, [autoPrompt]);

  // Tier 1 clears postLoginSyncActive while Tier 2 keeps emitSyncStart active.
  // Drop route newUserLoading + bump refreshKey so Home is interactive; header
  // sync chrome still shows (#670).
  const wasPostLoginSyncActiveRef = useRef(false);
  useEffect(() => {
    if (wasPostLoginSyncActiveRef.current && !postLoginSyncActive) {
      setIsNewUserLoading(false);
      setRefreshKey(key => key + 1);
    }
    wasPostLoginSyncActiveRef.current = postLoginSyncActive;
  }, [postLoginSyncActive]);

  useEffect(() => {
    if (
      !needsDownloadSync ||
      !syncIsOnline ||
      isSyncing ||
      postLoginSyncActive ||
      isNewUserLoading ||
      autoRepairSyncAttempted.current
    ) {
      return;
    }

    autoRepairSyncAttempted.current = true;
    void triggerSync();
  }, [
    needsDownloadSync,
    syncIsOnline,
    isSyncing,
    postLoginSyncActive,
    isNewUserLoading,
    triggerSync,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'active' && previousState !== 'active') {
        autoPrompt.resetShownThisAppOpen();
        autoPrompt.request();
      }
    });

    if (AppState.currentState === 'active') {
      autoPrompt.request();
    }

    return () => subscription.remove();
  }, [autoPrompt]);

  // Discard / nothing to recover: the gate settles while Home is focused, so
  // Prepare for Offline may present immediately. Resume: the gate settles after
  // the redirect to the Record tab, Home is blurred, evaluate bails on focus,
  // and the eligibility effect below re-runs it when the user returns (#567).
  useEffect(() => {
    let cancelled = false;
    void launchRecoveryGate.whenSettled().then(() => {
      if (!cancelled) {
        autoPrompt.request();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [autoPrompt]);

  useEffect(() => {
    if (!hasTransferResolved) return;
    const eligibleConnection =
      hasTransferResolved &&
      isEffectivelyOnlineForTransfer({
        isOnline: isLinkOnline,
        isWifi,
        uploadOverCellular,
        connectionType,
      });

    if (!isFocused) {
      wasEligibleRef.current = false;
      return;
    }

    const wasEligible = wasEligibleRef.current;
    wasEligibleRef.current = eligibleConnection;
    if (eligibleConnection && !wasEligible) {
      autoPrompt.request();
    }
  }, [
    isLinkOnline,
    isWifi,
    connectionType,
    uploadOverCellular,
    isFocused,
    hasTransferResolved,
    autoPrompt,
  ]);

  const { reauthRequired, refreshReauthRequired } = useReauthRequired({
    refreshOnFocus: true,
  });

  useEffect(() => {
    autoRepairSyncAttempted.current = false;
    refreshReauthRequired();
    setRefreshKey(key => key + 1);
  }, [userSwitchEpoch, refreshReauthRequired]);

  const showLoading =
    isNewUserLoading ||
    postLoginSyncActive ||
    ((isSyncingLocal || isSyncing) && refreshKey === 0);
  const isSyncingChapters =
    isSyncing || isSyncingLocal || postLoginSyncActive || isNewUserLoading;

  return {
    refreshKey,
    showLoading,
    isSyncingChapters,
    syncStatus,
    failedErrorText,
    reauthRequired,
  };
}
