import { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { PageHeader } from '../../components/layout/PageHeader';
import { TabBar, HomeTab } from '../../components/layout/TabBar';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { MyWorkTab } from '../tabs/MyWorkTab';
import { ProjectsTab } from '../tabs/ProjectsTab';
import { useSync } from '../../hooks/useSync';

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState<HomeTab>('myWork');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSyncComplete = useCallback(() => {
    setRefreshKey(key => key + 1);
  }, []);

  const { isSyncing, triggerSync } = useSync({
    onSyncComplete: handleSyncComplete,
  });

  return (
    <ScreenContainer edges={['top']}>
      <PageHeader onSyncPress={triggerSync} isSyncing={isSyncing} />
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <View style={styles.content}>
        {activeTab === 'myWork' ? (
          <MyWorkTab />
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
  },
});
