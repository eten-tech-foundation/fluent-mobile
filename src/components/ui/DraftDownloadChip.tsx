import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { CloudCheck, CloudOff } from 'lucide-react-native';
import type { DraftDownloadState } from '../../types/draftDownload/types';
import {
  DRAFT_DOWNLOAD_READY_FADE_MS,
  DRAFT_DOWNLOAD_READY_HOLD_MS,
} from '../../services/draftDownloadTiming';
import {
  theme,
  iconSizes,
  listIconStrokeWidth,
  progressRingStrokeWidth,
  touchHitSlop,
} from '../../theme';

export type DraftDownloadChipProps = {
  state: DraftDownloadState;
  onPress: () => void;
  testID?: string;
};

const SIZE = iconSizes.chapterProgress;
const STROKE = progressRingStrokeWidth;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const ICON_SIZE = 10;

/**
 * Reusable My Work row chip for #508 / #704.
 * MyWork lane wires visibility; this component only renders state + press.
 * Green check holds for 10s, then fades; service keeps `ready` through the fade.
 */
export function DraftDownloadChip({
  state,
  onPress,
  testID = 'draft-download-chip',
}: DraftDownloadChipProps) {
  const fade = useRef(new Animated.Value(1)).current;
  const [fadedOut, setFadedOut] = useState(false);
  const showReady = state.status === 'ready';
  const showProgress =
    state.status === 'downloading' || state.status === 'queued';
  const showIdle = state.status === 'idle' || state.status === 'failed';
  const disabled = showReady;

  useEffect(() => {
    if (!showReady || state.readyAtMs === null) {
      fade.setValue(1);
      setFadedOut(false);
      return;
    }

    const holdMs = DRAFT_DOWNLOAD_READY_HOLD_MS;
    const fadeMs = DRAFT_DOWNLOAD_READY_FADE_MS;
    const elapsed = Date.now() - state.readyAtMs;
    const holdRemaining = Math.max(0, holdMs - elapsed);

    fade.setValue(1);
    setFadedOut(false);

    const holdTimer = setTimeout(() => {
      Animated.timing(fade, {
        toValue: 0,
        duration: fadeMs,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setFadedOut(true);
        }
      });
    }, holdRemaining);

    return () => {
      clearTimeout(holdTimer);
      fade.stopAnimation();
    };
  }, [showReady, state.readyAtMs, fade]);

  // Hide only after the coordinated hold+fade (or when service ends ready).
  if (fadedOut && showReady) {
    return null;
  }
  if (state.status === 'idle' && state.progress >= 1 && state.readyAtMs) {
    return null;
  }

  const clampedProgress = Number.isFinite(state.progress)
    ? Math.max(0, Math.min(1, state.progress))
    : 0;
  const strokeDashoffset = CIRCUMFERENCE * (1 - clampedProgress);

  return (
    <Animated.View style={{ opacity: fade }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        hitSlop={touchHitSlop}
        accessibilityRole="button"
        accessibilityLabel={
          showReady
            ? 'Draft download complete'
            : showProgress
            ? 'Draft download in progress'
            : 'Download draft for offline'
        }
        testID={testID}
        style={styles.pressable}
      >
        <View style={styles.wrap}>
          {(showProgress || showReady) && (
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
              {showProgress && clampedProgress > 0 ? (
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
              {showReady ? (
                <Circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  stroke={theme.colors.syncSynced}
                  strokeWidth={STROKE}
                  fill="none"
                />
              ) : null}
            </Svg>
          )}
          <View
            style={[styles.iconWrap, showIdle ? styles.iconWrapIdle : null]}
          >
            {showReady ? (
              <CloudCheck
                size={ICON_SIZE}
                color={theme.colors.syncSynced}
                strokeWidth={listIconStrokeWidth}
                testID={`${testID}-ready`}
              />
            ) : (
              <CloudOff
                size={ICON_SIZE}
                color={
                  showProgress
                    ? theme.colors.syncDownloading
                    : theme.colors.mutedForeground
                }
                strokeWidth={listIconStrokeWidth}
                testID={`${testID}-idle`}
              />
            )}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  iconWrapIdle: {
    position: 'relative',
  },
});
