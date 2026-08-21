import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';

type WarningBannerVariant = 'info' | 'amber';

export type WarningBannerProps = {
  message: string;
  icon?: LucideIcon;
  variant?: WarningBannerVariant;
  testID?: string;
};

export function WarningBanner({
  message,
  icon: Icon,
  variant = 'info',
  testID = 'warning-banner',
}: WarningBannerProps) {
  const isAmber = variant === 'amber';

  return (
    <View
      style={[styles.banner, isAmber ? styles.bannerAmber : styles.bannerInfo]}
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      {Icon ? (
        <Icon
          size={iconSizes.headerTab}
          color={theme.colors.warningIcon}
          strokeWidth={listIconStrokeWidth}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      <Text
        style={[
          styles.message,
          isAmber ? styles.messageAmber : styles.messageInfo,
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    backgroundColor: theme.colors.warningBackground,
    borderColor: theme.colors.warningBorder,
  },
  bannerInfo: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerAmber: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  message: {
    fontSize: theme.typography.sizes.sm,
    lineHeight: theme.typography.lineHeights.tight,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.warning,
  },
  messageInfo: {
    textAlign: 'center',
  },
  messageAmber: {
    flex: 1,
    textAlign: 'left',
  },
});
