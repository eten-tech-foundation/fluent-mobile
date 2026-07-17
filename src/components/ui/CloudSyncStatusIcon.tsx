import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { CloudOff } from 'lucide-react-native';
import CloudOffUnsynced from '../../assets/icons/cloud-off-unsynced.svg';
import {
  iconSizes,
  listIconStrokeWidth,
  syncStatusIcon,
  theme,
} from '../../theme';
import { SYNC_STATUS_LABELS, SyncStatus } from '../../utils/syncStatusState';

const CLOUD_COLOR = theme.colors.primaryForeground;
const CLOUD_PATH =
  'M5.516 16.07A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 3.501 7.327';
const CHECK_PATH = 'm17 15-5.5 5.5L9 18';
const REFRESH_PATHS = [
  'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8',
  'M21 3v5h-5',
  'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16',
  'M8 16H3v5',
] as const;

const BASE_STROKE = {
  strokeWidth: listIconStrokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none' as const,
};

const ACCENT_STROKE = {
  ...BASE_STROKE,
  strokeWidth: syncStatusIcon.accentStrokeWidth,
};

interface CloudSyncStatusIconProps {
  status: SyncStatus;
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** When true, parent provides the accessibility label. */
  decorative?: boolean;
  animated?: boolean;
  cloudColor?: string;
}

function SyncStatusSvg({
  size,
  children,
}: {
  size: number;
  children: React.ReactNode;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {children}
    </Svg>
  );
}

function CloudOutline({ size, color }: { size: number; color: string }) {
  return (
    <SyncStatusSvg size={size}>
      <Path d={CLOUD_PATH} stroke={color} {...BASE_STROKE} />
    </SyncStatusSvg>
  );
}

function RefreshPaths({ size, color }: { size: number; color: string }) {
  return (
    <SyncStatusSvg size={size}>
      {REFRESH_PATHS.map(d => (
        <Path key={d} d={d} stroke={color} {...ACCENT_STROKE} />
      ))}
    </SyncStatusSvg>
  );
}

/** Lucide `cloud-check` paths with independent cloud/check colors. */
function CloudCheckGlyph({
  size,
  cloudColor,
  checkColor,
  animateCheck = false,
}: {
  size: number;
  cloudColor: string;
  checkColor: string;
  animateCheck?: boolean;
}) {
  const checkScale = useRef(new Animated.Value(animateCheck ? 0.6 : 1)).current;
  const checkOpacity = useRef(new Animated.Value(animateCheck ? 0 : 1)).current;

  useEffect(() => {
    if (!animateCheck) {
      checkScale.setValue(1);
      checkOpacity.setValue(1);
      return;
    }

    checkScale.setValue(0.6);
    checkOpacity.setValue(0);

    const animation = Animated.parallel([
      Animated.spring(checkScale, {
        toValue: 1,
        friction: 5,
        tension: 180,
        useNativeDriver: true,
      }),
      Animated.timing(checkOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    animation.start();

    return () => {
      animation.stop();
    };
  }, [animateCheck, checkOpacity, checkScale]);

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <CloudOutline size={size} color={cloudColor} />
      <Animated.View
        style={[
          styles.overlayFill,
          { opacity: checkOpacity, transform: [{ scale: checkScale }] },
        ]}
      >
        <SyncStatusSvg size={size}>
          <Path d={CHECK_PATH} stroke={checkColor} {...ACCENT_STROKE} />
        </SyncStatusSvg>
      </Animated.View>
    </View>
  );
}

/** Lucide `cloud-upload` paths with independent cloud/arrow colors. */
function CloudUploadGlyph({
  size,
  cloudColor,
  arrowColor,
  animated = true,
}: {
  size: number;
  cloudColor: string;
  arrowColor: string;
  animated?: boolean;
}) {
  const pulse = usePendingPulse(animated);

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <CloudOutline size={size} color={cloudColor} />
      <Animated.View
        style={[styles.overlayFill, { transform: [{ translateY: pulse }] }]}
      >
        <SyncStatusSvg size={size}>
          <Path d="M12 13v8" stroke={arrowColor} {...ACCENT_STROKE} />
          <Path d="m8 17 4-4 4 4" stroke={arrowColor} {...ACCENT_STROKE} />
        </SyncStatusSvg>
      </Animated.View>
    </View>
  );
}

/** Lucide `cloud` + centered static `refresh-cw` — download updates available. */
function CloudNeedsSyncGlyph({ size }: { size: number }) {
  const overlay = size * syncStatusIcon.overlayScale;
  const inset = (size - overlay) / 2;
  const top = inset + size * syncStatusIcon.overlayOffsetY;

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <CloudOutline size={size} color={CLOUD_COLOR} />
      <View
        style={[
          styles.overlayCenter,
          {
            width: overlay,
            height: overlay,
            top,
            left: inset,
          },
        ]}
      >
        <RefreshPaths size={overlay} color={theme.colors.syncStatusPending} />
      </View>
    </View>
  );
}

