import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { setMicActive } from '../../../audio/micActivity';
import { RecordFill, StopFill } from '../../../components/ui/icons';
import { Key } from '../../../components/ui/Key';
import { KeyDeck } from '../../../components/ui/KeyDeck';
import { LevelWave } from '../../../components/ui/LevelWave';
import { useThemedStyles } from '../../../theme/useTheme';

/** 100ms, the rate the recorder would report metering. */
const TICK_MS = 100;
/** Back button width in the Pericope header; it lands with #692. */
const HEADER_SIDE = 48;

/**
 * Stand-in for mic metering until the recorder reports it: syllable-length
 * bursts with pauses between phrases, so silence rests and speech lifts.
 */
function simulatedLevel(tick: number) {
  const t = tick * (TICK_MS / 1000);
  if (Math.sin(t * 0.9) < -0.55) {
    return 0;
  }
  const syllable = Math.abs(Math.sin(t * 7.3));
  const phrase = 0.45 + 0.55 * Math.abs(Math.sin(t * 1.7));
  const grain = 0.85 + 0.15 * Math.sin(tick * 12.9898);
  return Math.min(1, syllable * phrase * grain);
}

function formatTime(ticks: number) {
  const seconds = Math.floor((ticks * TICK_MS) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Record a take: the Pericope header's short wave shows the live level as
 * status, and the take card's long wave draws the take as it's recorded.
 * Levels are simulated until the recorder turns on metering.
 */
export function LevelWaveEntry() {
  const [recording, setRecording] = useState(false);
  const [levels, setLevels] = useState<number[]>([]);
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.lg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    side: { width: HEADER_SIDE },
    recordKey: { flex: 1 },
  }));

  useEffect(() => {
    if (!recording) {
      return;
    }
    const timer = setInterval(
      () => setLevels(l => [...l, simulatedLevel(l.length)]),
      TICK_MS,
    );
    // Like a real take: haptics stay silent until it stops.
    setMicActive('gallery-level-wave', true);
    return () => {
      clearInterval(timer);
      setMicActive('gallery-level-wave', false);
    };
  }, [recording]);

  const toggleRecording = () => {
    if (!recording) {
      setLevels([]);
    }
    setRecording(r => !r);
  };
  // The header shows status: live while recording, resting otherwise.
  const statusLevels = recording ? levels : [];

  return (
    <View style={styles.demo}>
      <View style={styles.header}>
        <View style={styles.side} />
        <LevelWave
          variant="short"
          levels={statusLevels}
          accessibilityLabel={recording ? 'Recording' : 'Not recording'}
          testID="gallery-level-short"
        />
        <View style={styles.side} />
      </View>
      {/* Follows the gallery's Mode switcher; the real take card is Canvas. */}
      <TakeCard
        levels={levels}
        recording={recording}
        time={formatTime(levels.length)}
      />
      <KeyDeck>
        <Key
          icon={recording ? StopFill : RecordFill}
          accessibilityLabel={recording ? 'Stop recording' : 'Record'}
          announceLatched={false}
          active={recording}
          onPress={toggleRecording}
          style={styles.recordKey}
          testID="gallery-level-record"
        />
      </KeyDeck>
    </View>
  );
}

function TakeCard({
  levels,
  recording,
  time,
}: {
  levels: number[];
  recording: boolean;
  time: string;
}) {
  const styles = useThemedStyles(t => ({
    card: {
      backgroundColor: t.roles.bgDefault,
      borderRadius: t.radius.sm,
      padding: t.spacing.lg,
      gap: t.spacing.md,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    title: {
      color: t.roles.fgPrimary,
      fontSize: t.typography.sizes.sm,
      fontWeight: t.typography.weights.semibold,
      includeFontPadding: false,
    },
    time: {
      color: t.roles.fgSecondary,
      fontSize: t.typography.sizes.sm,
      fontVariant: ['tabular-nums'],
      includeFontPadding: false,
    },
  }));

  return (
    <View style={styles.card}>
      <LevelWave
        variant="long"
        levels={levels}
        recording={recording}
        accessibilityLabel={recording ? `Take 1, recording, ${time}` : 'Take 1'}
        testID="gallery-level-long"
      />
      <View style={styles.footer}>
        <Text style={styles.title}>Take 1</Text>
        <Text style={styles.time}>{time}</Text>
      </View>
    </View>
  );
}
