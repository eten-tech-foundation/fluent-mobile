import React, { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  HardDrive,
  LogOut,
  Trash2,
  UserPlus,
} from 'lucide-react-native';
import { StackScreenHeader } from '../../components/layout/StackScreenHeader';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import {
  SettingsDestructiveRow,
  SettingsNavigationRow,
  SettingsSegmentedRow,
  SettingsToggleRow,
} from '../../components/ui/SettingsListRow';
import {
  LOGOUT_UNSYNCED_CANCEL,
  LOGOUT_UNSYNCED_CONFIRM,
  LOGOUT_UNSYNCED_MESSAGE,
  LOGOUT_UNSYNCED_TITLE,
  REAUTH_PROMPT_TITLE,
  REAUTH_PROMPT_SUBTITLE,
} from '../../constants/messages';
import { signOutCurrentDeviceAccount } from '../../services/accountSession';
import { clearAllPausedTakes } from '../../services/pausedTakes';
import { getKnownUserIds, MAX_DEVICE_ACCOUNTS } from '../../services/storage';
import { loadPendingUploadCount } from '../../hooks/usePendingUploads';
import { usePreferences } from '../../hooks/usePreferences';
import { useReauthRequired } from '../../hooks/useReauthRequired';
import { hrefs } from '../../navigation/hrefs';
import { useAuthSession } from '../../navigation/AuthSessionProvider';
import { resetNavigationAfterAccountSwitch } from '../../navigation/resetNavigationAfterAccountSwitch';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { logger } from '../../utils/logger';
import { useDraftingUnit } from '../../hooks/useDraftingUnit';

