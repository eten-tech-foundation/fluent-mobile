import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { OPEN_CLASSIC_DRAFTING } from '../../../../constants/messages';
import { touchHitSlop } from '../../../../theme/iconSpecs';
import { useThemedStyles } from '../../../../theme/useTheme';
import type { RecordNotice } from './useRecorder';

/**
 * Legacy's Record-tab banners in Next's type: a conflict, takes that can't
 * upload, a chapter someone else holds, and what only classic drafting can
 * show, with the way there. Announced as they appear, like WarningBanner.
 */
export function PassageNotices({
  notices,
  onOpenClassic,
  testID,
}: {
  notices: RecordNotice[];
  /** Omit while a take is in progress, when leaving would ask first. */
  onOpenClassic?: () => void;
  testID: string;
}) {
  const styles = useThemedStyles(t => ({
    list: { gap: t.spacing.xs },
    message: {
      ...t.type.meta,
      color: t.roles.fgPrimary,
      textAlign: 'center',
    },
    link: {
      ...t.type.meta,
      color: t.roles.accentPrimary,
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
      {onOpenClassic && notices.some(n => n.classic) ? (
        <Pressable
          onPress={onOpenClassic}
          accessibilityRole="button"
          hitSlop={touchHitSlop}
          testID={`${testID}-open-classic`}
        >
          <Text style={styles.link}>{OPEN_CLASSIC_DRAFTING}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
