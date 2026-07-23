import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { HardDrive, LogOut, Trash2, UserPlus } from 'lucide-react-native';
import { StackScreenHeader } from '../../components/layout/StackScreenHeader';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import {
  SettingsDestructiveRow,
  SettingsNavigationRow,
  SettingsToggleRow,
} from '../../components/ui/SettingsListRow';
import {
  LOGOUT_UNSYNCED_CANCEL,
  LOGOUT_UNSYNCED_CONFIRM,
  LOGOUT_UNSYNCED_MESSAGE,
  LOGOUT_UNSYNCED_TITLE,
} from '../../constants/messages';
import { signOutCurrentDeviceAccount } from '../../services/accountSession';
import { clearAllPausedTakes } from '../../services/pausedTakes';
import { getKnownUserIds, MAX_DEVICE_ACCOUNTS } from '../../services/storage';
import { loadPendingUploadCount } from '../../hooks/usePendingUploads';
import { usePreferences } from '../../hooks/usePreferences';
import { RootStackParamList } from '../../types/navigation/types';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { logger } from '../../utils/logger';

const log = logger.create('SettingsScreen');

type Nav = StackNavigationProp<RootStackParamList, 'Settings'>;

interface SettingsScreenProps {
  onSignOut?: () => void;
}

export default function SettingsScreen({ onSignOut }: SettingsScreenProps) {
  const navigation = useNavigation<Nav>();
  const { uploadOverCellular, setUploadOverCellular } = usePreferences();
  const [atAccountLimit, setAtAccountLimit] = useState(
    () => getKnownUserIds().length >= MAX_DEVICE_ACCOUNTS,
  );

  useFocusEffect(
    useCallback(() => {
      setAtAccountLimit(getKnownUserIds().length >= MAX_DEVICE_ACCOUNTS);
    }, []),
  );

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const handleAddUser = useCallback(() => {
    if (atAccountLimit) return;
    navigation.navigate('AddUser');
  }, [navigation, atAccountLimit]);

  const performLogOut = async () => {
    const result = await signOutCurrentDeviceAccount();
    if (result.kind === 'switched') {
      navigation.goBack();
      return;
    }
    onSignOut?.();
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
    <ScreenContainer edges={['bottom']}>
      <View style={styles.screen}>
        <StackScreenHeader title="Settings" onBack={goBack} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Offline</Text>
            <View style={styles.cardGroup}>
              <View style={styles.sectionCard}>
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
                  onPress={() => navigation.navigate('PrepareForOffline')}
                />
              </View>
              <View style={styles.sectionCard}>
                <SettingsToggleRow
                  title="Upload/Download over cellular"
                  subtitle="Use mobile data to upload recordings when WiFi isn't available."
                  value={uploadOverCellular}
                  onValueChange={setUploadOverCellular}
                />
              </View>
              <View style={styles.sectionCard}>
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
  },
  sectionCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
});
