import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HardDrive,
  LayoutGrid,
  RefreshCw,
  Settings,
} from 'lucide-react-native';
import { AppHeader } from '../../../components/layout/AppHeader';
import { ScreenContainer } from '../../../components/layout/ScreenContainer';
import { SettingsNavigationRow } from '../../../components/ui/SettingsListRow';
import { isComponentGalleryEnabled } from '../../../config/componentGallery';
import { hrefs } from '../../../navigation/hrefs';
import { iconSizes, listIconStrokeWidth } from '../../../theme';
import { useTheme, useThemedStyles } from '../../../theme/useTheme';

/**
 * Placeholder v2 Home until My chapters is built. Links into the v1 screens
 * Next still uses, including Settings to switch back to Legacy.
 */
export default function V2HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useThemedStyles(t => ({
    content: { padding: t.spacing.lg },
    card: {
      backgroundColor: t.colors.cardBackground,
      borderRadius: t.radius.sm,
    },
  }));

  const icon = (Icon: typeof Settings) => (
    <Icon
      size={iconSizes.headerTab}
      color={theme.colors.foreground}
      strokeWidth={listIconStrokeWidth}
    />
  );

  return (
    <ScreenContainer>
      <AppHeader title="Next" subtitle="Beta" titleAlign="start" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + theme.spacing.xxl },
        ]}
        testID="v2-home"
      >
        <View style={styles.card}>
          <SettingsNavigationRow
            title="Settings"
            subtitle="Switch back to Legacy under Interface"
            icon={icon(Settings)}
            onPress={() => router.push(hrefs.settings)}
            testID="v2-home-settings"
          />
          <SettingsNavigationRow
            title="Sync"
            subtitle="Uploads and sync status"
            icon={icon(RefreshCw)}
            onPress={() => router.push(hrefs.sync)}
            testID="v2-home-sync"
          />
          <SettingsNavigationRow
            title="Prepare for Offline"
            subtitle="Download resources and manage device storage"
            icon={icon(HardDrive)}
            onPress={() => router.push(hrefs.prepareForOffline())}
            testID="v2-home-prepare-offline"
          />
          {isComponentGalleryEnabled() ? (
            <SettingsNavigationRow
              title="Component gallery"
              subtitle="Review Next UI components in isolation"
              icon={icon(LayoutGrid)}
              onPress={() => router.push(hrefs.gallery)}
              testID="v2-home-gallery"
            />
          ) : null}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
