import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Avatar } from '../../../components/ui/Avatar';
import { SyncStatusButton } from '../../../components/ui/SyncStatusButton';
import { useThemedStyles } from '../../../theme/useTheme';
import {
  formatSyncStatusLabel,
  type SyncStatus,
} from '../../../utils/syncStatusState';

const STATUSES: SyncStatus[] = [
  'online_synced',
  'online_syncing',
  'online_uploading',
  'online_pending',
  'online_needs_sync',
  'online_failed',
  'offline_synced',
  'offline_pending',
];
const FAILED_ERROR = 'Server busy.';

/**
 * Home's header: the account avatar and the sync cloud. Tap the cloud to
 * step through the sync states, as uploads and connectivity change them.
 */
export function HomeHeaderEntry() {
  const [step, setStep] = useState(0);
  const [opened, setOpened] = useState<string | null>(null);
  const status = STATUSES[step % STATUSES.length] ?? 'online_synced';
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.md },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    status: { ...t.type.meta, color: t.roles.fgSecondary },
  }));

  return (
    <View style={styles.demo}>
      <View style={styles.header}>
        <Avatar
          initials="JS"
          accessibilityLabel="Jordan Smith. Accounts"
          onPress={() => setOpened('Accounts')}
        />
        <SyncStatusButton
          status={status}
          failedErrorText={FAILED_ERROR}
          onPress={() => {
            setStep(s => s + 1);
            setOpened('Sync');
          }}
        />
      </View>
      <Text style={styles.status}>
        {opened ? `Opened ${opened}. ` : ''}
        {formatSyncStatusLabel(status, { failedErrorText: FAILED_ERROR })}
      </Text>
    </View>
  );
}
