import React from 'react';
import { Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useThemedStyles } from '../../theme/useTheme';
import { CoverFace } from './CoverFace';
import type { CoverBadgeState } from './CoverStatusBadge';
import type { CoverStyle } from './coverArt/generator';

const PRESSED_OPACITY = 0.7;

type PassageStatus =
  | 'none'
  | 'partial'
  | 'recorded'
  | 'waiting'
  | 'peerCheck'
  | 'checked';

const STATUS_LABELS: Record<PassageStatus, string> = {
  none: 'Not recorded yet',
  partial: 'Partly recorded',
  recorded: 'Recorded',
  waiting: 'Waiting to send',
  peerCheck: 'In peer check',
  checked: 'Peer checked',
};

/**
 * A pericope is recorded in one take, so the badge only follows the send and
 * peer check.
 */
const BADGES: Record<PassageStatus, CoverBadgeState> = {
  none: { kind: 'none' },
  partial: { kind: 'none' },
  recorded: { kind: 'none' },
  waiting: { kind: 'waiting' },
  peerCheck: { kind: 'ring', fraction: 0.5 },
  checked: { kind: 'checked' },
};

function passageStatus({
  recordedVerses,
  totalVerses,
  waitingToSend,
  submitted,
  peerChecked,
}: CoverArtProps): PassageStatus {
  if (peerChecked) return 'checked';
  if (waitingToSend) return 'waiting';
  if (submitted) return 'peerCheck';
  if (recordedVerses <= 0) return 'none';
  return recordedVerses >= totalVerses ? 'recorded' : 'partial';
}

/** What the cover's art and status are drawn from. */
export interface CoverArtProps {
  /** Stable passage id, e.g. "Mark:pericope::2". */
  seed: string;
  /** The passage's chapter, e.g. "Mark:14"; picks the style. */
  groupSeed: string;
  recordedVerses: number;
  totalVerses: number;
  /** Its chapter was sent on here; the send hasn't reached the server. */
  waitingToSend?: boolean;
  /** Every chapter it's in was submitted for peer check. */
  submitted?: boolean;
  /** Every chapter it's in passed peer check. */
  peerChecked?: boolean;
  /** Overrides the chapter's style. */
  coverStyle?: CoverStyle;
}

export interface PassageCoverProps extends CoverArtProps {
  /** Small line on the cover, e.g. "Mark 14". */
  eyebrow: string;
  /** Verse range set large on the cover, e.g. "22–25". */
  verses: string;
  /** Under the cover: the pericope title, or the reference without one. */
  title: string;
  onPress?: () => void;
  /** Spoken reference, e.g. "Mark 14:22–25". */
  reference: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A passage in the book page's gallery: a cover with art drawn from the
 * passage and its verse range, then its title and status. The art grows bluer
 * as verses are recorded; the badge is a cloud while the send waits to go up,
 * a half ring in peer check, then a check once it passes. Flat, since tactile
 * controls stay in the player.
 */
export function PassageCover({
  eyebrow,
  verses,
  title,
  onPress,
  reference,
  style,
  testID,
  ...art
}: PassageCoverProps) {
  const styles = useThemedStyles(t => ({
    item: { gap: t.spacing.xs },
    pressed: { opacity: PRESSED_OPACITY },
    title: { ...t.type.label, color: t.roles.fgPrimary },
    status: { ...t.type.meta, color: t.roles.fgSecondary },
  }));
  const statusLabel = STATUS_LABELS[passageStatus(art)];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        title === reference
          ? `${reference}, ${statusLabel}`
          : `${title}, ${reference}, ${statusLabel}`
      }
      style={({ pressed }) => [styles.item, pressed && styles.pressed, style]}
      testID={testID}
    >
      <PassageCoverFace
        eyebrow={eyebrow}
        verses={verses}
        testID={testID && `${testID}-face`}
        {...art}
      />
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <Text style={styles.status} testID={testID && `${testID}-status`}>
        {statusLabel}
      </Text>
    </Pressable>
  );
}

type PassageFaceProps = CoverArtProps & {
  eyebrow: string;
  verses: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Just the cover, for layouts that set the title and status beside it. */
export function PassageCoverFace({
  eyebrow,
  verses,
  style,
  testID,
  ...art
}: PassageFaceProps) {
  const { recordedVerses, totalVerses } = art;
  const recorded = totalVerses > 0 ? recordedVerses / totalVerses : 0;
  return (
    <CoverFace
      eyebrow={eyebrow}
      heading={verses}
      seed={art.seed}
      groupSeed={art.groupSeed}
      palette="surface"
      progress={art.peerChecked ? 1 : recorded}
      coverStyle={art.coverStyle}
      badge={BADGES[passageStatus(art)]}
      style={style}
      testID={testID}
    />
  );
}
