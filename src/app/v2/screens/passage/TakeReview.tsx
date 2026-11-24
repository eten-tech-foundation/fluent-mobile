import React, { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { BottomSheet } from '../../../../components/ui/BottomSheet';
import { PauseFill, PlayFill } from '../../../../components/ui/icons';
import { RoundButton } from '../../../../components/ui/RoundButton';
import { Waveform } from '../../../../components/ui/Waveform';
import {
  TAKE_REVIEW_EMPTY,
  TAKE_REVIEW_MISSING,
  TAKE_REVIEW_OFFICIAL,
  TAKE_REVIEW_PLAY_FAILED,
  TAKE_REVIEW_TITLE,
} from '../../../../constants/messages';
import { useThemedStyles } from '../../../../theme/useTheme';
import { formatElapsed, BAR_MIN } from './TakeCard';
import type { ReviewOwner, ReviewTake } from './useTakeReview';

/** Bar plus gap, for a flat strip that fills the row. */
const BAR_STEP = 6;

/**
 * Everyone's takes on the verse or passage Record is on, by who recorded
 * them: play, pause and scrub each one. Nothing here picks, deletes or makes
 * a take official.
 */
export function TakeReview({
  visible,
  scopeLabel,
  owners,
  onClose,
}: {
  visible: boolean;
  /** e.g. "Verse 3" or the passage's reference. */
  scopeLabel: string;
  owners: ReviewOwner[];
  onClose: () => void;
}) {
  const styles = useThemedStyles(t => ({
    scope: { ...t.type.label, color: t.roles.fgSecondary },
    owner: { gap: t.spacing.sm },
    name: { ...t.type.overline, color: t.roles.fgPrimary },
    empty: { ...t.type.body, color: t.roles.fgSecondary },
  }));
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={TAKE_REVIEW_TITLE}
      testID="passage-review"
    >
      <Text style={styles.scope}>{scopeLabel}</Text>
      {owners.length === 0 ? (
        <Text style={styles.empty}>{TAKE_REVIEW_EMPTY}</Text>
      ) : (
        owners.map(owner => (
          <View
            key={owner.key}
            style={styles.owner}
            testID={`passage-review-owner-${owner.key}`}
          >
            <Text style={styles.name} accessibilityRole="header">
              {owner.name}
            </Text>
            {owner.takes.map(take => (
              <ReviewRow key={take.id} take={take} owner={owner.name} />
            ))}
          </View>
        ))
      )}
    </BottomSheet>
  );
}

function ReviewRow({ take, owner }: { take: ReviewTake; owner: string }) {
  const [bars, setBars] = useState(0);
  const styles = useThemedStyles(t => ({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
    },
    middle: { flex: 1, minWidth: 0, gap: t.spacing.xs },
    top: { flexDirection: 'row', justifyContent: 'space-between' },
    label: { ...t.type.label, color: t.roles.fgPrimary, flexShrink: 1 },
    time: { ...t.type.meta, color: t.roles.fgSecondary },
    official: { ...t.type.meta, color: t.roles.accentPrimary },
    missing: { ...t.type.meta, color: t.roles.fgSecondary },
  }));
  const name = `${owner}, ${take.label}`;
  const onLayout = (e: LayoutChangeEvent) =>
    setBars(Math.max(1, Math.floor(e.nativeEvent.layout.width / BAR_STEP)));
  return (
    <View style={styles.row} testID={`passage-review-take-${take.id}`}>
      <RoundButton
        icon={take.playing ? PauseFill : PlayFill}
        accessibilityLabel={take.playing ? `Pause ${name}` : `Play ${name}`}
        onPress={take.onPlayPause}
        testID={`passage-review-play-${take.id}`}
      />
      <View style={styles.middle}>
        <View style={styles.top}>
          <Text style={styles.label} numberOfLines={1}>
            {take.label}
          </Text>
          <Text style={styles.time}>{formatElapsed(take.durationMs)}</Text>
        </View>
        {take.official ? (
          <Text style={styles.official}>{TAKE_REVIEW_OFFICIAL}</Text>
        ) : null}
        {take.failed && !take.missing ? (
          <Text style={styles.missing} accessibilityLiveRegion="polite">
            {TAKE_REVIEW_PLAY_FAILED}
          </Text>
        ) : null}
        {take.missing ? (
          <Text style={styles.missing} accessibilityLiveRegion="polite">
            {TAKE_REVIEW_MISSING}
          </Text>
        ) : (
          <View onLayout={onLayout}>
            <Waveform
              verses={
                bars > 0
                  ? [
                      {
                        verse: null,
                        bars: new Array<number>(bars).fill(BAR_MIN),
                      },
                    ]
                  : []
              }
              progress={take.progress}
              accessibilityLabel={`${name} playback`}
              onSeek={take.durationMs > 0 ? take.onSeek : undefined}
              pinned
              testID={`passage-review-wave-${take.id}`}
            />
          </View>
        )}
      </View>
    </View>
  );
}
