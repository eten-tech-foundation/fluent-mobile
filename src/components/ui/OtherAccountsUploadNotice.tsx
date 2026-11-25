import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Users } from 'lucide-react-native';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { WarningBanner } from './WarningBanner';

export const OTHER_ACCOUNT_SIGN_IN_MESSAGE =
  'Another account on this device must sign in to finish uploading.';

export function formatOtherAccountsPendingLabel(count: number): string {
  return count === 1
    ? '1 upload from other accounts on this device'
    : `${count} uploads from other accounts on this device`;
}

export type OtherAccountsUploadNoticeProps = {
  pendingCount: number;
  needsSignIn: boolean;
};

/**
 * Sync page line for work other accounts on this device still have to upload
 * (#854). Those accounts upload as themselves while the active account stays
 * on screen. Their names are never shown.
 */
export function OtherAccountsUploadNotice({
  pendingCount,
  needsSignIn,
}: OtherAccountsUploadNoticeProps) {
  if (pendingCount <= 0 && !needsSignIn) {
    return null;
  }
  return (
    <View style={styles.section} testID="sync-other-accounts">
      {pendingCount > 0 ? (
        <View style={styles.row}>
          <Users
            size={iconSizes.headerTab}
            color={theme.colors.mutedForeground}
            strokeWidth={listIconStrokeWidth}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={styles.label} testID="sync-other-accounts-count">
            {formatOtherAccountsPendingLabel(pendingCount)}
          </Text>
        </View>
      ) : null}
      {needsSignIn ? (
        <WarningBanner
          variant="amber"
          icon={Users}
          message={OTHER_ACCOUNT_SIGN_IN_MESSAGE}
          testID="sync-other-accounts-sign-in"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
  },
  label: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
});
