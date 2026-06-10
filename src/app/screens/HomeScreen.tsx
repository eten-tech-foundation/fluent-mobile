import { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { theme } from '../../theme';
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
import { onSyncComplete, onSyncStart } from '../../services/syncEvents';

interface HomeScreenProps {
  onSignOut?: () => void;
  postLoginSyncActive?: boolean;
}

export default function HomeScreen({
  onSignOut,
  postLoginSyncActive = false,
}: HomeScreenProps) {
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
  }, []);

  const { isSyncing, triggerSync } = useSync({
    onSyncComplete: handleSyncComplete,
  });

  const { status: syncStatus } = useSyncStatus({ isSyncing, refreshKey });

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

  const handleSettingsPress = () => {
    setSettingsAnchor({ top: 56, left: 16 });
    setSettingsVisible(true);
  };

  const handleUserSwitched = useCallback(() => {
    setRefreshKey(key => key + 1);
  }, []);

  const handleSyncPress = useCallback(() => {
    triggerSync();
  }, [triggerSync]);

  const isInitialSyncInProgress =
    isNewUserLoading ||
    postLoginSyncActive ||
    ((isSyncingLocal || isSyncing) && refreshKey === 0);

  const showLoading = isInitialSyncInProgress;
  const myWorkIsSyncing =
    isSyncing || isSyncingLocal || postLoginSyncActive || isNewUserLoading;

  if (showLoading) {
    return (
      <ScreenContainer edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Syncing data...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer edges={['top']}>
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
