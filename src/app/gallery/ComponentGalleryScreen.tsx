import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setMicActive } from '../../audio/micActivity';
import { ScreenContainer } from '../../components/layout/ScreenContainer';
import { StackScreenHeader } from '../../components/layout/StackScreenHeader';
import {
  SettingsSegmentedRow,
  SettingsToggleRow,
} from '../../components/ui/SettingsListRow';
import type { ColorMode } from '../../theme';
import {
  ColorModeScope,
  UiVersionOverride,
  useTheme,
  useThemedStyles,
} from '../../theme/useTheme';
import { galleryEntries } from './entries';

const MODE_OPTIONS: { label: string; value: ColorMode }[] = [
  { label: 'Canvas', value: 'canvas' },
  { label: 'Hardware', value: 'hardware' },
  { label: 'Accent', value: 'accent' },
];

/**
 * Review screen for Next UI components: live demos to tap and feel.
 * Always renders Next, whatever the device's UI version preference.
 * Registered only when `isComponentGalleryEnabled()`; works signed out.
 */
export default function ComponentGalleryScreen() {
  return (
    <UiVersionOverride value="next">
      <Gallery />
    </UiVersionOverride>
  );
}

function Gallery() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [mode, setMode] = useState<ColorMode>('hardware');
  const [simulateRecording, setSimulateRecording] = useState(false);

  // Only touch mic state while simulating, so a real take on the dual-mounted
  // Record tab isn't cleared when the gallery mounts or unmounts.
  useEffect(() => {
    if (!simulateRecording) {
      return;
    }
    setMicActive('gallery-simulation', true);
    return () => setMicActive('gallery-simulation', false);
  }, [simulateRecording]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  }, [router]);

  const styles = useThemedStyles(t => ({
    screen: { flex: 1 },
    content: { padding: t.spacing.lg, gap: t.spacing.xxl },
    card: {
      backgroundColor: t.colors.cardBackground,
      borderRadius: t.radius.sm,
    },
  }));

  // Header and controls stay in Hardware; only the demo stage takes the mode.
  return (
    <ScreenContainer>
      <View style={styles.screen}>
        <StackScreenHeader
          title="Component gallery"
          subtitle="Next UI review"
          onBack={goBack}
          backTestID="gallery-back"
        />
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + theme.spacing.xxl },
          ]}
        >
          <View style={styles.card}>
            <SettingsSegmentedRow
              title="Mode"
              subtitle="Figma color-role mode for the demos below."
              options={MODE_OPTIONS}
              value={mode}
              onValueChange={setMode}
              testID="gallery-mode"
            />
            <SettingsToggleRow
              title="Simulate recording"
              subtitle="Haptics must stay silent while the mic is open."
              value={simulateRecording}
              onValueChange={setSimulateRecording}
              testID="gallery-simulate-recording"
            />
          </View>

          <ColorModeScope value={mode}>
            <DemoStage />
          </ColorModeScope>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

/** The entries on the selected mode's background, read inside the mode scope. */
function DemoStage() {
  const styles = useThemedStyles(t => ({
    stage: {
      backgroundColor: t.roles.bgDefault,
      borderRadius: t.radius.sm,
      padding: t.spacing.lg,
      gap: t.spacing.xxl,
    },
    entry: { gap: t.spacing.md },
    entryHeader: { gap: t.spacing.xs },
    entryName: {
      color: t.roles.fgPrimary,
      fontSize: t.typography.sizes.lg,
      fontWeight: t.typography.weights.semibold,
      includeFontPadding: false,
    },
    entryMeta: {
      color: t.roles.fgSecondary,
      fontSize: t.typography.sizes.sm,
      includeFontPadding: false,
    },
  }));

  return (
    <View style={styles.stage} testID="gallery-stage">
      {galleryEntries.map(entry => (
        <View key={entry.id} style={styles.entry}>
          <View style={styles.entryHeader}>
            <Text style={styles.entryName}>{entry.name}</Text>
            <Text style={styles.entryMeta}>Designed for {entry.modes}</Text>
          </View>
          <entry.Component />
        </View>
      ))}
    </View>
  );
}
