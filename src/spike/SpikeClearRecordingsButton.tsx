import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, ToastAndroid } from 'react-native';
import { theme } from '../theme';
import { clearAllRecordings } from './m4aSpike';

/**
 * SPIKE (#176) — dev-only debug button that wipes ALL recordings (DB rows,
 * on-disk files, and paused-take markers). For resetting device state between
 * kill-test / segment-playback runs. Hidden in production and deleted with the
 * spike branch's decision. See `docs/spikes/176-m4a-vs-segment-manifest.md`.
 */
export function SpikeClearRecordingsButton({
  onCleared,
}: {
  onCleared?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  if (!(globalThis as { __DEV__?: boolean }).__DEV__) return null;

  function confirm() {
    Alert.alert(
      'Clear ALL recordings?',
      'Deletes every recording (DB rows + files) and any in-flight takes on this device. Debug only — cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear all',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const rows = await clearAllRecordings();
              ToastAndroid.show(
                `Cleared ${rows} recording${
                  rows === 1 ? '' : 's'
                }. Reopen the verse to refresh.`,
                ToastAndroid.LONG,
              );
              onCleared?.();
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <Pressable
      onPress={confirm}
      disabled={busy}
      style={[styles.button, busy && styles.buttonBusy]}
      accessibilityRole="button"
      accessibilityLabel="Clear all recordings (debug)"
      testID="spike-clear-recordings"
    >
      <Text style={styles.text}>
        {busy ? 'Clearing…' : 'Clear all recordings (debug)'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.destructive,
    backgroundColor: theme.colors.background,
  },
  buttonBusy: {
    opacity: 0.6,
  },
  text: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.destructive,
  },
});
