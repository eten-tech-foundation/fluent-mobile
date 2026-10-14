import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Headphones, Speech } from 'lucide-react-native';
import { useTheme, useThemedStyles } from '../../theme/useTheme';
import { KeyDeck } from './KeyDeck';
import { Switch } from './Switch';

/** Figma Hardware panel controls row: 80 tall under the 100pt key deck. */
const CONTROLS_HEIGHT = 80;
/** Figma Speaker grill: 9pt holes in rows of 6 · 7 · 6. */
const HOLE_SIZE = 9;
const GRILL_ROWS = [6, 7, 6];

export interface HardwarePanelProps {
  /** The mode's `Key`s; give each `style={{ flex: 1 }}` to share the deck. */
  children: React.ReactNode;
  /** Mode toggle: off is Listen, on is Record. */
  recordMode: boolean;
  onRecordModeChange: (recordMode: boolean) => void;
  /** Locks the mode, e.g. for the whole take while recording. */
  modeLocked?: boolean;
  /** Pads under the controls for the gesture bar. On by default. */
  safeAreaBottom?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Bottom hardware panel (Figma Hardware panel, node 2411:529): the key deck,
 * then the Mode toggle (Switch between Listen and Record icons) and the
 * speaker grill. The screen passes the keys for its mode.
 */
export function HardwarePanel({
  children,
  recordMode,
  onRecordModeChange,
  modeLocked = false,
  safeAreaBottom = true,
  style,
  testID,
}: HardwarePanelProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(t => ({
    panel: { backgroundColor: t.roles.bgDefault },
    controls: {
      height: CONTROLS_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.spacing.md,
      paddingHorizontal: t.spacing.xxl,
    },
    modeToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
    },
  }));

  const iconColor = theme.roles.fgSecondary;
  const iconSize = theme.controlSizes.icon20;

  return (
    <View
      style={[
        styles.panel,
        safeAreaBottom && { paddingBottom: insets.bottom },
        style,
      ]}
      testID={testID}
    >
      <KeyDeck>{children}</KeyDeck>
      <View style={styles.controls}>
        <View style={styles.modeToggle}>
          <Headphones color={iconColor} size={iconSize} />
          <Switch
            value={recordMode}
            onValueChange={onRecordModeChange}
            accessibilityLabel="Record mode"
            disabled={modeLocked}
            testID={testID ? `${testID}-mode` : undefined}
          />
          <Speech color={iconColor} size={iconSize} />
        </View>
        <SpeakerGrill testID={testID ? `${testID}-grill` : undefined} />
      </View>
    </View>
  );
}

/** Decorative: sunken holes in surface/inverse, the same dark as the deck. */
function SpeakerGrill({ testID }: { testID?: string }) {
  const styles = useThemedStyles(t => ({
    grill: { alignItems: 'center', gap: t.spacing.xs },
    row: { flexDirection: 'row', gap: t.spacing.sm },
    hole: {
      width: HOLE_SIZE,
      height: HOLE_SIZE,
      borderRadius: t.radius.full,
      backgroundColor: t.roles.surfaceInverse,
      boxShadow: t.elevation.inset,
    },
  }));

  return (
    <View
      style={styles.grill}
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      {GRILL_ROWS.map((holes, r) => (
        <View key={r} style={styles.row}>
          {Array.from({ length: holes }, (_, i) => (
            <View key={i} style={styles.hole} />
          ))}
        </View>
      ))}
    </View>
  );
}
