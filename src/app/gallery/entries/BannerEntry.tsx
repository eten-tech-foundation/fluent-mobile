import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Banner } from '../../../components/ui/Banner';
import { useThemedStyles } from '../../../theme/useTheme';

/**
 * Home when the session expired: Sign in clears the banner, as reauth does.
 * Bring it back to try it again, or in Telugu for a long message.
 */
export function BannerEntry() {
  const [expired, setExpired] = useState(true);
  const [telugu, setTelugu] = useState(false);
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.md },
    row: { flexDirection: 'row', gap: t.spacing.lg },
    link: { ...t.type.label, color: t.roles.accentPrimary },
    status: { ...t.type.meta, color: t.roles.fgSecondary },
  }));

  return (
    <View style={styles.demo}>
      {expired ? (
        <Banner
          message={
            telugu
              ? 'సెషన్ ముగిసింది. సమకాలీకరణ కొనసాగించడానికి మీ పాస్‌వర్డ్‌ను నమోదు చేయండి.'
              : 'Session expired. Enter your password to keep syncing.'
          }
          actionLabel={telugu ? 'సైన్ ఇన్' : 'Sign in'}
          onAction={() => setExpired(false)}
        />
      ) : (
        <Text style={styles.status}>Signed in again</Text>
      )}
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={() => setExpired(true)}>
          <Text style={styles.link}>Expire the session</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setTelugu(v => !v)}
        >
          <Text style={styles.link}>{telugu ? 'English' : 'Telugu'}</Text>
        </Pressable>
      </View>
    </View>
  );
}
