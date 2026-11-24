import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useThemedStyles } from '../../../theme/useTheme';
import type { ImagesMapsItem } from '../../../types/resources/imagesMaps';
import { ResourcesCard } from '../../v2/screens/passage/ResourcesCard';
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
  {
    id: 'gallery-lake',
    title: 'The lake shore at Capernaum',
    uri: 'https://picsum.photos/seed/fluent-gallery-lake/1200/800',
  },
];

/** Each state the card's Images and maps can be in. */
const STATES: { label: string; state: PassageImagesState }[] = [
  { label: 'Images', state: { status: 'ready', items: ITEMS } },
  { label: 'Loading', state: { status: 'loading' } },
  { label: 'None', state: { status: 'ready', items: [] } },
  { label: 'Not on this phone', state: { status: 'unprepared' } },
  { label: 'None offline', state: { status: 'noneOffline' } },
  { label: 'No text yet', state: { status: 'noVerses' } },
  { label: 'Failed', state: { status: 'failed' } },
];

/** What the docked card previews: the first three, once there are any. */
const previewsOf = (state: PassageImagesState) =>
  state.status === 'ready' ? state.items.slice(0, 3) : [];

/** The page frame's height, and how tall the card grows inside it. */
const PAGE = 440;
const GROWN = 380;

/**
 * The Resources card docked at the bottom of a passage page, previewing up
 * to three images in line. Tap it or flick it up to grow it into the
 * resources; flick it down or tap its chevron to put it back. Pick a state below to
 * see each one; Retry in Failed loads them.
 */
export function ResourcesPeekEntry() {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(0);
  const player = useSharedValue(0);
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.md },
    page: {
      height: PAGE,
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
      <View style={styles.page}>
        <Text style={styles.row}>Verse 22</Text>
        <Text style={styles.row}>Verse 23</Text>
        <Text style={styles.row}>Verse 24</Text>
        <ResourcesCard
          shown
          open={open}
          onOpenChange={setOpen}
          maxHeight={GROWN}
          player={player}
          onPeekHeight={() => {}}
          images={{ state: STATES[picked].state, scope: String(picked) }}
          previews={previewsOf(STATES[picked].state)}
          previewsScope={String(picked)}
          onRetryImages={() => setPicked(0)}
        />
      </View>
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
    </View>
  );
}
