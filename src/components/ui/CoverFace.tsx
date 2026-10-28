import React, { useState } from 'react';
import {
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  ColorModeScope,
  useTheme,
  useThemedStyles,
} from '../../theme/useTheme';
import { CoverArt } from './CoverArt';
import {
  BADGE_PLATE,
  CoverStatusBadge,
  type CoverBadgeState,
} from './CoverStatusBadge';
import type { CoverPalette, CoverStyle } from './coverArt/generator';
import { useCoverArt } from './coverArt/useCoverArt';

/** Cover width in the book page's two-column grid; the guard and badge scale from it. */
const BASE_WIDTH = 165;
const TEXT_GUARD = 10;
const BADGE_INSET = 0.55;

export interface CoverFaceProps {
  /** Small line on the cover, e.g. "Mark 14". */
  eyebrow: string;
  /** Set large on the cover, e.g. a verse range or a book's name. */
  heading: string;
  /** Stable id the art is drawn from. */
  seed: string;
  /** Picks the style, so a group's covers match. */
  groupSeed: string;
  palette: CoverPalette;
  /** Share recorded, 0–1; the art grows bluer with it. */
  progress: number;
  /** Overrides the group's style. */
  coverStyle?: CoverStyle;
  badge: CoverBadgeState;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** A square cover: generated art, an eyebrow, a large heading and a status badge. */
export function CoverFace(props: CoverFaceProps) {
  // The face is a Canvas surface, like the player's dark reading area.
  return (
    <ColorModeScope value="canvas">
      <Face {...props} />
    </ColorModeScope>
  );
}

function Face({
  eyebrow,
  heading,
  seed,
  groupSeed,
  palette,
  progress,
  coverStyle,
  badge,
  style,
  testID,
}: CoverFaceProps) {
  const theme = useTheme();
  const styles = useThemedStyles(t => ({
    face: {
      aspectRatio: 1,
      borderRadius: t.radius.sm,
      overflow: 'hidden',
      padding: t.spacing.md,
      justifyContent: 'space-between',
    },
    eyebrow: { ...t.type.meta, color: t.roles.fgPrimary },
    heading: { ...t.type.heading, color: t.roles.fgPrimary },
  }));
  // Null until measured, so the badge isn't drawn at the wrong size first.
  const [width, setWidth] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) =>
    setWidth(e.nativeEvent.layout.width);
  const { ground, spec } = useCoverArt({
    seed,
    groupSeed,
    palette,
    progress,
    coverStyle,
  });

  const scale = width === null ? null : width / BASE_WIDTH;
  const guard = scale !== null && {
    textShadowColor: ground,
    textShadowRadius: TEXT_GUARD * scale,
  };

  return (
    <View
      style={[styles.face, { backgroundColor: ground }, style]}
      onLayout={onLayout}
      testID={testID}
    >
      <CoverArt spec={spec} />
      <Text
        style={[
          styles.eyebrow,
          guard,
          scale !== null &&
            badge.kind !== 'none' && { paddingRight: BADGE_PLATE * scale },
        ]}
        numberOfLines={1}
      >
        {eyebrow}
      </Text>
      <Text
        style={[styles.heading, guard]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {heading}
      </Text>
      {scale !== null ? (
        <CoverStatusBadge
          state={badge}
          ground={ground}
          scale={scale}
          inset={BADGE_INSET * theme.spacing.md * scale}
        />
      ) : null}
    </View>
  );
}
