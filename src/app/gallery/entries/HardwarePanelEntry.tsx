import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import {
  EjectFill,
  PauseFill,
  PlayFill,
  RecordFill,
  SkipBackFill,
  SkipForwardFill,
} from '../../../components/ui/icons';
import { setMicActive } from '../../../audio/micActivity';
import { HardwarePanel } from '../../../components/ui/HardwarePanel';
import { Key, type KeyIconProps } from '../../../components/ui/Key';
import { useTheme, useThemedStyles } from '../../../theme/useTheme';

const PlayIcon = PlayFill;
const PauseIcon = PauseFill;
const SkipBackIcon = SkipBackFill;
const SkipForwardIcon = SkipForwardFill;
const EjectIcon = EjectFill;
/** Figma's Record key glyph is accent/record, not the key's gray. */
function RecordIcon({ size }: KeyIconProps) {
  const { roles } = useTheme();
  return <RecordFill color={roles.accentRecord} size={size} />;
}

/** The script, then six listening materials. */
const PAGE_COUNT = 7;

/**
 * The panel on the Listen and Record screens: the Mode toggle swaps the keys
 * between Listen (Play · Previous · Next) and Record (Record · Play · Eject).
 * Record pauses and resumes one take, Eject finishes it, and a take in
 * progress locks the mode until then.
 */
export function HardwarePanelEntry() {
  const [recordMode, setRecordMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [page, setPage] = useState(1);
  const [take, setTake] = useState<'none' | 'recording' | 'paused'>('none');
  const [takes, setTakes] = useState(0);
  const recording = take === 'recording';
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.md },
    status: {
      color: t.roles.fgSecondary,
      fontSize: t.typography.sizes.sm,
      includeFontPadding: false,
    },
    key: { flex: 1 },
  }));

  // Like a real take: haptics stay silent until Eject finishes it.
  const inTake = take !== 'none';
  useEffect(() => {
    if (!inTake) {
      return;
    }
    setMicActive('gallery-hardware-panel', true);
    return () => setMicActive('gallery-hardware-panel', false);
  }, [inTake]);

  const changeMode = (on: boolean) => {
    setPlaying(false);
    setRecordMode(on);
  };
  const toggleRecording = () => {
    setPlaying(false);
    setTake(t => (t === 'recording' ? 'paused' : 'recording'));
  };
  const finishTake = () => {
    setTakes(n => n + 1);
    setTake('none');
  };

  const status = recordMode
    ? recording
      ? `Recording take ${takes + 1} · finish it to switch to Listen`
      : take === 'paused'
      ? `Take ${takes + 1} paused · Record keeps going, Eject finishes it`
      : `Record · ${takes} ${takes === 1 ? 'take' : 'takes'}${
          playing ? ' · playing back' : ''
        }`
    : `Listen · Page ${page} of ${PAGE_COUNT}${playing ? ' · Playing' : ''}`;

  return (
    <View style={styles.demo}>
      <Text style={styles.status}>{status}</Text>
      <HardwarePanel
        recordMode={recordMode}
        onRecordModeChange={changeMode}
        modeLocked={take !== 'none'}
        safeAreaBottom={false}
        testID="gallery-panel"
      >
        {recordMode ? (
          <>
            <Key
              icon={RecordIcon}
              accessibilityLabel={
                recording
                  ? 'Pause recording'
                  : take === 'paused'
                  ? 'Resume recording'
                  : 'Record'
              }
              announceLatched={false}
              active={recording}
              onPress={toggleRecording}
              style={styles.key}
              testID="gallery-panel-record"
            />
            <Key
              icon={playing ? PauseIcon : PlayIcon}
              accessibilityLabel={playing ? 'Pause' : 'Play take'}
              announceLatched={false}
              active={playing}
              disabled={take !== 'none' || takes === 0}
              onPress={() => setPlaying(p => !p)}
              style={styles.key}
              testID="gallery-panel-play-take"
            />
            <Key
              icon={EjectIcon}
              accessibilityLabel="Finish take"
              disabled={take === 'none'}
              onPress={finishTake}
              style={styles.key}
              testID="gallery-panel-eject"
            />
          </>
        ) : (
          <>
            <Key
              icon={playing ? PauseIcon : PlayIcon}
              accessibilityLabel={playing ? 'Pause' : 'Play'}
              announceLatched={false}
              active={playing}
              onPress={() => setPlaying(p => !p)}
              style={styles.key}
              testID="gallery-panel-play"
            />
            <Key
              icon={SkipBackIcon}
              accessibilityLabel="Previous page"
              disabled={page === 1}
              onPress={() => setPage(p => p - 1)}
              style={styles.key}
              testID="gallery-panel-previous"
            />
            <Key
              icon={SkipForwardIcon}
              accessibilityLabel="Next page"
              disabled={page === PAGE_COUNT}
              onPress={() => setPage(p => p + 1)}
              style={styles.key}
              testID="gallery-panel-next"
            />
          </>
        )}
      </HardwarePanel>
    </View>
  );
}
