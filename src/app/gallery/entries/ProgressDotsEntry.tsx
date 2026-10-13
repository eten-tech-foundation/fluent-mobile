import React, { useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { ProgressDots } from '../../../components/ui/ProgressDots';
import { useThemedStyles } from '../../../theme/useTheme';

/** The Pericope screen header shows 16 dots (Figma 2440:30168). */
const PERICOPES = 16;
/** Back button width; it lands with the Round button (#692). */
const HEADER_SIDE = 48;

/**
 * Pericope screen header: swipe between pericopes and the header dots follow.
 */
export function ProgressDotsEntry() {
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.lg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    side: { width: HEADER_SIDE },
    page: { gap: t.spacing.xs, paddingVertical: t.spacing.sm },
    reference: {
      color: t.roles.fgSecondary,
      fontSize: t.typography.sizes.sm,
      includeFontPadding: false,
    },
    title: {
      color: t.roles.fgPrimary,
      fontSize: t.typography.sizes.lg,
      fontWeight: t.typography.weights.semibold,
      includeFontPadding: false,
    },
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setWidth(prev => (prev === next ? prev : next));
  };
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) {
      setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
    }
  };

  return (
    <View style={styles.demo} onLayout={onLayout}>
      <View style={styles.header}>
        <View style={styles.side} />
        <ProgressDots
          count={PERICOPES}
          index={index}
          accessibilityLabel={`Pericope ${index + 1} of ${PERICOPES}`}
          testID="gallery-progress-dots"
        />
        <View style={styles.side} />
      </View>
      {width > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}
          testID="gallery-pericope-pager"
        >
          {Array.from({ length: PERICOPES }, (_, i) => (
            <View key={i} style={[styles.page, { width }]}>
              <Text style={styles.reference}>Mark</Text>
              <Text style={styles.title}>Pericope {i + 1}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
