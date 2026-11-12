import { useState, useCallback, useEffect, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useIsFocused, useNavigation, useRouter } from 'expo-router';
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
import { hideSplash } from '../../navigation/splashGate';
import { logger } from '../../utils/logger';

const log = logger.create('HomeScreen');

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
  const router = useRouter();
  const navigation = useNavigation<AppDrawerNavigation>('/(app)');
  const isFocused = useIsFocused();
  const [activeTab, setActiveTab] = useState<HomeTab>('myWork');
  const syncPushLockRef = useRef(false);
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

  useEffect(() => {
    log.info('home showLoading flip', { showLoading });
  }, [showLoading]);

  // Legacy keeps the old splash timing: down as soon as Home mounts.
  useEffect(() => {
    hideSplash('home:legacy');
  }, []);

  useEffect(() => {
    if (isFocused) {
      syncPushLockRef.current = false;
    }
  }, [isFocused]);

  // CHANGED: was `triggerSync()`. Tapping the icon now navigates to the
  // Sync page instead of kicking off a sync directly (per #38 / #149).
  // Keep the header mounted during settling (#721) so a mid-tap unmount
  // cannot drop the press. Guard duplicate pushes while unfocused.
  const handleSyncPressIn = useCallback(() => {
    log.info('home sync onPressIn', { showLoading });
  }, [showLoading]);

  const handleSyncPress = useCallback(() => {
    log.info('home sync onPress', { showLoading });
    if (syncPushLockRef.current) {
      log.info('home sync push skipped', { reason: 'duplicate' });
      return;
    }
    syncPushLockRef.current = true;
    log.info('home sync push before');
    try {
      router.push(hrefs.sync);
      log.info('home sync push after');
    } catch (error) {
      syncPushLockRef.current = false;
      log.warn('home sync push failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }, [router, showLoading]);

  return (
    <ScreenContainer>
      <PageHeader
        leftIcon={<SettingsButton onPress={handleSettingsPress} />}
        rightIcon={
          <PageHeaderSyncButton
            syncStatus={syncStatus}
            failedErrorText={failedErrorText}
            onPressIn={handleSyncPressIn}
            onPress={handleSyncPress}
          />
        }
      />
      {showLoading ? (
        <View style={styles.loadingContainer} testID="home-loading">
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Syncing data...</Text>
        </View>
      ) : (
        <>
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
          <View style={styles.content}>
            {activeTab === 'myWork' ? (
              <MyWorkTab
                refreshKey={refreshKey}
                isSyncing={isSyncingChapters}
              />
            ) : (
              <ProjectsTab refreshKey={refreshKey} />
            )}
          </View>
          {reauthRequired ? (
            <ReauthBanner onSignInAgain={handleReauthPress} />
          ) : null}
        </>
      )}
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
