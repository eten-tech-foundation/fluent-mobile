import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { TrackRow, type TrackRowState } from '../../../components/ui/TrackRow';
import { useThemedStyles } from '../../../theme/useTheme';

/** Whole steps, so a track lands exactly on heard; 100ms like playback. */
const STEPS = 40;
const STEP_MS = 100;
const REFERENCE = 'Mark 14:22–25';

const TRACKS = [
  { id: 'hear', title: 'Hear & Heart', listened: STEPS },
  { id: 'stage', title: 'Setting the Stage', listened: STEPS / 2 },
  { id: 'scenes', title: 'Defining the Scenes', listened: 0 },
  { id: 'embody', title: 'Embodying the Text', listened: 0 },
];

/**
 * Tap a row to play it: its button rises out of the ring and pauses or
 * resumes in place. Playing another row, or finishing, sinks it back.
 */
export function TrackRowEntry() {
  const [listened, setListened] = useState<Record<string, number>>(() =>
    Object.fromEntries(TRACKS.map(t => [t.id, t.listened])),
  );
  const [live, setLive] = useState<{ id: string; playing: boolean } | null>(
    null,
  );
  const styles = useThemedStyles(t => ({ rows: { gap: t.spacing.xs } }));

  const playingId = live?.playing ? live.id : null;
  const playingSteps = playingId ? listened[playingId] : 0;

  useEffect(() => {
    if (!playingId) return;
    if (playingSteps >= STEPS) {
      setLive(null);
      return;
    }
    const timer = setTimeout(
      () => setListened(l => ({ ...l, [playingId]: l[playingId] + 1 })),
      STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [playingId, playingSteps]);

  const play = (id: string) => {
    if (listened[id] >= STEPS) setListened(l => ({ ...l, [id]: 0 }));
    setLive({ id, playing: true });
  };

  return (
    <View style={styles.rows}>
      {TRACKS.map(track => {
        const state: TrackRowState =
          live?.id === track.id
            ? live.playing
              ? 'playing'
              : 'paused'
            : 'idle';
        return (
          <TrackRow
            key={track.id}
            title={track.title}
            meta={REFERENCE}
            listened={listened[track.id] / STEPS}
            state={state}
            onPress={() => play(track.id)}
            onToggle={() =>
              setLive(l => (l ? { ...l, playing: !l.playing } : l))
            }
            testID={`gallery-track-${track.id}`}
          />
        );
      })}
    </View>
  );
}
