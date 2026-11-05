import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { ArrowDown, PlayFill } from '../../../../components/ui/icons';
import { RoundButton } from '../../../../components/ui/RoundButton';
import type { PassageTake, usePassage } from '../../../../hooks/usePassage';
import { useThemedStyles } from '../../../../theme/useTheme';
import { isRecordingLockedByStage } from '../../../../utils/stageAdvancement';
import { PassageNotices } from './PassageNotices';
import { RecordAction } from './RecordAction';
import { type Ready } from './ready';
import { takesLine } from './Takes';
import type { RecordNotice } from './useRecorder';

/**
 * Under the hero's script: the takes line once something's recorded or
 * waiting, Listen and Record (plus Download
 * while the text isn't on the phone), and the grip that opens the player.
 * Gone before the growing script reaches them.
 */
export function HeroActions({
  passage,
  takes,
  countVerses,
  downloadState,
  progress,
  expanded,
  recordBlocked,
  notices,
  top,
  onLayout,
  onListen,
  onRecord,
  onDownload,
  onOpenClassic,
}: {
  passage: Ready;
  /** The passage's takes, live as they're recorded. */
  takes: PassageTake[];
  /** The takes line counts verses instead of passage takes. */
  countVerses: boolean;
  downloadState: ReturnType<typeof usePassage>['downloadState'];
  progress: SharedValue<number>;
  expanded: boolean;
  /** Why Record can't start; it shows under the takes line, Record off. */
  recordBlocked: string | null;
  notices: RecordNotice[];
  top: number;
  /** The row's height, for the sheet's layout. */
  onLayout: (height: number) => void;
  onListen: () => void;
  onRecord: () => void;
  onDownload: () => void;
  onOpenClassic?: () => void;
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
  const line = takesLine(passage, takes, countVerses);

  return (
    <Animated.View
      style={[styles.actions, { top }, style]}
      pointerEvents={expanded ? 'none' : 'auto'}
      importantForAccessibility={expanded ? 'no-hide-descendants' : 'auto'}
      onLayout={e => onLayout(Math.round(e.nativeEvent.layout.height))}
    >
      {line ? (
        <Text style={styles.meta} testID="passage-takes-meta">
          {line}
        </Text>
      ) : null}
      <PassageNotices
        notices={
          recordBlocked !== null &&
          !notices.some(n => n.message === recordBlocked)
            ? [{ id: 'blocked', message: recordBlocked }, ...notices]
            : notices
        }
        onOpenClassic={onOpenClassic}
        testID="passage-notices"
      />
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
        {isRecordingLockedByStage(passage.assignment) ? null : (
          <RecordAction
            accessibilityLabel={
              takes.length > 0
                ? 'Record a take'
                : line
                ? 'Record'
                : 'Record, not recorded yet'
            }
            onPress={onRecord}
            blocked={recordBlocked !== null}
            testID="passage-record"
          />
        )}
        {passage.downloaded ? null : (
          <RoundButton
            variant="flat"
            icon={ArrowDown}
            accessibilityLabel={
              downloadState === 'downloading'
                ? 'Downloading the text'
                : downloadState === 'failed'
                ? "The text didn't download. Try again"
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