/** Lucide `cloud` + centered spinning `refresh-cw` overlay. */
function CloudSyncingGlyph({
  size,
  cloudColor = CLOUD_COLOR,
  animated = true,
}: {
  size: number;
  cloudColor?: string;
  animated?: boolean;
}) {
  const spin = useSpinAnimation(animated);
  const overlay = size * syncStatusIcon.overlayScale;
  const inset = (size - overlay) / 2;
  const top = inset + size * syncStatusIcon.overlayOffsetY;

  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <CloudOutline size={size} color={cloudColor} />
      <Animated.View
        style={[
          styles.overlayCenter,
          {
            width: overlay,
            height: overlay,
            top,
            left: inset,
            transform: [{ rotate: spin }],
          },
        ]}
      >
        <RefreshPaths size={overlay} color={theme.colors.syncStatusSynced} />
      </Animated.View>
    </View>
  );
}

interface GlyphOptions {
  animateCheck?: boolean;
  animated?: boolean;
  cloudColor?: string;
}

const GLYPHS: Record<
  SyncStatus,
  (size: number, options?: GlyphOptions) => React.ReactElement
> = {
  online_synced: (size, options) => (
    <CloudCheckGlyph
      size={size}
      cloudColor={options?.cloudColor ?? CLOUD_COLOR}
      checkColor={theme.colors.syncStatusSynced}
      animateCheck={options?.animateCheck}
    />
  ),
  online_syncing: (size, options) => (
    <CloudSyncingGlyph
      size={size}
      cloudColor={options?.cloudColor}
      animated={options?.animated}
    />
  ),
  online_needs_sync: size => <CloudNeedsSyncGlyph size={size} />,
  online_pending: (size, options) => (
    <CloudUploadGlyph
      size={size}
      cloudColor={options?.cloudColor ?? CLOUD_COLOR}
      arrowColor={theme.colors.syncStatusPending}
      animated={options?.animated}
    />
  ),
  offline_synced: (size, options) => (
    <CloudOff
      size={size}
      color={options?.cloudColor ?? theme.colors.syncStatusOffline}
      strokeWidth={listIconStrokeWidth}
    />
  ),
  offline_pending: (size, options) => (
    <CloudOffUnsynced
      width={size}
      height={size}
      color={options?.cloudColor ?? theme.colors.syncStatusOffline}
    />
  ),
};

function useSpinAnimation(animated: boolean) {
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) {
      spinAnim.setValue(0);
      return;
    }

    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: syncStatusIcon.spinDurationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    spin.start();
    return () => spin.stop();
  }, [animated, spinAnim]);

  return spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
}

function usePendingPulse(animated: boolean) {
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated) {
      pulseAnim.setValue(0);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: syncStatusIcon.pendingPulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: syncStatusIcon.pendingPulseDurationMs / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    pulse.start();
    return () => pulse.stop();
  }, [animated, pulseAnim]);

  return pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -2.5],
  });
}

function useStatusTransition(status: SyncStatus) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prevStatus = useRef(status);
  const [animateCheck, setAnimateCheck] = React.useState(false);

  useEffect(() => {
    if (prevStatus.current === status) {
      return;
    }

    const enteringSynced = status === 'online_synced';
    prevStatus.current = status;
    setAnimateCheck(enteringSynced);
    fadeAnim.setValue(0.35);
    scaleAnim.setValue(0.88);

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [status, fadeAnim, scaleAnim]);

  return { fadeAnim, scaleAnim, animateCheck };
}

export function CloudSyncStatusIcon({
  status,
  size = iconSizes.header,
  style,
  decorative = false,
  animated = true,
  cloudColor,
}: CloudSyncStatusIconProps) {
  const { fadeAnim, scaleAnim, animateCheck } = useStatusTransition(status);

  return (
    <Animated.View
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : SYNC_STATUS_LABELS[status]}
      style={[style, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}
    >
      {GLYPHS[status](size, { animateCheck, animated, cloudColor })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayFill: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
