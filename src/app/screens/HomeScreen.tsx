import { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { theme } from '../../theme';
import { PageHeader } from '../../components/layout/PageHeader';
import { TabBar, HomeTab } from '../../components/layout/TabBar';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { MyWorkTab } from '../tabs/MyWorkTab';
import { ProjectsTab } from '../tabs/ProjectsTab';
import { useSync } from '../../hooks/useSync';
import { UserSettingsMenu } from '../../components/ui/UserSettingsMenu';
import { RootStackParamList } from '../../types/navigation/types';
import { onSyncComplete, onSyncStart } from '../../services/syncEvents';

interface HomeScreenProps {
  onSignOut?: () => void;
}

export default function HomeScreen({ onSignOut }: HomeScreenProps) {
  const route = useRoute<RouteProp<RootStackParamList, 'Home'>>();
  const [activeTab, setActiveTab] = useState<HomeTab>('myWork');
  const [refreshKey, setRefreshKey] = useState(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [settingsAnchor, setSettingsAnchor] = useState({ top: 0, left: 16 });
  const [isNewUserLoading, setIsNewUserLoading] = useState(
    () => route.params?.newUserLoading === true,
  );
  const [isSyncingLocal, setIsSyncingLocal] = useState(false);

  const handleSyncComplete = useCallback(() => {
    setIsNewUserLoading(false);
    setRefreshKey(key => key + 1);
  }, []);

  const { isSyncing, triggerSync } = useSync({
    onSyncComplete: handleSyncComplete,
  });

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

  const handleUserSwitched = () => {
    setRefreshKey(key => key + 1);
  };

  const showLoading = isNewUserLoading || (isSyncingLocal && refreshKey === 0);

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
        onSettingsPress={handleSettingsPress}
        onSyncPress={triggerSync}
        isSyncing={isSyncing}
      />
      <UserSettingsMenu
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        anchor={settingsAnchor}
        onSignOut={onSignOut}
        onUserSwitched={handleUserSwitched}
      />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <View style={styles.content}>
        {activeTab === 'myWork' ? (
          <MyWorkTab refreshKey={refreshKey} isSyncing={isSyncing} />
        ) : (
          <ProjectsTab refreshKey={refreshKey} />
        )}
      </View>
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
