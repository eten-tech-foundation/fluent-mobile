import { Alert } from 'react-native';
import {
  CAPTURE_LEAVE_DISCARD,
  CAPTURE_LEAVE_MESSAGE,
  CAPTURE_LEAVE_RESUME,
  CAPTURE_LEAVE_TITLE,
} from '../constants/messages';
import type { VerseAudioState } from './verseAudioReducer';

/**
 * Stepping verse by verse in a record session: the verses either side, and a
 * move that offers Resume or Discard first while a take is in progress (#49).
 * Shared by Legacy's Record tab and the Next player.
 */
export function useVerseStep({
  verses,
  selectedVerse,
  onChange,
  audioState,
  discardCapture,
  resetCapture,
}: {
  verses: readonly { verseNumber: number }[];
  selectedVerse: number;
  onChange: (verseNumber: number) => void;
  audioState: VerseAudioState;
  discardCapture: () => Promise<void>;
  /** The session's, so the old verse's text id and unit don't carry over. */
  resetCapture: () => void;
}) {
  const index = verses.findIndex(v => v.verseNumber === selectedVerse);
  const previous = index > 0 ? verses[index - 1]?.verseNumber ?? null : null;
  const next = index >= 0 ? verses[index + 1]?.verseNumber ?? null : null;

  function change(verseNumber: number) {
    resetCapture();
    onChange(verseNumber);
  }

  function request(verseNumber: number) {
    // Resetting without a move would leave the capture with no text id.
    if (verseNumber === selectedVerse) return;
    if (audioState === 'paused' || audioState === 'recording') {
      Alert.alert(CAPTURE_LEAVE_TITLE, CAPTURE_LEAVE_MESSAGE, [
        { text: CAPTURE_LEAVE_RESUME, style: 'cancel' },
        {
          text: CAPTURE_LEAVE_DISCARD,
          style: 'destructive',
          onPress: () => {
            void discardCapture().then(() => change(verseNumber));
          },
        },
      ]);
      return;
    }
    change(verseNumber);
  }

  return { index, previous, next, request };
}
