import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Dialog } from '../../../components/ui/Dialog';
import {
  PICK_OVER_VERSES_CONFIRM,
  pickOverPassageTitle,
  RECORD_OVER_PASSAGE_CANCEL,
  recordOverPassageMessage,
} from '../../../constants/messages';
import { useThemedStyles } from '../../../theme/useTheme';

/** Passage take 1 covers Mark 14:22–25; take 2 is verse 23's own. */
const COVERING = {
  takeNumber: 1,
  startChapter: 14,
  startVerse: 22,
  endChapter: 14,
  endVerse: 25,
};

const COPY = {
  english: {
    title: pickOverPassageTitle(2, 23),
    message: recordOverPassageMessage(COVERING),
    confirm: PICK_OVER_VERSES_CONFIRM,
    cancel: RECORD_OVER_PASSAGE_CANCEL,
  },
  telugu: {
    title: 'v. 23 కోసం టేక్ 2 ను ఉపయోగించాలా?',
    message:
      'పాసేజ్ టేక్ 1 ఇకపై v. 22–25 కోసం ఉపయోగించబడదు, కాబట్టి ఆ వచనాలలో మిగిలినవి కూడా రికార్డ్ చేయాలి.',
    confirm: 'ఉపయోగించండి',
    cancel: 'రద్దు చేయి',
  },
};

/**
 * The player asks before a verse take replaces the passage take over it:
 * Use it or Cancel, or tap outside or press Back to back out. Also in
 * Telugu, for longer lines.
 */
export function DialogEntry() {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [telugu, setTelugu] = useState(false);
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.md },
    toggle: { alignSelf: 'flex-start' },
    link: { ...t.type.label, color: t.roles.accentPrimary },
    status: { ...t.type.meta, color: t.roles.fgSecondary },
  }));
  const copy = telugu ? COPY.telugu : COPY.english;

  return (
    <View style={styles.demo}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={styles.toggle}
        testID="gallery-dialog-open"
      >
        <Text style={styles.link}>Use take 2 for v. 23</Text>
      </Pressable>
      {answer ? <Text style={styles.status}>{answer}</Text> : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => setTelugu(v => !v)}
        style={styles.toggle}
      >
        <Text style={styles.link}>{telugu ? 'English' : 'Telugu'}</Text>
      </Pressable>
      <Dialog
        visible={open}
        title={copy.title}
        message={copy.message}
        confirmLabel={copy.confirm}
        onConfirm={() => {
          setOpen(false);
          setAnswer('Take 2 is official for v. 23');
        }}
        cancelLabel={copy.cancel}
        onCancel={() => {
          setOpen(false);
          setAnswer('Passage take 1 still covers v. 23');
        }}
      />
    </View>
  );
}
