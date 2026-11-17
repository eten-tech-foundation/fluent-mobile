import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ColorModeScope, useThemedStyles } from '../../../theme/useTheme';
import type { ImagesMapsItem } from '../../../types/resources/imagesMaps';
import { ResourcesPeek } from '../../v2/screens/passage/ResourcesPeek';
import { ResourcesSheet } from '../../v2/screens/passage/ResourcesSheet';
import type { PassageImagesState } from '../../v2/screens/passage/usePassageImages';

const ITEMS: ImagesMapsItem[] = [
  {
    id: 'gallery-map',
    title: 'Jerusalem in the time of Jesus',
    caption: 'The city, the temple and the Mount of Olives',
    attribution: 'Bible Journey Maps',
    uri: 'https://picsum.photos/seed/fluent-gallery-map/1200/800',
    thumbnailUri: 'https://picsum.photos/seed/fluent-gallery-map/600/400',
  },
  {
    id: 'gallery-room',
    title: 'An upper room',
    uri: 'https://picsum.photos/seed/fluent-gallery-room/1200/800',
  },
];

/** Each state the sheet's Images and maps can be in. */
const STATES: { label: string; state: PassageImagesState }[] = [
  { label: 'Images', state: { status: 'ready', items: ITEMS } },
  { label: 'Loading', state: { status: 'loading' } },
  { label: 'None', state: { status: 'ready', items: [] } },
  { label: 'Not on this phone', state: { status: 'unprepared' } },
  { label: 'None offline', state: { status: 'noneOffline' } },
  { label: 'No text yet', state: { status: 'noVerses' } },
  { label: 'Failed', state: { status: 'failed' } },
];

/**
 * The Resources peek at the bottom of a passage page, over the page's own
 * content. Tap it to open the Resources sheet; pick a state below to see
 * each one. Retry in Failed loads the images.
 */
export function ResourcesPeekEntry() {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(0);
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.md },
    page: {
      height: 220,
      borderRadius: t.radius.sm,
      overflow: 'hidden',
      backgroundColor: t.roles.bgDefault,
      padding: t.spacing.lg,
      gap: t.spacing.sm,
    },
    row: { ...t.type.body, color: t.roles.fgSecondary },
    links: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.lg },
    link: { ...t.type.label, color: t.roles.accentPrimary },
    off: { color: t.roles.fgSecondary },
  }));

  return (
    <View style={styles.demo}>
      <ColorModeScope value="canvas">
        <View style={styles.page}>
          <Text style={styles.row}>Verse 22</Text>
          <Text style={styles.row}>Verse 23</Text>
          <Text style={styles.row}>Verse 24</Text>
          <ResourcesPeek shown onPress={() => setOpen(true)} />
        </View>
      </ColorModeScope>
      <View style={styles.links}>
        {STATES.map(({ label }, i) => (
          <Pressable
            key={label}
            accessibilityRole="radio"
            accessibilityState={{ checked: picked === i }}
            onPress={() => setPicked(i)}
          >
            <Text style={[styles.link, picked !== i && styles.off]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <ColorModeScope value="hardware">
        <ResourcesSheet
          visible={open}
          reference="Mark 14:22–25"
          images={{ state: STATES[picked].state, scope: String(picked) }}
          onRetryImages={() => setPicked(0)}
          onClose={() => setOpen(false)}
        />
      </ColorModeScope>
    </View>
  );
}