const log = logger.create('SettingsScreen');

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut: onSignOut, notifyUserSwitched: onUserSwitched } =
    useAuthSession();
  const { uploadOverCellular, setUploadOverCellular } = usePreferences();
  const { draftingUnit, setDraftingUnit } = useDraftingUnit();
  const { reauthRequired } = useReauthRequired({ refreshOnFocus: true });
  const [atAccountLimit, setAtAccountLimit] = useState(
    () => getKnownUserIds().length >= MAX_DEVICE_ACCOUNTS,
  );

  useFocusEffect(
    useCallback(() => {
      setAtAccountLimit(getKnownUserIds().length >= MAX_DEVICE_ACCOUNTS);
    }, []),
  );

  const goBack = useCallback(() => {
    // Settings is a Drawer sibling of `(stack)`, so `canGoBack()` is often false
    // after More Settings. Always land on home to avoid a blank white surface (#348).
    router.replace(hrefs.home());
  }, [router]);

  const handleAddUser = useCallback(() => {
    if (atAccountLimit) return;
    router.push(hrefs.addUser);
  }, [router, atAccountLimit]);

  const performLogOut = async () => {
    const result = await signOutCurrentDeviceAccount();
    if (result.kind === 'switched') {
      onUserSwitched();
      resetNavigationAfterAccountSwitch(router);
      return;
    }
    onSignOut();
  };

  const handleLogOut = async () => {
    const pendingCount = await loadPendingUploadCount();

    if (pendingCount > 0) {
      Alert.alert(LOGOUT_UNSYNCED_TITLE, LOGOUT_UNSYNCED_MESSAGE, [
        { text: LOGOUT_UNSYNCED_CANCEL, style: 'cancel' },
        {
          text: LOGOUT_UNSYNCED_CONFIRM,
          style: 'destructive',
          onPress: () => {
            void performLogOut();
          },
        },
      ]);
      return;
    }

    await performLogOut();
  };

  const handleClearCache = useCallback(() => {
    Alert.alert(
      'Clear cache?',
      'Removes paused draft takes stored on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const all = await clearAllPausedTakes();
              log.info('Cache cleared', { all });
              Alert.alert('Cache cleared', 'Paused draft takes were removed.');
            })();
          },
        },
      ],
    );
  }, []);

  const iconColor = theme.colors.foreground;

  return (
    <ScreenContainer>
      <View style={styles.screen}>
        <StackScreenHeader title="Settings" onBack={goBack} />
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: theme.spacing.lg + insets.bottom },
          ]}
        >
          {reauthRequired ? (
            <View style={styles.section}>
              <View style={styles.cardGroup}>
                <View style={styles.sectionCard}>
                  <SettingsNavigationRow
                    title={REAUTH_PROMPT_TITLE}
                    subtitle={REAUTH_PROMPT_SUBTITLE}
                    icon={
                      <AlertCircle
                        size={iconSizes.headerTab}
                        color={theme.colors.destructive}
                        strokeWidth={listIconStrokeWidth}
                      />
                    }
                    onPress={() =>
                      router.push(hrefs.reauth({ returnTo: 'settings' }))
                    }
                  />
                </View>
              </View>
            </View>
          ) : null}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Offline</Text>

            <View style={styles.offlineArea}>
              <View style={styles.hairlineDivider} />

              <View style={styles.prepareOfflineRow}>
                <SettingsNavigationRow
                  title="Prepare for Offline"
                  subtitle="Download resources and manage device storage"
                  icon={
                    <HardDrive
                      size={iconSizes.headerTab}
                      color={iconColor}
                      strokeWidth={listIconStrokeWidth}
                    />
                  }
                  onPress={() => router.push(hrefs.prepareForOffline())}
                />
              </View>

              <View style={styles.hairlineDivider} />

              <View style={styles.cardGroup}>
                <View style={styles.sectionCard}>
                  <SettingsToggleRow
                    title="Upload/Download over cellular"
                    subtitle="Use mobile data to upload recordings when WiFi isn't available."
                    value={uploadOverCellular}
                    onValueChange={setUploadOverCellular}
                  />
                </View>

                <View style={styles.sectionCard}>
                  <SettingsSegmentedRow
                    title="Drafting unit"
                    subtitle="Choose whether the drafting tabs work one verse at a time or by full pericope."
                    options={[
                      { label: 'Verse', value: 'verse' },
                      { label: 'Pericope', value: 'pericope' },
                    ]}
                    value={draftingUnit}
                    onValueChange={setDraftingUnit}
                  />
                </View>
              </View>

              <View style={styles.hairlineDivider} />
            </View>

            <View style={styles.clearCacheCard}>
              <SettingsDestructiveRow
                title="Clear cache"
                icon={
                  <Trash2
                    size={iconSizes.headerTab}
                    color={theme.colors.destructive}
                    strokeWidth={listIconStrokeWidth}
                  />
                }
                onPress={handleClearCache}
              />
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Account</Text>
            <View style={styles.sectionCard}>
              <SettingsNavigationRow
                title="Add user"
                subtitle="Sign in with another account on this device"
                disabled={atAccountLimit}
                disabledSubtitle="You've reached the 3-account limit"
                icon={
                  <UserPlus
                    size={iconSizes.headerTab}
                    color={iconColor}
                    strokeWidth={listIconStrokeWidth}
                  />
                }
                onPress={handleAddUser}
              />
              <SettingsDestructiveRow
                title="Log out"
                icon={
                  <LogOut
                    size={iconSizes.headerTab}
                    color={theme.colors.destructive}
                    strokeWidth={listIconStrokeWidth}
                  />
                }
                onPress={() => {
                  void handleLogOut();
                }}
              />
            </View>
          </View>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  section: {
    gap: theme.spacing.sm,
  },
  sectionLabel: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginLeft: theme.spacing.xs,
  },
  cardGroup: {
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    width: '100%',
  },
  sectionCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    width: '100%',
    alignSelf: 'stretch',
    marginHorizontal: 0,
  },
  offlineArea: {
    backgroundColor: theme.colors.cardBackground,
    marginHorizontal: -theme.spacing.lg,
  },
  prepareOfflineRow: {
    backgroundColor: theme.colors.cardBackground,
  },

  hairlineDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  clearCacheCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    marginTop: theme.spacing.md,
  },

  rowDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
});
