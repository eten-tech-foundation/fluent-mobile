import React from 'react';
import { SyncStatus } from '../../utils/syncStatusState';
import { PageHeaderSyncButton } from '../ui/PageHeaderSyncButton';
import { AccountInitialsButton } from '../ui/AccountInitialsButton';
import { theme } from '../../theme';
import { AppHeader, HeaderBackButton } from './AppHeader';

interface DraftingHeaderProps {
  title: string;
  onBack: () => void;
  syncStatus?: SyncStatus;
  onSyncPress?: () => void;
  showAccountIndicator?: boolean;
  accountFirstName?: string;
  accountLastName?: string;
  accountEmail?: string;
  onAccountPress?: () => void;
}

export function DraftingHeader({
  title,
  onBack,
  syncStatus,
  onSyncPress,
  showAccountIndicator = false,
  accountFirstName,
  accountLastName,
  accountEmail,
  onAccountPress,
}: DraftingHeaderProps) {
  return (
    <AppHeader
      tone="plain"
      border="hairline"
      title={title}
      titleAlign="center"
      left={<HeaderBackButton onPress={onBack} />}
      right={
        <>
          {syncStatus && onSyncPress ? (
            <PageHeaderSyncButton
              syncStatus={syncStatus}
              onPress={onSyncPress}
              cloudColor={theme.colors.foreground}
            />
          ) : null}
          {showAccountIndicator && onAccountPress ? (
            <AccountInitialsButton
              firstName={accountFirstName}
              lastName={accountLastName}
              email={accountEmail}
              onPress={onAccountPress}
            />
          ) : null}
        </>
      }
    />
  );
}
