import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { CheckBold } from './icons';
import { useTheme } from '../../theme/useTheme';

/** Sizes before `scale`. */
export const BADGE_PLATE = 30;
const RING = 21;
const STROKE = 2.6;
const TRACK_OPACITY = 0.32;
const ICON = 13;

export type CoverBadgeState =
  | { kind: 'none' }
  | {
      kind: 'ring';
      /** Share of the ring filled, 0–1. */
      fraction: number;
    }
  | { kind: 'checked' };

/** A book's badge: `fraction` is the share of its chapters recorded, 0–1. */
export function coverBadgeState(
  fraction: number,
  peerChecked: boolean,
): CoverBadgeState {
  if (peerChecked) return { kind: 'checked' };
  return fraction > 0 ? { kind: 'ring', fraction } : { kind: 'none' };
}

/**
 * A cover's status in its top-right corner: a ring, then a check once it all
 * passes peer check. A book's ring fills as its chapters are recorded; a
 * passage's is half full while it's in peer check. TalkBack skips it; the
 * cover's label already says the status.
 */
export function CoverStatusBadge({
  state,
  ground,
  scale,
  inset,
}: {
  state: CoverBadgeState;
  /** The cover's ground, for the plate and the check. */
  ground: string;
  scale: number;
  inset: number;
}) {
  const theme = useTheme();
  if (state.kind === 'none') return null;

  const plate = BADGE_PLATE * scale;
  const ring = RING * scale;
  const stroke = STROKE * scale;
  const r = (ring - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fg = theme.roles.fgPrimary;

  return (
    <View
      style={[
        styles.plate,
        {
          top: inset,
          right: inset,
          width: plate,
          height: plate,
          borderRadius: plate / 2,
          backgroundColor: ground,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="cover-badge"
    >
      {state.kind === 'checked' ? (
        <View
          style={[
            styles.centred,
            {
              width: ring,
              height: ring,
              borderRadius: ring / 2,
              backgroundColor: fg,
            },
          ]}
          testID="cover-badge-check"
        >
          <CheckBold color={ground} size={ICON * scale} />
        </View>
      ) : (
        <Svg width={ring} height={ring} testID="cover-badge-ring">
          <Circle
            cx={ring / 2}
            cy={ring / 2}
            r={r}
            stroke={fg}
            strokeOpacity={TRACK_OPACITY}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={ring / 2}
            cy={ring / 2}
            r={r}
            stroke={fg}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={
              circumference * (1 - Math.min(1, Math.max(0, state.fraction)))
            }
            rotation={-90}
            origin={`${ring / 2}, ${ring / 2}`}
            testID="cover-badge-arc"
          />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { alignItems: 'center', justifyContent: 'center' },
  plate: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
