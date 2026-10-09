import { useState, useCallback, useEffect, useRef } from 'react';
import {
  AppState,
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
} from 'react-native';
import {
  useLocalSearchParams,
  useNavigation,
  useRouter,
  useIsFocused,
} from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../theme';
import { parseUserId } from '../../utils/parseUserId';
import { usePreferences } from '../../hooks/usePreferences';
import { useConnectivity } from '../../hooks/useConnectivity';
import { PageHeader } from '../../components/layout/PageHeader';
import { SettingsButton } from '../../components/ui/SettingsButton';
import { PageHeaderSyncButton } from '../../components/ui/PageHeaderSyncButton';
import { TabBar, HomeTab } from '../../components/layout/TabBar';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { MyWorkTab } from '../tabs/MyWorkTab';
import { ProjectsTab } from '../tabs/ProjectsTab';
import { useSync } from '../../hooks/useSync';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { useGlobalSyncStatus } from '../../hooks/useGlobalSyncStatus';
import { onSyncComplete, onSyncStart } from '../../services/syncEvents';
import { getPrepareOfflineDownloadStarted } from '../../services/storage';
import { isEffectivelyOnlineForTransfer } from '../../utils/transportPolicy';
import { createPrepareOfflineAutoPromptController } from '../../utils/prepareOfflineAutoPrompt';
import {
  getProjectsWithSummary,
  isUserAssignedToProject,
} from '../../db/queries';
import { ReauthBanner } from '../../components/ui/ReauthBanner';
import { useReauthRequired } from '../../hooks/useReauthRequired';
import { hrefs } from '../../navigation/hrefs';
import { parseOptionalBoolean } from '../../navigation/routeParams';
import { useAuthSession } from '../../navigation/AuthSessionProvider';

/** Drawer helpers on the `(app)` layout — not available on the nested stack nav. */
type AppDrawerNavigation = {
  openDrawer: () => void;
};

/** Exported for unit tests (#670 progressive login spinner). */
export function HomeScreenBody({
  postLoginSyncActive,
  userSwitchEpoch,
}: {
  postLoginSyncActive: boolean;
  userSwitchEpoch: number;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation<AppDrawerNavigation>('/(app)');
  const params = useLocalSearchParams<{ newUserLoading?: string }>();
  const [activeTab, setActiveTab] = useState<HomeTab>('myWork');
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
      isSettling: () => isSettlingRef.current,
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
  // Bump refreshKey so Home is interactive; header sync chrome still shows (#670).
  const wasPostLoginSyncActiveRef = useRef(false);
  useEffect(() => {
    if (wasPostLoginSyncActiveRef.current && !postLoginSyncActive) {
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

  const handleReauthPress = useCallback(() => {
    router.push(hrefs.reauth({ returnTo: 'home' }));
  }, [router]);

  const handleSettingsPress = () => {
    navigation.openDrawer();
  };

  // CHANGED: was `triggerSync()`. Tapping the icon now navigates to the
  // Sync page instead of kicking off a sync directly (per #38 / #149).
  const handleSyncPress = useCallback(() => {
    router.push(hrefs.sync);
  }, [router]);

  const showLoading =
    isNewUserLoading ||
    postLoginSyncActive ||
    ((isSyncingLocal || isSyncing) && refreshKey === 0);
  const myWorkIsSyncing =
    isSyncing || isSyncingLocal || postLoginSyncActive || isNewUserLoading;

  if (showLoading) {
    return (
      <ScreenContainer>
        <View
          style={[styles.loadingContainer, { paddingTop: insets.top }]}
          testID="home-loading"
        >
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Syncing data...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <PageHeader
        leftIcon={<SettingsButton onPress={handleSettingsPress} />}
        rightIcon={
          <PageHeaderSyncButton
            syncStatus={syncStatus}
            failedErrorText={failedErrorText}
            onPress={handleSyncPress}
          />
        }
      />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <View style={styles.content}>
        {activeTab === 'myWork' ? (
          <MyWorkTab refreshKey={refreshKey} isSyncing={myWorkIsSyncing} />
        ) : (
          <ProjectsTab refreshKey={refreshKey} />
        )}
      </View>
      {reauthRequired ? (
        <ReauthBanner onSignInAgain={handleReauthPress} />
      ) : null}
    </ScreenContainer>
  );
}

export default function HomeScreen() {
  const { postLoginSyncActive, userSwitchEpoch } = useAuthSession();
  return (
    <HomeScreenBody
      key={userSwitchEpoch}
      postLoginSyncActive={postLoginSyncActive}
      userSwitchEpoch={userSwitchEpoch}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.sm,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
});
