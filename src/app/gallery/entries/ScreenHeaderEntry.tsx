import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ArrowLeft } from '../../../components/ui/icons';
import { RoundButton } from '../../../components/ui/RoundButton';
import { ScreenHeader, useScrolled } from '../../../components/ui/ScreenHeader';
import { SyncStatusButton } from '../../../components/ui/SyncStatusButton';
import { useThemedStyles } from '../../../theme/useTheme';

const ROWS = Array.from({ length: 12 }, (_, i) => `Chapter ${i + 1}`);
/** Short enough that the rows scroll under the header. */
const FRAME_HEIGHT = 260;

/**
 * The book page's header over its list: scroll the rows under it and the
 * rim stroke fades in, then back to the top and it fades out.
 */
export function ScreenHeaderEntry() {
  const scroll = useScrolled();
  const styles = useThemedStyles(t => ({
    frame: {
      height: FRAME_HEIGHT,
      overflow: 'hidden',
      borderRadius: t.radius.md,
      backgroundColor: t.roles.bgDefault,
    },
    list: { paddingHorizontal: t.spacing.xl, gap: t.spacing.lg },
    row: { ...t.type.title, color: t.roles.fgPrimary },
  }));

  return (
    <View style={styles.frame}>
      <ScreenHeader scrolled={scroll.scrolled}>
        <RoundButton icon={ArrowLeft} accessibilityLabel="Back" />
        <SyncStatusButton status="online_synced" />
      </ScreenHeader>
      <ScrollView
        onScroll={scroll.onScroll}
        contentContainerStyle={styles.list}
        nestedScrollEnabled
      >
        {ROWS.map(row => (
          <Text key={row} style={styles.row}>
            {row}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}
