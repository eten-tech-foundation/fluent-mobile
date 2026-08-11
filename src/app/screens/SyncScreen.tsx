import { theme } from '../../theme';
import { useCallback, useState } from 'react';
import { useSync } from '../../hooks/useSync';
import { useNavigation } from '@react-navigation/native';
import { usePreferences } from '../../hooks/usePreferences';
import { useConnectivity } from '../../hooks/useConnectivity';
import { usePendingUploads } from '../../hooks/usePendingUploads';
import { useUploadSessionState } from '../../hooks/useUploadSessionState';
import { SettingsToggleRow } from '../../components/ui/SettingsListRow';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { UploadProgressBar } from '../../components/ui/UploadProgressBar';
import { StackScreenHeader } from '../../components/layout/StackScreenHeader';
import { SyncStatusIndicator } from '../../components/ui/SyncStatusIndicator';
import { CloudSyncStatusIcon } from '../../components/ui/CloudSyncStatusIcon';
import { SyncActionControls } from '../../components/ui/SyncActionControls';
import { DownloadProgressSection } from '../../components/ui/DownloadProgressSection';
import { useDownloadQueue } from '../../hooks/useDownloadQueue';
import { formatSyncStatusLabel } from '../../utils/syncStatusState';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../types/navigation/types';
import { SyncPageStatus } from '../../types/sync/types';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type SyncScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Sync'>;

export default function SyncScreen() {
  const navigation = useNavigation<SyncScreenNavigationProp>();
  const { snapshot, hasDownloads } = useDownloadQueue();

  const [refreshKey, setRefreshKey] = useState(0);

  const { isOnline, isWifi } = useConnectivity();
  const { uploadOverCellular, setUploadOverCellular } = usePreferences();
  const {
    hasPendingUploads,
    hasFailedUploads,
    failedCount,
    pendingChapterCount,
    isUploading,
    uploadProgress,
  } = usePendingUploads(refreshKey);
  const {
    pageStatus,
    progressUploaded,
    progressTotal,
    nextRetryAt,
    sessionError,
    isControlPending,
    isStartControlPending,
    pause,
    cancel,
    syncNowUploads,
  } = useUploadSessionState({
    hasPendingUploads,
    hasFailedUploads,
    uploadProgress,
  });

  const effectivelyOnline = isOnline && (isWifi || uploadOverCellular);
  const cellularBlocked = isOnline && !isWifi && !uploadOverCellular;

  const { triggerSync, isSyncing } = useSync({
    onSyncComplete: () => {
      setRefreshKey(key => key + 1);
    },
  });

  const runSyncNow = useCallback(async () => {
    if (cellularBlocked) {
      return;
    }

    if (!isSyncing) {
      void triggerSync();
    }
    await syncNowUploads();
    setRefreshKey(key => key + 1);
  }, [cellularBlocked, isSyncing, triggerSync, syncNowUploads]);

  const handlePause = useCallback(async () => {
    await pause();
  }, [pause]);

  const handleResume = useCallback(async () => {
    await runSyncNow();
  }, [runSyncNow]);

  const handleCancel = useCallback(async () => {
    await cancel();
    setRefreshKey(key => key + 1);
  }, [cancel]);

  const status = pageStatus;
  /** Show pause/cancel while uploading; prefer paused once user pauses. */
  const controlStatus: SyncPageStatus =
    status === 'paused'
      ? 'paused'
      : isUploading || status === 'syncing'
      ? 'syncing'
      : status;
  const startBusy =
    controlStatus === 'paused' ? false : isStartControlPending || isUploading;

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
            isUploading={isUploading}
          />

          {renderStatusLine(
            status,
            effectivelyOnline,
            hasPendingUploads,
            hasFailedUploads,
            failedCount,
            isUploading,
          )}
          {sessionError ? (
            <Text style={styles.errorText} testID="sync-retry-error">
              {sessionError}
            </Text>
          ) : null}
        </View>

        <View style={styles.uploadSection}>
          {renderSecondaryContent(
            status,
            progressUploaded,
            progressTotal,
            nextRetryAt,
            isUploading,
            pendingChapterCount,
            hasPendingUploads,
            hasFailedUploads,
          )}
        </View>
        <View style={styles.controlsSection}>
          <SyncActionControls
            status={controlStatus}
            onPause={() => {
              void handlePause();
            }}
            onResume={() => {
              void handleResume();
            }}
            onCancel={() => {
              void handleCancel();
            }}
            onSyncNow={() => {
              void runSyncNow();
            }}
            syncNowDisabled={cellularBlocked}
            busy={startBusy}
            controlPending={isControlPending}
          />
        </View>
        {hasDownloads ? (
          <DownloadProgressSection
            snapshot={snapshot}
            onManageDownloads={() => {
              const params =
                snapshot.primaryProjectId !== undefined
                  ? { projectId: snapshot.primaryProjectId }
                  : undefined;
              navigation.navigate('PrepareForOffline', params);
            }}
          />
        ) : null}
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

function renderSecondaryContent(
  status: SyncPageStatus,
  uploadedChapters: number,
  totalChapters: number,
  nextRetryAt: Date | undefined,
  isUploading: boolean,
  pendingChapterCount: number,
  hasPendingUploads: boolean,
  hasFailedUploads: boolean,
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
      if (!hasPendingUploads && !hasFailedUploads) {
        return null;
      }
      return (
        <UploadProgressBar
          uploadedChapters={isUploading ? uploadedChapters : 0}
          totalChapters={
            isUploading && totalChapters > 0
              ? totalChapters
              : pendingChapterCount
          }
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
