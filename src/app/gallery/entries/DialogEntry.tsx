import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Dialog } from '../../../components/ui/Dialog';
import { useThemedStyles } from '../../../theme/useTheme';

const COPY = {
  english: {
    title: 'Send Mark 14 to Peer Check?',
    message:
      'This marks Mark 14 as ready for Peer Check. You won’t be able to record on it after you send it.',
    confirm: 'Send',
    cancel: 'Not yet',
  },
  telugu: {
    title: 'మార్కు 14 ను సహచర తనిఖీకి పంపాలా?',
    message:
      'ఇది మార్కు 14 ను సహచర తనిఖీకి సిద్ధంగా ఉన్నట్లు గుర్తిస్తుంది. పంపిన తర్వాత మీరు దానిపై రికార్డ్ చేయలేరు.',
    confirm: 'పంపండి',
    cancel: 'ఇంకా కాదు',
  },
};

/**
 * Asks before sending a chapter on: Send or Not yet, or tap outside or press
 * Back to back out. Also in Telugu, for longer lines.
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
        <Text style={styles.link}>Send Mark 14</Text>
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
          setAnswer('Sent to Peer Check');
        }}
        cancelLabel={copy.cancel}
        onCancel={() => {
          setOpen(false);
          setAnswer('Not sent yet');
        }}
      />
    </View>
  );
}
