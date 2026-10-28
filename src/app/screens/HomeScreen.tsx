import { useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../theme';
import { PageHeader } from '../../components/layout/PageHeader';
import { SettingsButton } from '../../components/ui/SettingsButton';
import { PageHeaderSyncButton } from '../../components/ui/PageHeaderSyncButton';
import { TabBar, HomeTab } from '../../components/layout/TabBar';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { MyWorkTab } from '../tabs/MyWorkTab';
import { ProjectsTab } from '../tabs/ProjectsTab';
import { ReauthBanner } from '../../components/ui/ReauthBanner';
import { useHomeSyncState } from '../../hooks/useHomeSyncState';
import { hrefs } from '../../navigation/hrefs';
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
  const [activeTab, setActiveTab] = useState<HomeTab>('myWork');
  const {
    refreshKey,
    showLoading,
    isSyncingChapters,
    syncStatus,
    failedErrorText,
    reauthRequired,
  } = useHomeSyncState({ postLoginSyncActive, userSwitchEpoch });

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
          <MyWorkTab refreshKey={refreshKey} isSyncing={isSyncingChapters} />
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
