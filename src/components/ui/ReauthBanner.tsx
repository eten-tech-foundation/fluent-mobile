import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { SettingsNavigationRow } from './SettingsListRow';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import {
  REAUTH_PROMPT_SUBTITLE,
  REAUTH_PROMPT_TITLE,
} from '../../constants/messages';

interface ReauthBannerProps {
  onSignInAgain: () => void;
}

export function ReauthBanner({ onSignInAgain }: ReauthBannerProps) {
  return (
    <View
      style={styles.container}
      testID="reauth-banner"
      pointerEvents="box-none"
    >
      <View style={styles.card}>
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
          onPress={onSignInAgain}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    bottom: theme.spacing.xxl,
    zIndex: 10,
  },
  card: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radius.lg,
    ...Platform.select({
      ios: {
        shadowColor: theme.colors.foreground,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },
});
