import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { ColorModeScope, useThemedStyles } from '../../theme/useTheme';
import { CoverFace } from './CoverFace';
import { coverBadgeState } from './CoverStatusBadge';

/** The back sheet fades toward the page, so the stack reads as depth. */
const BACK_SHEET_OPACITY = 0.5;

export interface BookCoverProps {
  bookName: string;
  /** Share of its chapters recorded, 0–1. */
  recorded: number;
  /** Every chapter passed peer check. */
  peerChecked: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A book's cover, with art drawn from the book and its name, on a stack of
 * two sheets for its chapters. The art grows bluer as chapters are
 * recorded; the badge's ring fills with them, then turns to a check once they
 * all pass peer check.
 */
export function BookCover(props: BookCoverProps) {
  return (
    <ColorModeScope value="canvas">
      <BookStack {...props} />
    </ColorModeScope>
  );
}

function BookStack({
  bookName,
  recorded,
  peerChecked,
  style,
  testID,
}: BookCoverProps) {
  const styles = useThemedStyles(t => ({
    sheet: {
      height: t.spacing.sm,
      marginBottom: t.stroke[1],
      borderTopLeftRadius: t.radius.sm,
      borderTopRightRadius: t.radius.sm,
      backgroundColor: t.roles.surfaceDefault,
    },
    back: {
      marginHorizontal: 2 * t.spacing.sm,
      opacity: BACK_SHEET_OPACITY,
    },
    front: { marginHorizontal: t.spacing.sm },
  }));

  return (
    <View style={style} testID={testID}>
      <View style={[styles.sheet, styles.back]} />
      <View style={[styles.sheet, styles.front]} />
      <CoverFace
        eyebrow="Book"
        heading={bookName}
        seed={`${bookName}:book`}
        groupSeed={bookName}
        palette="night"
        progress={peerChecked ? 1 : recorded}
        badge={coverBadgeState(recorded, peerChecked)}
        testID={testID && `${testID}-face`}
      />
    </View>
  );
}
