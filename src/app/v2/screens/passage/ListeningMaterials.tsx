import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { TrackRow } from '../../../../components/ui/TrackRow';
import { useThemedStyles } from '../../../../theme/useTheme';
import { STEPS } from './steps';

/**
 * The listening materials as Track rows. As the player opens they fade and
 * sink, so the light page reads as turning into the Hardware panel rising
 * under it.
 */
export function ListeningMaterials({
  reference,
  progress,
  hidden,
  onOpen,
}: {
  reference: string;
  progress: SharedValue<number>;
  hidden: boolean;
  /** Opens the player on that material's page. */
  onOpen: (step: number) => void;
}) {
  const sinkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.2, 0.55], [1, 0], 'clamp'),
    transform: [
      { translateY: interpolate(progress.value, [0, 0.6], [0, 32], 'clamp') },
    ],
  }));
  const styles = useThemedStyles(t => ({
    page: { flex: 1 },
    list: { paddingHorizontal: t.spacing.xl, paddingBottom: t.spacing.xxl },
    head: { paddingTop: t.spacing.xl, paddingBottom: t.spacing.md },
    heading: { ...t.type.title, color: t.roles.fgPrimary },
    meta: { ...t.type.meta, color: t.roles.fgSecondary },
  }));
  return (
    <Animated.View
      style={[styles.page, sinkStyle]}
      pointerEvents={hidden ? 'none' : 'auto'}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.head}>
          <Text style={styles.heading} accessibilityRole="header">
            Listening materials
          </Text>
          <Text style={styles.meta}>Step audio isn't connected yet</Text>
        </View>
        {/* Nothing plays yet, so every step rests unheard with no button. */}
        {STEPS.map((name, step) => (
          <TrackRow
            key={name}
            title={name}
            meta={reference}
            listened={0}
            onPress={() => onOpen(step)}
            testID={`passage-step-${step}`}
          />
        ))}
      </ScrollView>
    </Animated.View>
  );
}
