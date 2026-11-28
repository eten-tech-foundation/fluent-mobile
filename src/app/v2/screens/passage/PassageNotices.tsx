import React from 'react';
import { Text, View } from 'react-native';
import { useThemedStyles } from '../../../../theme/useTheme';
import type { RecordNotice } from './useRecorder';

/**
 * The passage's banners: a conflict, takes that can't upload, a chapter
 * someone else holds, and why recording is waiting. Announced as they appear.
 */
export function PassageNotices({
  notices,
  testID,
}: {
  notices: RecordNotice[];
  testID: string;
}) {
  const styles = useThemedStyles(t => ({
    list: { gap: t.spacing.xs },
    message: {
      ...t.type.meta,
      color: t.roles.fgPrimary,
      textAlign: 'center',
    },
  }));
  if (notices.length === 0) return null;
  return (
    <View
      style={styles.list}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      {notices.map(notice => (
        <Text
          key={notice.id}
          style={styles.message}
          testID={`${testID}-${notice.id}`}
        >
          {notice.message}
        </Text>
      ))}
    </View>
  );
}
