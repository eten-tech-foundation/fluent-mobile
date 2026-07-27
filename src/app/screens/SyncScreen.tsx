import { theme } from '../../theme';
import { useCallback, useEffect, useState } from 'react';
import { useSync } from '../../hooks/useSync';
import { SyncPageStatus } from '../../types/sync/types';
import { useNavigation } from '@react-navigation/native';
import { usePreferences } from '../../hooks/usePreferences';
import { useConnectivity } from '../../hooks/useConnectivity';
import {
  loadPendingUploadCount,
  usePendingUploads,
} from '../../hooks/usePendingUploads';
import { useRetryFailedUploads } from '../../hooks/useRetryFailedUploads';
import { SettingsToggleRow } from '../../components/ui/SettingsListRow';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { UploadProgressBar } from '../../components/ui/UploadProgressBar';
import { StackScreenHeader } from '../../components/layout/StackScreenHeader';
import { SyncStatusIndicator } from '../../components/ui/SyncStatusIndicator';
import { CloudSyncStatusIcon } from '../../components/ui/CloudSyncStatusIcon';
import { SyncActionControls } from '../../components/ui/SyncActionControls';
import { formatSyncStatusLabel } from '../../utils/syncStatusState';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

// TODO(#150): status/uploadedChapters/totalChapters/nextRetryAt are mock
// state until the upload orchestrator owns them. Live uploadProgress from
// #101 session events overrides the mock counts while a pass is in flight.
export default function SyncScreen() {
  const navigation = useNavigation();

  const [totalChapters] = useState(17);
  const [uploadedChapters] = useState(14);
  const [refreshKey, setRefreshKey] = useState(0);
  const [nextRetryAt] = useState<Date | undefined>(
    new Date(Date.now() + 23 * 60 * 60 * 1000),
  );
  const [status, setStatus] = useState<SyncPageStatus>('pending');

  const { isOnline, isWifi } = useConnectivity();
  const { uploadOverCellular, setUploadOverCellular } = usePreferences();
  const {
    hasPendingUploads,
    hasFailedUploads,
    failedCount,
    isUploading,
    uploadProgress,
  } = usePendingUploads(refreshKey);
  const { retryFailedUploads, isRetrying, lastError } = useRetryFailedUploads();
  const effectivelyOnline = isOnline && (isWifi || uploadOverCellular);
  const cellularBlocked = isOnline && !isWifi && !uploadOverCellular;

  // Once the real sync finishes, re-check the pending count directly
  // (rather than relying on hasPendingUploads above, which only refetches
  // when refreshKey changes and could be stale for a tick) and transition
  // to 'uploadComplete' if nothing's left, or back to 'pending' if some
  // remain (e.g. partial failure, cellular gate).
  //
  // NOTE: 'allComplete' is NOT reachable from here. Per #149 it requires
  // "no downloads pending" too, and there's no download-queue signal to
  // check yet (that section is still a TODO). It'll stay dead code until
  // that integration exists.
  const { triggerSync, isSyncing } = useSync({
    onSyncComplete: async () => {
      setRefreshKey(key => key + 1);
      const count = await loadPendingUploadCount();
      setStatus(count > 0 ? 'pending' : 'uploadComplete');
    },
    onError: () => {
      setStatus('pending');
    },
  });

  useEffect(() => {
    if (status === 'syncing' && cellularBlocked) {
      setStatus('paused');
    }
  }, [status, cellularBlocked]);

  useEffect(() => {
    if (isUploading || isRetrying) {
      setStatus('syncing');
    }
  }, [isUploading, isRetrying]);

  /**
   * Lovable Sync page "Sync Now" — also the #101 retry affordance.
   * Re-runs the recording upload worker; metadata sync still runs alongside.
   */
  const runSyncNow = useCallback(async () => {
    if (cellularBlocked) {
      return;
    }
    setStatus('syncing');
    // Fire-and-forget metadata sync (existing Sync Now behavior).
    void triggerSync();
    // #101: re-run upload worker for pending/failed takes (Lovable Sync Now).
    const result = await retryFailedUploads();
    setRefreshKey(key => key + 1);
    if (result && result.failed === 0) {
      const remaining = await loadPendingUploadCount();
      setStatus(remaining > 0 ? 'pending' : 'uploadComplete');
    } else if (!isUploading) {
      setStatus('pending');
    }
  }, [cellularBlocked, triggerSync, retryFailedUploads, isUploading]);

  // TODO(#150): invoke upload-engine pause.
  const handlePause = useCallback(() => {
    setStatus('paused');
  }, []);

  // TODO(#150): invoke upload-engine resume (distinct from Sync Now pause-window clear).
  const handleResume = useCallback(() => {
    void runSyncNow();
  }, [runSyncNow]);

  // TODO(#150): invoke upload-engine cancel / clear pause window.
  const handleCancel = useCallback(() => {
    setStatus('pending');
  }, []);

  const progressUploaded = uploadProgress?.completed ?? uploadedChapters;
  const progressTotal = uploadProgress?.total ?? totalChapters;

  return (
    <ScreenContainer edges={['bottom']}>
      <StackScreenHeader title="Sync" onBack={() => navigation.goBack()} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.statusSection}>
          <SyncStatusIndicator
            status={status}
            isOnline={effectivelyOnline}
            hasPendingUploads={hasPendingUploads}
            hasFailedUploads={hasFailedUploads}
            isUploading={isUploading || isRetrying}
          />

          {renderStatusLine(
            status,
            effectivelyOnline,
            hasPendingUploads,
            hasFailedUploads,
            failedCount,
            isUploading || isRetrying,
          )}
          {lastError ? (
            <Text style={styles.errorText} testID="sync-retry-error">
              {lastError}
            </Text>
          ) : null}
        </View>

        <View style={styles.uploadSection}>
          {renderSecondaryContent(
            status,
            progressUploaded,
            progressTotal,
            nextRetryAt,
          )}
        </View>
        <View style={styles.controlsSection}>
          <SyncActionControls
            status={status}
            onPause={handlePause}
            onResume={handleResume}
            onCancel={handleCancel}
            onSyncNow={() => {
              void runSyncNow();
            }}
            syncNowDisabled={cellularBlocked}
            busy={isSyncing || isRetrying || isUploading}
          />
        </View>
        {/*
          TODO: render the already-drafted downloads void section here
          once its component is available. Per #149, it renders below
          the action controls, and both this section and the
          "Upload complete" state can be visible simultaneously.
        */}
        <View style={styles.cellularSection}>
          <SettingsToggleRow
            title="Upload/Download over cellular"
            subtitle="Use mobile data to upload recordings when WiFi isn't available."
            value={uploadOverCellular}
            onValueChange={setUploadOverCellular}
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

/**
 * Status copy mirrors Lovable Sync page (`tmp/lovable-ux/page-sync.json` /
 * `xT` map in lovable.js): Syncing… / Online · upload pending / etc.
 * Failed uploads reuse pending chrome with a failure detail + Sync Now retry.
 */
function renderStatusLine(
  status: SyncPageStatus,
  isOnline: boolean,
  hasPendingUploads: boolean,
  hasFailedUploads: boolean,
  failedCount: number,
  isUploading: boolean,
) {
  if (status === 'syncing' || isUploading) {
    return (
      <>
        <Text style={styles.statusTitle}>Syncing…</Text>
        <Text style={styles.statusSubtitle}>
          Uploading your recordings to Fluent.
        </Text>
      </>
    );
  }

  if (hasFailedUploads && isOnline) {
    return (
      <>
        <Text style={styles.statusTitle}>Online · upload pending</Text>
        <Text style={styles.statusSubtitle}>
          {formatSyncStatusLabel('online_failed', { failedCount })}
        </Text>
      </>
    );
  }

  if (hasPendingUploads) {
    return (
      <>
        <Text style={styles.statusTitle}>
          {isOnline ? 'Online · upload pending' : 'Offline · upload pending'}
        </Text>
        <Text style={styles.statusSubtitle}>
          {isOnline
            ? 'Connected to Fluent. Work will upload shortly.'
            : 'Saved on this device. Will sync when Fluent is reachable.'}
        </Text>
        {!isOnline && (
          <CantReachFluentPill hasPendingUploads={hasPendingUploads} />
        )}
      </>
    );
  }

  return (
    <>
      <Text style={styles.statusTitle}>
        {isOnline ? 'Online · all synced' : 'Offline · nothing pending'}
      </Text>
      <Text style={styles.statusSubtitle}>
        {isOnline
          ? 'All work has been uploaded to Fluent.'
          : 'No connection to Fluent. Nothing waiting to upload.'}
      </Text>
      {!isOnline && (
        <CantReachFluentPill hasPendingUploads={hasPendingUploads} />
      )}
    </>
  );
}

// Small version of the same crossed-cloud icon used in the main indicator
// (see SyncStatusIndicator's offline+nothing-pending note).
function CantReachFluentPill({
  hasPendingUploads,
}: {
  hasPendingUploads: boolean;
}) {
  return (
    <View style={styles.pill}>
      <CloudSyncStatusIcon
        status={hasPendingUploads ? 'offline_pending' : 'offline_synced'}
        size={16}
        cloudColor={theme.colors.mutedForeground}
        decorative
      />
      <Text style={styles.pillText}>Can't reach Fluent</Text>
    </View>
  );
}

// State-specific content shown below the status line. 'pending' has
// nothing extra — the status line above already says everything #149
// asks for in that state.
function renderSecondaryContent(
  status: SyncPageStatus,
  uploadedChapters: number,
  totalChapters: number,
  nextRetryAt: Date | undefined,
) {
  switch (status) {
    case 'syncing':
      return (
        <UploadProgressBar
          uploadedChapters={uploadedChapters}
          totalChapters={totalChapters}
        />
      );

    case 'paused':
      return (
        <>
          <UploadProgressBar
            uploadedChapters={uploadedChapters}
            totalChapters={totalChapters}
            frozen
          />
          <Text style={styles.pausedLabel}>Paused</Text>
          <Text style={styles.retryText}>{formatRetryText(nextRetryAt)}</Text>
        </>
      );

    case 'pending':
      return (
        <UploadProgressBar
          uploadedChapters={uploadedChapters}
          totalChapters={totalChapters}
        />
      );

    case 'uploadComplete':
      return <Text style={styles.completeLabel}>Upload complete</Text>;

    case 'allComplete':
      return <Text style={styles.completeLabel}>All synced</Text>;

    default:
      return null;
  }
}

function formatRetryText(nextRetryAt?: Date): string {
  if (!nextRetryAt) {
    return '';
  }

  const diffMs = nextRetryAt.getTime() - Date.now();
  if (diffMs <= 0) {
    return 'Resumes automatically shortly.';
  }

  const totalMinutes = Math.round(diffMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `Resumes automatically in ${minutes}m.`;
  }

  return `Resumes automatically in ${hours}h ${minutes}m.`;
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    alignItems: 'center',
    paddingBottom: theme.spacing.lg,
  },
  statusSection: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.cardBackground,
  },

  uploadSection: {
    width: '100%',
    borderBottomWidth: 1,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.cardBackground,
  },

  controlsSection: {
    width: '90%',
    paddingVertical: theme.spacing.lg,
  },

  cellularSection: {
    width: '100%',
    backgroundColor: theme.colors.cardBackground,
    overflow: 'hidden',
  },
  pausedLabel: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
  },
  statusTitle: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
    textAlign: 'center',
  },
  statusSubtitle: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
    textAlign: 'center',
  },
  errorText: {
    marginTop: theme.spacing.sm,
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.destructive,
    textAlign: 'center',
  },
  retryText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.mutedForeground,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pillText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.foreground,
  },
  completeLabel: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
    textAlign: 'center',
    paddingVertical: theme.spacing.lg,
  },
});
