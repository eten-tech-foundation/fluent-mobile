import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { theme, iconSizes, progressRingStrokeWidth } from '../../theme';
import {
  offlineDownloadLabel,
  verseProgressRatio,
} from '../../utils/verseProgress';

interface ChapterProgressRingProps {
  filled: number;
  total: number;
  /** Partial arc while header sync runs and nothing is downloaded yet. */
  indeterminate?: boolean;
}

const SIZE = iconSizes.chapterProgress;
const STROKE = progressRingStrokeWidth;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ChapterProgressRing({
  filled,
  total,
  indeterminate = false,
}: ChapterProgressRingProps) {
  const ratio = verseProgressRatio(filled, total);
  const progress = indeterminate && ratio === 0 ? 0.25 : ratio;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  return (
    <View
      style={styles.wrap}
      accessibilityLabel={offlineDownloadLabel(filled, total)}
    >
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={theme.colors.mutedForeground}
          strokeOpacity={0.3}
          strokeWidth={STROKE}
          fill="none"
        />
        {progress > 0 ? (
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={theme.colors.syncDownloading}
            strokeWidth={STROKE}
            fill="none"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 2,
  },
});
