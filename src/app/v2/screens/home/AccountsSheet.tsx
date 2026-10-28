import React, { useCallback } from 'react';
import { ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar } from '../../../../components/ui/Avatar';
import { BottomSheet } from '../../../../components/ui/BottomSheet';
import { ListRow } from '../../../../components/ui/ListRow';
import {
  Check,
  Gear,
  SignOut,
  UserPlus,
} from '../../../../components/ui/icons';
import { ACCOUNT_SIGN_OUT_LABEL } from '../../../../constants/messages';
import { useAccountActions } from '../../../../hooks/useAccountActions';
import { useDeviceAccounts } from '../../../../hooks/useDeviceAccounts';
import { useAuthSession } from '../../../../navigation/AuthSessionProvider';
import { hrefs } from '../../../../navigation/hrefs';
import { MAX_DEVICE_ACCOUNTS } from '../../../../services/storage';
import { useTheme } from '../../../../theme/useTheme';

/**
 * The avatar's sheet (Figma Home · Accounts sheet, node 2646:166): switch
 * between this device's accounts, add one, open Settings or log out.
 */
export function AccountsSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { controlSizes, roles } = useTheme();
  const router = useRouter();
  const { signOut: endSession, notifyUserSwitched } = useAuthSession();
  const { accounts, accountCount, hasAccountLimit, loading } =
    useDeviceAccounts(visible);
  const { switchingUserId, switchTo, addAccount, signOut, blockIfRecording } =
    useAccountActions({
      close: onClose,
      onUserSwitched: notifyUserSwitched,
      onSignOut: endSession,
    });
  const active = accounts.find(a => a.isActive);
  const firstLoad = loading && accounts.length === 0;

  const openSettings = useCallback(() => {
    if (blockIfRecording()) return;
    onClose();
    router.push(hrefs.settings);
  }, [blockIfRecording, onClose, router]);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Accounts on this device"
      testID="home-accounts"
    >
      {firstLoad ? (
        <ActivityIndicator
          color={roles.accentPrimary}
          testID="home-accounts-loading"
        />
      ) : (
        accounts.map(account => (
          <ListRow
            key={account.userId}
            leading={<Avatar initials={account.initials} />}
            title={account.displayName}
            subtitle={
              account.email !== account.displayName ? account.email : undefined
            }
            trailing={
              switchingUserId === account.userId ? (
                <ActivityIndicator color={roles.accentPrimary} />
              ) : account.isActive ? (
                <Check size={controlSizes.icon24} color={roles.accentPrimary} />
              ) : null
            }
            selected={account.isActive}
            onPress={() => void switchTo(account.userId)}
            accessibilityLabel={
              account.isActive
                ? `${account.displayName}, signed in`
                : `Switch to ${account.displayName}`
            }
            testID={`home-account-${account.userId}`}
          />
        ))
      )}
      <ListRow
        icon={UserPlus}
        title="Add account"
        subtitle={
          firstLoad
            ? undefined
            : `${accountCount} of ${MAX_DEVICE_ACCOUNTS} on this device`
        }
        disabled={hasAccountLimit}
        onPress={addAccount}
        testID="home-accounts-add"
      />
      <ListRow
        icon={Gear}
        title="Settings"
        trailing="chevron"
        onPress={openSettings}
        testID="home-accounts-settings"
      />
      <ListRow
        icon={SignOut}
        title={ACCOUNT_SIGN_OUT_LABEL}
        subtitle={active?.displayName}
        onPress={() => void signOut()}
        testID="home-accounts-log-out"
      />
    </BottomSheet>
  );
}
