import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { ArrowDown, PlayFill } from '../../../../components/ui/icons';
import { RoundButton } from '../../../../components/ui/RoundButton';
import type { usePassage } from '../../../../hooks/usePassage';
import { useThemedStyles } from '../../../../theme/useTheme';
import { RecordAction } from './RecordAction';
import { type Ready } from './steps';
import { takesLine } from './Takes';

/**
 * Under the hero's script: the takes line, Listen and Record (plus Download
 * while the text isn't on the phone), and the grip that opens the player.
 * Gone before the growing script reaches them.
 */
export function HeroActions({
  passage,
  downloadState,
  progress,
  expanded,
  top,
  onLayout,
  onListen,
  onRecord,
  onDownload,
}: {
  passage: Ready;
  downloadState: ReturnType<typeof usePassage>['downloadState'];
  progress: SharedValue<number>;
  expanded: boolean;
  top: number;
  /** The row's height, for the sheet's layout. */
  onLayout: (height: number) => void;
  onListen: () => void;
  onRecord: () => void;
  onDownload: () => void;
}) {
  const styles = useThemedStyles(t => ({
    actions: {
      position: 'absolute',
      left: t.spacing.xl,
      right: t.spacing.xl,
      gap: t.spacing.lg,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: t.spacing.md,
    },
    primary: { paddingHorizontal: t.spacing.xl },
    meta: {
      ...t.type.meta,
      color: t.roles.fgSecondary,
      textAlign: 'center',
    },
    handle: { alignItems: 'center', paddingVertical: t.spacing.sm },
    grip: {
      width: 36,
      height: 4,
      borderRadius: t.radius.full,
      backgroundColor: t.roles.fgSecondary,
    },
  }));
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.12], [1, 0], 'clamp'),
    transform: [
      {
        translateY: interpolate(progress.value, [0, 0.4], [0, 24], 'clamp'),
      },
    ],
  }));

  return (
    <Animated.View
      style={[styles.actions, { top }, style]}
      pointerEvents={expanded ? 'none' : 'auto'}
      importantForAccessibility={expanded ? 'no-hide-descendants' : 'auto'}
      onLayout={e => onLayout(Math.round(e.nativeEvent.layout.height))}
    >
      <Text style={styles.meta} testID="passage-takes-meta">
        {takesLine(passage)}
      </Text>
      {/* Like a music app: one labelled primary, plain circles beside. */}
      <View style={styles.row}>
        <RoundButton
          variant="flat"
          icon={PlayFill}
          label="Listen"
          accessibilityLabel="Listen"
          onPress={onListen}
          style={styles.primary}
          testID="passage-listen"
        />
        <RecordAction
          accessibilityLabel={
            passage.takes.length > 0 ? 'Record a take' : 'Record'
          }
          onPress={onRecord}
          testID="passage-record"
        />
        {passage.downloaded ? null : (
          <RoundButton
            variant="flat"
            icon={ArrowDown}
            accessibilityLabel={
              downloadState === 'downloading'
                ? 'Downloading the text'
                : 'Download the text'
            }
            onPress={onDownload}
            disabled={downloadState === 'downloading'}
            testID="passage-download"
          />
        )}
      </View>
      <Pressable
        onPress={onListen}
        accessibilityRole="button"
        accessibilityLabel="Open the full player"
        hitSlop={12}
        style={styles.handle}
        testID="passage-handle"
      >
        <View style={styles.grip} />
      </Pressable>
    </Animated.View>
  );
}
