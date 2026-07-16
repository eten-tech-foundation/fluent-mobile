import { useState } from 'react';
import { theme } from '../../theme';
import { useSync } from '../../hooks/useSync';
import { SyncPageStatus } from '../../types/sync/types';
import { useNavigation } from '@react-navigation/native';
import { getPendingUploadCount } from '../../db/queries';
import { useConnectivity } from '../../hooks/useConnectivity';
import { usePendingUploads } from '../../hooks/usePendingUploads';
import { ChevronLeft, Pause, Play, X } from 'lucide-react-native';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { UploadProgressBar } from '../../components/ui/UploadProgressBar';
import { SyncStatusIndicator } from '../../components/ui/SyncStatusIndicator';
import { CloudSyncStatusIcon } from '../../components/ui/CloudSyncStatusIcon';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  headerLayout,
  iconSizes,
  listIconStrokeWidth,
  touchHitSlop,
} from '../../theme/iconSpecs';

// TODO(#150): status/uploadedChapters/totalChapters/nextRetryAt are mock
// state for the UI-only #149 ticket. Replace with real derivation once
export default function SyncScreen() {
  const navigation = useNavigation();

  const [totalChapters] = useState(17);
  const [uploadedChapters] = useState(14);
  const [refreshKey, setRefreshKey] = useState(0);
  const [nextRetryAt] = useState<Date | undefined>(undefined);
  const [status, setStatus] = useState<SyncPageStatus>('pending');

  const { isOnline } = useConnectivity();
  const { hasPendingUploads } = usePendingUploads(refreshKey);

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
  const { triggerSync } = useSync({
    onSyncComplete: async () => {
      setRefreshKey(key => key + 1);
      const count = await getPendingUploadCount();
      setStatus(count > 0 ? 'pending' : 'uploadComplete');
    },
  });

  return (
    <ScreenContainer edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={touchHitSlop}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft
            size={iconSizes.header}
            color={theme.colors.foreground}
            strokeWidth={listIconStrokeWidth}
          />
        </TouchableOpacity>

        <View style={styles.headerCenterOverlay} pointerEvents="none">
          <Text style={styles.headerTitle} numberOfLines={1}>
            Sync
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.statusSection}>
          <SyncStatusIndicator
            status={status}
            isOnline={isOnline}
            hasPendingUploads={hasPendingUploads}
          />

          {renderStatusLine(status, isOnline, hasPendingUploads)}
        </View>

        <View style={styles.uploadSection}>
          {renderSecondaryContent(
            status,
            uploadedChapters,
            totalChapters,
            nextRetryAt,
          )}
        </View>
        {/*
          PREVIEW ONLY, not #151. These buttons just flip local mock
          `status` so we can visually confirm the icon/label changes per
          state render correctly. #151 replaces this block entirely with
          real Pause/Resume/Cancel/Sync Now wired to #150's engine.
        */}
        <View style={styles.controlsSection}>
          {renderMockControls(status, setStatus, triggerSync)}
        </View>
        {/*
          TODO: render the already-drafted downloads queue section here
          once its component is available. Per #149, it renders below
          the action controls, and both this section and the
          "Upload complete" state can be visible simultaneously.
        */}
      </ScrollView>
    </ScreenContainer>
  );
}

// Shown for every state except 'syncing', which gets its own "Syncing..."
// wording per the mockups. Otherwise it's the same connectivity+pending
// text regardless of whether the page happens to be paused, pending, or
// showing a completion label below — that's the fix for the gap where
// uploadComplete/allComplete never showed this line at all.
function renderStatusLine(
  status: SyncPageStatus,
  isOnline: boolean,
  hasPendingUploads: boolean,
) {
  if (status === 'syncing') {
    return (
      <>
        <Text style={styles.statusTitle}>Syncing...</Text>
        <Text style={styles.statusSubtitle}>
          Uploading your recordings to Fluent.
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

// PREVIEW ONLY — see note above. Cancel is assumed to drop the page into
// 'pending' (uploads still queued, nothing actively running); that mapping
// isn't spec'd anywhere, just a reasonable guess for demo purposes.
//
// Only "Sync Now" (pending state) calls the real triggerSync(), so
// there's at least one working manual-sync path until #151 wires up the
// real thing. Pause, Resume, and Cancel remain visual-only — there's no
// real pause/resume/cancel behavior to call yet (that's #150).
function renderMockControls(
  status: SyncPageStatus,
  setStatus: (status: SyncPageStatus) => void,
  triggerSync: () => void,
) {
  switch (status) {
    case 'syncing':
      return (
        <View style={styles.controlsRow}>
          <MockActionButton
            label="Pause"
            Icon={Pause}
            variant="secondary"
            onPress={() => setStatus('paused')}
          />
          <MockActionButton
            label="Cancel"
            Icon={X}
            variant="secondary"
            onPress={() => setStatus('pending')}
          />
        </View>
      );

    case 'paused':
      return (
        <View style={styles.controlsRow}>
          <MockActionButton
            label="Resume"
            Icon={Play}
            variant="secondary"
            onPress={() => setStatus('syncing')}
          />
          <MockActionButton
            label="Cancel"
            Icon={X}
            variant="secondary"
            onPress={() => setStatus('pending')}
          />
        </View>
      );

    case 'pending':
      return (
        <MockActionButton
          label="Sync Now"
          Icon={Play}
          variant="primary"
          fullWidth
          onPress={() => {
            triggerSync();
            setStatus('syncing');
          }}
        />
      );

    case 'uploadComplete':
    case 'allComplete':
    default:
      return null;
  }
}

interface MockActionButtonProps {
  label: string;
  Icon: typeof Pause;
  variant: 'primary' | 'secondary';
  fullWidth?: boolean;
  onPress: () => void;
}

function MockActionButton({
  label,
  Icon,
  variant,
  fullWidth,
  onPress,
}: MockActionButtonProps) {
  const isPrimary = variant === 'primary';

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      style={[
        styles.controlButton,
        isPrimary && styles.controlButtonPrimary,
        fullWidth && styles.controlButtonFullWidth,
      ]}
    >
      <Icon
        size={18}
        color={
          isPrimary ? theme.colors.primaryForeground : theme.colors.foreground
        }
        strokeWidth={listIconStrokeWidth}
      />
      <Text
        style={[
          styles.controlButtonLabel,
          isPrimary && styles.controlButtonLabelPrimary,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
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
  header: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: headerLayout.paddingHorizontal,
    paddingVertical: headerLayout.paddingVertical,
    minHeight: headerLayout.minHeight,
    backgroundColor: theme.colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backButton: {
    borderRadius: theme.radius.full,
    padding: theme.spacing.xs,
    zIndex: 1,
  },
  headerCenterOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: theme.typography.sizes.lg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.foreground,
  },
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  statusSection: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },

  uploadSection: {
    width: '100%',
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },

  controlsSection: {
    width: '100%',
    paddingVertical: theme.spacing.lg,
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
  controlsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: theme.spacing.sm,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
  },
  controlButtonPrimary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  controlButtonFullWidth: {
    width: '100%',
  },
  controlButtonLabel: {
    fontSize: theme.typography.sizes.md,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
  },
  controlButtonLabelPrimary: {
    color: theme.colors.primaryForeground,
  },
});
