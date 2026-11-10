import React from 'react';
import {
  SYNC_STATUS_HELD_FOR_DRAFTING_CAPTION,
  SyncStatus,
} from '../../utils/syncStatusState';
import { PageHeaderSyncButton } from '../ui/PageHeaderSyncButton';
import { AccountInitialsButton } from '../ui/AccountInitialsButton';
import { theme } from '../../theme';
import { AppHeader, HeaderBackButton } from './AppHeader';

interface DraftingHeaderProps {
  title: string;
  onBack: () => void;
  syncStatus?: SyncStatus;
  failedErrorText?: string | null;
  heldForDrafting?: boolean;
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
  failedErrorText,
  heldForDrafting,
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
      subtitle={
        syncStatus === 'online_pending' && heldForDrafting
          ? SYNC_STATUS_HELD_FOR_DRAFTING_CAPTION
          : undefined
      }
      titleAlign="center"
      left={<HeaderBackButton onPress={onBack} testID="drafting-header-back" />}
      right={
        <>
          {syncStatus && onSyncPress ? (
            <PageHeaderSyncButton
              syncStatus={syncStatus}
              failedErrorText={failedErrorText}
              heldForDrafting={heldForDrafting}
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
