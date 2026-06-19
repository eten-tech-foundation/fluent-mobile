import React, { useCallback } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { CloudUpload, HardDrive, LogOut } from 'lucide-react-native';
import { PageHeader } from '../../components/layout/PageHeader';
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
import { getPendingUploadCount } from '../../db/queries';
import { FluentAPI, setActiveToken } from '../../services/api';
import { clearCredentials } from '../../services/keychain';
import {
  getActiveUserId,
  getKnownUserIds,
  kvStorage,
  KV_KEYS,
} from '../../services/storage';
import { usePreferences } from '../../hooks/usePreferences';
import { RootStackParamList } from '../../types/navigation/types';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { logger } from '../../utils/logger';

const log = logger.create('SettingsScreen');

type Nav = StackNavigationProp<RootStackParamList, 'Settings'>;

interface SettingsScreenProps {
  onSignOut?: () => void;
}

function SettingsSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export default function SettingsScreen({ onSignOut }: SettingsScreenProps) {
  const navigation = useNavigation<Nav>();
  const { uploadOverCellular, setUploadOverCellular } = usePreferences();

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

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

    setActiveToken(null);
    kvStorage.removeItemSync(KV_KEYS.ACTIVE_USER_ID);
    kvStorage.removeItemSync(KV_KEYS.USER_ID);
    kvStorage.removeItemSync(KV_KEYS.USER_EMAIL);
    onSignOut?.();
  };

  const handleLogOut = async () => {
    const pendingCount = await getPendingUploadCount();

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
    <ScreenContainer edges={['top']}>
      <View style={styles.screen}>
        <PageHeader title="Settings" onBackPress={goBack} />
        <ScrollView contentContainerStyle={styles.content}>
          <SettingsSection label="Offline">
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
          </SettingsSection>

          <SettingsSection label="Sync">
            <SettingsToggleRow
              title="Upload over cellular"
              subtitle="When off, uploads only happen on WiFi"
              icon={
                <CloudUpload
                  size={iconSizes.headerTab}
                  color={iconColor}
                  strokeWidth={listIconStrokeWidth}
                />
              }
              value={uploadOverCellular}
              onValueChange={setUploadOverCellular}
            />
          </SettingsSection>

          <SettingsSection label="Account">
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
          </SettingsSection>
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
    gap: theme.spacing.xs,
  },
  sectionLabel: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: theme.spacing.xs,
  },
  sectionCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
});
