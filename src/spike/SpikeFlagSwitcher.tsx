import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import { SPIKE_FLAG_META, toggleSpikeFlag, useSpikeFlags } from './m4aSpike';

/**
 * SPIKE (#176) — on-screen debug toggles for the m4a-vs-segment-manifest
 * experiments, rendered on the Record screen so the flags can be flipped on a
 * device without rebuilding. Dev-only (hidden in production) and deleted with
 * the spike branch's decision. See `docs/spikes/176-m4a-vs-segment-manifest.md`.
 */
export function SpikeFlagSwitcher() {
  const flags = useSpikeFlags();

  if (!(globalThis as { __DEV__?: boolean }).__DEV__) return null;

  return (
    <View style={styles.container} accessibilityLabel="Spike #176 debug flags">
      <Text style={styles.title}>Spike #176 debug</Text>
      <View style={styles.row}>
        {SPIKE_FLAG_META.map(({ key, label }) => {
          const on = flags[key];
          return (
            <Pressable
              key={key}
              onPress={() => toggleSpikeFlag(key)}
              style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
              accessibilityRole="switch"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${label} ${on ? 'on' : 'off'}`}
              testID={`spike-flag-${key}`}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {label}: {on ? 'ON' : 'OFF'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
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
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  chip: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.full,
    borderWidth: 1,
  },
  chipOff: {
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  chipOn: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  chipText: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
  },
  chipTextOn: {
    color: theme.colors.primaryForeground,
  },
});
