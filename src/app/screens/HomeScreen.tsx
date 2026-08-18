import { useState, useCallback, useEffect, useRef } from 'react';
import {
  AppState,
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
} from 'react-native';
import {
  useRoute,
  useNavigation,
  RouteProp,
  useIsFocused,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../theme';
import { parseUserId } from '../../utils/parseUserId';
import { usePreferences } from '../../hooks/usePreferences';
import { useConnectivity } from '../../hooks/useConnectivity';
import { StackNavigationProp } from '@react-navigation/stack';
import { PageHeader } from '../../components/layout/PageHeader';
import { SettingsButton } from '../../components/ui/SettingsButton';
import { PageHeaderSyncButton } from '../../components/ui/PageHeaderSyncButton';
import { UserSettingsMenu } from '../../components/ui/UserSettingsMenu';
import { TabBar, HomeTab } from '../../components/layout/TabBar';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { MyWorkTab } from '../tabs/MyWorkTab';
import { ProjectsTab } from '../tabs/ProjectsTab';
import { useSync } from '../../hooks/useSync';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { RootStackParamList } from '../../types/navigation/types';
import { useGlobalSyncStatus } from '../../hooks/useGlobalSyncStatus';
import { onSyncComplete, onSyncStart } from '../../services/syncEvents';
import { getPrepareOfflineDownloadStarted } from '../../services/storage';
import { shouldPresentPrepareOffline } from '../../utils/prepareOfflineTrigger';
import {
  getProjectsWithSummary,
  isUserAssignedToProject,
} from '../../db/queries';
import { ReauthBanner } from '../../components/ui/ReauthBanner';
import { useReauthRequired } from '../../hooks/useReauthRequired';

interface HomeScreenProps {
  onSignOut?: () => void;
  postLoginSyncActive?: boolean;
}

type Nav = StackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeScreen({
  onSignOut,
  postLoginSyncActive = false,
}: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Home'>>();
  const [activeTab, setActiveTab] = useState<HomeTab>('myWork');
  const [refreshKey, setRefreshKey] = useState(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [isNewUserLoading, setIsNewUserLoading] = useState(
    () => route.params?.newUserLoading === true,
  );
  const [isSyncingLocal, setIsSyncingLocal] = useState(false);
  const {
    isOnline: connectivityIsOnline,
    isWifi,
    isCellular,
    hasResolved,
  } = useConnectivity();
  const { uploadOverCellular } = usePreferences();
  const isFocused = useIsFocused();

  const isWifiRef = useRef(isWifi);
  const connectivityIsOnlineRef = useRef(connectivityIsOnline);
  const wasEligibleRef = useRef(false);
  const isFocusedRef = useRef(isFocused);
  const isCellularRef = useRef(isCellular);
  const hasResolvedRef = useRef(hasResolved);
  const uploadOverCellularRef = useRef(uploadOverCellular);
  const prepareOfflinePromptShownThisAppOpenRef = useRef(false);
  const isSettlingRef = useRef(false);

  const evaluateRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const appStateRef = useRef(AppState.currentState);
  const evaluateInFlightRef = useRef(false);

  useEffect(() => {
    isWifiRef.current = isWifi;
    connectivityIsOnlineRef.current = connectivityIsOnline;
    isCellularRef.current = isCellular;
    uploadOverCellularRef.current = uploadOverCellular;
    isFocusedRef.current = isFocused;
    hasResolvedRef.current = hasResolved;
  }, [
    connectivityIsOnline,
    isWifi,
    isCellular,
    uploadOverCellular,
    isFocused,
    hasResolved,
  ]);

  const handleSyncComplete = useCallback(() => {
    setIsNewUserLoading(false);
    setIsSyncingLocal(false);
    void evaluateRef.current?.();
  }, []);

  const isSyncingGlobal = useGlobalSyncStatus(() => {
    setIsNewUserLoading(false);
    setRefreshKey(key => key + 1);
    void evaluateRef.current?.();
  });
  const { isSyncing, triggerSync } = useSync({
    onSyncComplete: handleSyncComplete,
  });

  const {
    status: syncStatus,
    needsDownloadSync,
    isOnline: syncIsOnline,
  } = useSyncStatus({
    isSyncing: isSyncing || isSyncingGlobal,
    refreshKey,
  });

  const autoRepairSyncAttempted = useRef(false);

  useEffect(() => {
    isSettlingRef.current =
      isNewUserLoading || postLoginSyncActive || isSyncingLocal || isSyncing;
  }, [isNewUserLoading, postLoginSyncActive, isSyncingLocal, isSyncing]);

  useEffect(() => {
    const unsubscribeComplete = onSyncComplete(() => {
      setIsNewUserLoading(false);
      setIsSyncingLocal(false);
      setRefreshKey(key => key + 1);
      void evaluateRef.current?.();
    });
    const unsubscribeStart = onSyncStart(() => {
      setIsSyncingLocal(true);
    });

    return () => {
      unsubscribeComplete();
      unsubscribeStart();
    };
  }, []);

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
    const evaluate = async () => {
      if (!isFocusedRef.current || !hasResolvedRef.current) return;
      if (isSettlingRef.current) return;

      const eligibleConnection =
        connectivityIsOnlineRef.current &&
        (isWifiRef.current ||
          (uploadOverCellularRef.current && isCellularRef.current));
      if (!eligibleConnection) return;
      if (
        prepareOfflinePromptShownThisAppOpenRef.current ||
        evaluateInFlightRef.current
      ) {
        return;
      }

      evaluateInFlightRef.current = true;
      try {
        const userId = parseUserId();
        if (!userId) return;

        const projects = await getProjectsWithSummary(userId);

        if (prepareOfflinePromptShownThisAppOpenRef.current) {
          return;
        }

        for (const project of projects) {
          const isAssigned = await isUserAssignedToProject(userId, project.id);
          const present = shouldPresentPrepareOffline({
            connectivityProfile: project.connectivityProfile ?? null,
            isAssigned,
            isOnline: connectivityIsOnlineRef.current,
            isWifi: isWifiRef.current,
            isCellular: isCellularRef.current,
            uploadOverCellular: uploadOverCellularRef.current,
          });

          if (
            present &&
            !getPrepareOfflineDownloadStarted(String(userId), project.id)
          ) {
            prepareOfflinePromptShownThisAppOpenRef.current = true;
            navigation.navigate('PrepareForOffline');
            return;
          }
        }
      } finally {
        evaluateInFlightRef.current = false;
      }
    };
    evaluateRef.current = evaluate;

    const subscription = AppState.addEventListener('change', nextState => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'active' && previousState !== 'active') {
        prepareOfflinePromptShownThisAppOpenRef.current = false;
        void evaluate();
      }
    });

    if (AppState.currentState === 'active') {
      void evaluate();
    }

    return () => subscription.remove();
  }, [navigation]);

  useEffect(() => {
    if (!hasResolved) return;
    const eligibleConnection =
      connectivityIsOnline && (isWifi || (uploadOverCellular && isCellular));

    if (!isFocused) {
      wasEligibleRef.current = false;
      return;
    }

    const wasEligible = wasEligibleRef.current;
    wasEligibleRef.current = eligibleConnection;
    if (eligibleConnection && !wasEligible) {
      void evaluateRef.current?.();
    }
  }, [
    connectivityIsOnline,
    isWifi,
    isCellular,
    uploadOverCellular,
    isFocused,
    hasResolved,
  ]);

  const { reauthRequired, refreshReauthRequired } = useReauthRequired({
    refreshOnFocus: true,
  });

  const handleReauthPress = useCallback(() => {
    navigation.navigate('Reauth');
  }, [navigation]);

  const handleSettingsPress = () => {
    setSettingsVisible(true);
  };

  const handleUserSwitched = useCallback(() => {
    autoRepairSyncAttempted.current = false;
    refreshReauthRequired();
    setRefreshKey(key => key + 1);
  }, [refreshReauthRequired]);

  // CHANGED: was `triggerSync()`. Tapping the icon now navigates to the
  // Sync page instead of kicking off a sync directly (per #38 / #149).
  const handleSyncPress = useCallback(() => {
    navigation.navigate('Sync');
  }, [navigation]);

  const showLoading =
    isNewUserLoading ||
    postLoginSyncActive ||
    ((isSyncingLocal || isSyncing) && refreshKey === 0);
  const myWorkIsSyncing =
    isSyncing || isSyncingLocal || postLoginSyncActive || isNewUserLoading;

  if (showLoading) {
    return (
      <ScreenContainer>
        <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Syncing data...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.screen}>
        <PageHeader
          leftIcon={<SettingsButton onPress={handleSettingsPress} />}
          rightIcon={
            <PageHeaderSyncButton
              syncStatus={syncStatus}
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
        <UserSettingsMenu
          visible={settingsVisible}
          onClose={() => setSettingsVisible(false)}
          onSignOut={onSignOut}
          onUserSwitched={handleUserSwitched}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
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
