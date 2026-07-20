import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { HardDrive, LogOut, UserPlus } from 'lucide-react-native';
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
import { FluentAPI } from '../../services/api';
import { signOut } from '../../services/authSession';
import { authToken } from '../../services/authToken';
import { clearCredentials, getCredentials } from '../../services/keychain';
import {
  getActiveUserId,
  getKnownUserIds,
  kvStorage,
  KV_KEYS,
  switchActiveUser,
  MAX_DEVICE_ACCOUNTS,
} from '../../services/storage';
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
    const currentUserId = getActiveUserId();

    try {
      await FluentAPI.signOut();
    } catch (e) {
      log.error('Server sign out failed', { error: e });
    }

    await clearCredentials(currentUserId);

    const remaining = getKnownUserIds().filter(id => id !== currentUserId);
    kvStorage.setItemSync(KV_KEYS.KNOWN_USER_IDS, remaining.join(','));
    log.info('User signed out', { userId: currentUserId });

    for (const candidateUserId of remaining) {
      let creds;
      try {
        creds = await getCredentials(candidateUserId);
      } catch (e) {
        log.error('Failed to read credentials for candidate account', {
          userId: candidateUserId,
          error: e,
        });
        continue;
      }

      if (!creds?.token) {
        log.error('Skipping candidate account with no usable session', {
          userId: candidateUserId,
        });
        continue;
      }

      authToken.set(creds.token);
      switchActiveUser(candidateUserId);
      navigation.goBack();
      return;
    }

    signOut();
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
