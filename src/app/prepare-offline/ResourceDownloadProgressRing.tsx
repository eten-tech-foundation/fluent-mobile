import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Download } from 'lucide-react-native';
import {
  theme,
  iconSizes,
  listIconStrokeWidth,
  progressRingStrokeWidth,
} from '../../theme';

interface ResourceDownloadProgressRingProps {
  progress: number;
  /** When false, ring is static (e.g. paused row). Defaults to true. */
  animate?: boolean;
}

const SIZE = iconSizes.chapterProgress;
const STROKE = progressRingStrokeWidth;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Inner icon — sized to sit inside the progress ring without overlapping the stroke. */
const ICON_SIZE = 10;

export function ResourceDownloadProgressRing({
  progress,
  animate = true,
}: ResourceDownloadProgressRingProps) {
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) {
      bounce.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: -2,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => {
      animation.stop();
    };
  }, [animate, bounce]);

  const clampedProgress = Number.isFinite(progress)
    ? Math.max(0, Math.min(1, progress))
    : 0;
  const strokeDashoffset = CIRCUMFERENCE * (1 - clampedProgress);

  return (
    <View style={styles.wrap} testID="resource-download-progress-ring">
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
        {clampedProgress > 0 ? (
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
      <Animated.View
        style={[styles.iconWrap, { transform: [{ translateY: bounce }] }]}
      >
        <Download
          size={ICON_SIZE}
          color={theme.colors.syncDownloading}
          strokeWidth={listIconStrokeWidth}
          testID="resource-status-downloading"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
