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

const VERSES = 5;

/**
 * The panel on the Listen and Record screens: the Mode toggle swaps the keys
 * between Listen (Play · Previous · Next) and Record (Record · Play · Eject),
 * and a take in progress locks the mode until it stops.
 */
export function HardwarePanelEntry() {
  const [recordMode, setRecordMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [verse, setVerse] = useState(1);
  const [recording, setRecording] = useState(false);
  const [takes, setTakes] = useState(0);
  const [ejected, setEjected] = useState(false);
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.md },
    status: {
      color: t.roles.fgSecondary,
      fontSize: t.typography.sizes.sm,
      includeFontPadding: false,
    },
    key: { flex: 1 },
  }));

  // Like a real take: haptics stay silent until it stops.
  useEffect(() => {
    if (!recording) {
      return;
    }
    setMicActive('gallery-hardware-panel', true);
    return () => setMicActive('gallery-hardware-panel', false);
  }, [recording]);

  const changeMode = (on: boolean) => {
    setPlaying(false);
    setEjected(false);
    setRecordMode(on);
  };
  const toggleRecording = () => {
    if (recording) {
      setTakes(n => n + 1);
    }
    setPlaying(false);
    setEjected(false);
    setRecording(r => !r);
  };

  // What Eject does isn't designed yet, so the demo only acknowledges it.
  const status = ejected
    ? `Eject pressed · its action is still TBD in Figma${
        playing ? ' · playing back' : ''
      }`
    : recordMode
    ? recording
      ? `Recording take ${takes + 1} · stop to switch to Listen`
      : `Record · ${takes} ${takes === 1 ? 'take' : 'takes'}${
          playing ? ' · playing back' : ''
        }`
    : `Listen · Verse ${verse} of ${VERSES}${playing ? ' · Playing' : ''}`;

  return (
    <View style={styles.demo}>
      <Text style={styles.status}>{status}</Text>
      <HardwarePanel
        recordMode={recordMode}
        onRecordModeChange={changeMode}
        modeLocked={recording}
        safeAreaBottom={false}
        testID="gallery-panel"
      >
        {recordMode ? (
          <>
            <Key
              icon={RecordIcon}
              accessibilityLabel={recording ? 'Stop recording' : 'Record'}
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
              disabled={recording || takes === 0}
              onPress={() => {
                setEjected(false);
                setPlaying(p => !p);
              }}
              style={styles.key}
              testID="gallery-panel-play-take"
            />
            <Key
              icon={EjectIcon}
              accessibilityLabel="Eject"
              disabled={recording || takes === 0}
              onPress={() => setEjected(true)}
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
              accessibilityLabel="Previous verse"
              disabled={verse === 1}
              onPress={() => setVerse(v => v - 1)}
              style={styles.key}
              testID="gallery-panel-previous"
            />
            <Key
              icon={SkipForwardIcon}
              accessibilityLabel="Next verse"
              disabled={verse === VERSES}
              onPress={() => setVerse(v => v + 1)}
              style={styles.key}
              testID="gallery-panel-next"
            />
          </>
        )}
      </HardwarePanel>
    </View>
  );
}
