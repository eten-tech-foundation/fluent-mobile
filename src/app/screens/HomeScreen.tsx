import { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { theme } from '../../theme';
import { PageHeader } from '../../components/layout/PageHeader';
import { TabBar, HomeTab } from '../../components/layout/TabBar';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { MyWorkTab } from '../tabs/MyWorkTab';
import { ProjectsTab } from '../tabs/ProjectsTab';
import { useSync } from '../../hooks/useSync';
import { useSyncStatus } from '../../hooks/useSyncStatus';
import { RootStackParamList } from '../../types/navigation/types';

export default function HomeScreen() {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const [activeTab, setActiveTab] = useState<HomeTab>('myWork');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSyncComplete = useCallback(() => {
    setRefreshKey(key => key + 1);
  }, []);

  const { isSyncing } = useSync({
    onSyncComplete: handleSyncComplete,
  });

  const { status: syncStatus } = useSyncStatus({ isSyncing, refreshKey });

  const handleSyncPress = useCallback(() => {
    navigation.navigate('Sync');
  }, [navigation]);

  return (
    <ScreenContainer edges={['top']}>
      <PageHeader syncStatus={syncStatus} onSyncPress={handleSyncPress} />
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
});
