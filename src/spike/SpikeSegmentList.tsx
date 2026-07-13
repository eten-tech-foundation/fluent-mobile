import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import type { PlaybackSegment } from '../hooks/useSegmentedAudioPlayback';

/**
 * SPIKE (#176) — on-screen list of the audio segments backing Review playback,
 * so the segment-manifest experiment is visible on-device: a multi-segment take
 * (segmented playback) shows every segment, while a single committed file shows
 * exactly one row. The row overlapping the current playback position is
 * highlighted so cross-segment advancement can be watched live. Dev-only and
 * deleted with the spike branch's decision.
 * See `docs/spikes/176-m4a-vs-segment-manifest.md`.
 */
export function SpikeSegmentList({
  segments,
  positionMs,
}: {
  segments: PlaybackSegment[] | null;
  positionMs: number;
}) {
  const activeIndex = useMemo(
    () => activeSegmentIndex(segments, positionMs),
    [segments, positionMs],
  );

  if (!(globalThis as { __DEV__?: boolean }).__DEV__) return null;
  if (!segments || segments.length === 0) return null;

  return (
    <View style={styles.container} accessibilityLabel="Spike #176 segment list">
      <Text style={styles.title}>Segments ({segments.length})</Text>
      {segments.map((segment, index) => {
        const active = index === activeIndex;
        return (
          <View
            key={`${segment.uri}-${index}`}
            style={[styles.row, active && styles.rowActive]}
            testID={`spike-segment-${index}`}
          >
            <Text
              style={[styles.name, active && styles.textActive]}
              numberOfLines={1}
              ellipsizeMode="head"
            >
              {index + 1}. {fileName(segment.uri)}
            </Text>
            <Text style={[styles.duration, active && styles.textActive]}>
              {formatDuration(segment.durationMs)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Index of the segment overlapping `positionMs`, or -1 when none/idle. */
function activeSegmentIndex(
  segments: PlaybackSegment[] | null,
  positionMs: number,
): number {
  if (!segments || segments.length === 0) return -1;
  let start = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const end = start + Math.max(0, segments[i]!.durationMs);
    if (positionMs >= start && positionMs < end) return i;
    start = end;
  }
  // Position at/after the end clamps to the last segment.
  return segments.length - 1;
}

function fileName(uri: string): string {
  const withoutQuery = uri.split('?')[0] ?? uri;
  const parts = withoutQuery.split('/');
  return parts[parts.length - 1] || withoutQuery;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.cardBackground,
  },
  title: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.mutedForeground,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.background,
  },
  rowActive: {
    backgroundColor: theme.colors.primary,
  },
  name: {
    flex: 1,
    fontSize: theme.typography.sizes.xs,
    color: theme.colors.foreground,
  },
  duration: {
    fontSize: theme.typography.sizes.xs,
    fontVariant: ['tabular-nums'],
    color: theme.colors.mutedForeground,
  },
  textActive: {
    color: theme.colors.primaryForeground,
  },
});
