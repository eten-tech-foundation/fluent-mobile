import { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../theme';
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
  const [settingsAnchor, setSettingsAnchor] = useState({ top: 56, left: 16 });
  const [isNewUserLoading, setIsNewUserLoading] = useState(
    () => route.params?.newUserLoading === true,
  );
  const [isSyncingLocal, setIsSyncingLocal] = useState(false);

  const handleSyncComplete = useCallback(() => {
    setIsNewUserLoading(false);
    setIsSyncingLocal(false);
  }, []);

  const isSyncingGlobal = useGlobalSyncStatus(() => {
    setIsNewUserLoading(false);
    setRefreshKey(key => key + 1);
  });
  const { isSyncing, triggerSync } = useSync({
    onSyncComplete: handleSyncComplete,
  });

  const {
    status: syncStatus,
    needsDownloadSync,
    isOnline,
  } = useSyncStatus({
    isSyncing: isSyncing || isSyncingGlobal,
    refreshKey,
  });

  const autoRepairSyncAttempted = useRef(false);

  useEffect(() => {
    const unsubscribeComplete = onSyncComplete(() => {
      setIsNewUserLoading(false);
      setIsSyncingLocal(false);
      setRefreshKey(key => key + 1);
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
      !isOnline ||
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
    isOnline,
    isSyncing,
    postLoginSyncActive,
    isNewUserLoading,
    triggerSync,
  ]);

  const handleSettingsPress = () => {
    setSettingsAnchor({ top: 56, left: 16 });
    setSettingsVisible(true);
  };

  const handleUserSwitched = useCallback(() => {
    autoRepairSyncAttempted.current = false;
    setRefreshKey(key => key + 1);
  }, []);

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
      <UserSettingsMenu
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        anchor={settingsAnchor}
        onSignOut={onSignOut}
        onUserSwitched={handleUserSwitched}
      />
    </ScreenContainer>
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
