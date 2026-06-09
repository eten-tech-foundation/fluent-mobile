import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import {
  ArrowUp,
  Check,
  Cloud,
  CloudOff,
  RefreshCw,
} from 'lucide-react-native';
import CloudOffUnsynced from '../../assets/icons/cloud-off-unsynced.svg';
import {
  iconSizes,
  listIconStrokeWidth,
  syncStatusIcon,
  theme,
} from '../../theme';
import { SYNC_STATUS_LABELS, SyncStatus } from '../../utils/syncStatusState';

const ACCENT_STROKE = listIconStrokeWidth + 0.5;
const CLOUD_COLOR = theme.colors.primaryForeground;

interface CloudSyncStatusIconProps {
  status: SyncStatus;
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** When true, parent provides the accessibility label. */
  decorative?: boolean;
}

function IconFrame({
  size,
  children,
}: {
  size: number;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      {children}
    </View>
  );
}

function WhiteCloud({ size }: { size: number }) {
  return (
    <Cloud size={size} color={CLOUD_COLOR} strokeWidth={listIconStrokeWidth} />
  );
}

function OnlineCloudGlyph({
  size,
  overlay,
}: {
  size: number;
  overlay: React.ReactNode;
}) {
  return (
    <IconFrame size={size}>
      <WhiteCloud size={size} />
      {overlay}
    </IconFrame>
  );
}

function OnlineSyncedGlyph({ size }: { size: number }) {
  const overlay = size * syncStatusIcon.overlayScale;

  return (
    <OnlineCloudGlyph
      size={size}
      overlay={
        <View
          style={[
            styles.overlay,
            {
              bottom: size * syncStatusIcon.checkOffset.bottom,
              right: size * syncStatusIcon.checkOffset.right,
            },
          ]}
        >
          <Check
            size={overlay}
            color={theme.colors.syncStatusSynced}
            strokeWidth={ACCENT_STROKE}
          />
        </View>
      }
    />
  );
}

function OnlineSyncingGlyph({
  size,
  spin,
}: {
  size: number;
  spin: Animated.AnimatedInterpolation<string>;
}) {
  const overlay = size * syncStatusIcon.overlayScale;

  return (
    <OnlineCloudGlyph
      size={size}
      overlay={
        <Animated.View
          style={[
            styles.overlayCenter,
            { width: overlay, height: overlay, transform: [{ rotate: spin }] },
          ]}
        >
          <RefreshCw
            size={overlay}
            color={theme.colors.syncStatusSynced}
            strokeWidth={ACCENT_STROKE}
          />
        </Animated.View>
      }
    />
  );
}

function OnlinePendingGlyph({
  size,
  pulseScale,
}: {
  size: number;
  pulseScale: Animated.Value;
}) {
  const overlay = size * syncStatusIcon.overlayScale;

  return (
    <OnlineCloudGlyph
      size={size}
      overlay={
        <Animated.View
          style={[styles.overlayBottom, { transform: [{ scale: pulseScale }] }]}
        >
          <ArrowUp
            size={overlay}
            color={theme.colors.syncStatusPending}
            strokeWidth={ACCENT_STROKE}
          />
        </Animated.View>
      }
    />
  );
}

const GLYPHS: Record<
  SyncStatus,
  (props: {
    size: number;
    spin?: Animated.AnimatedInterpolation<string>;
    pulseScale?: Animated.Value;
  }) => React.ReactElement
> = {
  online_synced: ({ size }) => <OnlineSyncedGlyph size={size} />,
  online_syncing: ({ size, spin }) => (
    <OnlineSyncingGlyph size={size} spin={spin!} />
  ),
  online_pending: ({ size, pulseScale }) => (
    <OnlinePendingGlyph size={size} pulseScale={pulseScale!} />
  ),
  offline_synced: ({ size }) => (
    <CloudOff
      size={size}
      color={theme.colors.syncStatusOffline}
      strokeWidth={listIconStrokeWidth}
    />
  ),
  offline_pending: ({ size }) => (
    <CloudOffUnsynced
      width={size}
      height={size}
      color={theme.colors.syncStatusOffline}
    />
  ),
};

function useStatusTransition(status: SyncStatus) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prevStatus = useRef(status);

  useEffect(() => {
    if (prevStatus.current === status) {
      return;
    }

    prevStatus.current = status;
    fadeAnim.setValue(0.45);
    scaleAnim.setValue(0.9);

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 7,
        tension: 140,
        useNativeDriver: true,
      }),
    ]).start();
  }, [status, fadeAnim, scaleAnim]);

  return { fadeAnim, scaleAnim };
}

function useSpinAnimation(active: boolean) {
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      spinAnim.setValue(0);
      return;
    }

    const spin = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1_100,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    spin.start();
    return () => spin.stop();
  }, [active, spinAnim]);

  return spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
}

function usePulseAnimation(active: boolean) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) {
      pulseAnim.setValue(1);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.14,
          duration: 650,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 650,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    pulse.start();
    return () => pulse.stop();
  }, [active, pulseAnim]);

  return pulseAnim;
}

export function CloudSyncStatusIcon({
  status,
  size = iconSizes.header,
  style,
  decorative = false,
}: CloudSyncStatusIconProps) {
  const { fadeAnim, scaleAnim } = useStatusTransition(status);
  const spin = useSpinAnimation(status === 'online_syncing');
  const pulseScale = usePulseAnimation(status === 'online_pending');

  return (
    <Animated.View
      accessible={!decorative}
      accessibilityLabel={decorative ? undefined : SYNC_STATUS_LABELS[status]}
      style={[style, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}
    >
      {GLYPHS[status]({ size, spin, pulseScale })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
  },
  overlayCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayBottom: {
    position: 'absolute',
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
