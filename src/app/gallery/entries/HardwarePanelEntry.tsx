import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { setMicActive } from '../../../audio/micActivity';
import { useThemedStyles } from '../../../theme/useTheme';
import { PlayerKeys } from '../../v2/screens/passage/PlayerKeys';

/** Mark 14:22–25, stepped through in verse mode. */
const VERSES = [22, 23, 24, 25];

/**
 * The player's keys: the Mode toggle swaps them between Listen (Play ·
 * Previous · Next, stepping verses) and Record (Record · Play · Eject).
 * Record pauses and resumes one take, Eject finishes it, and a take in
 * progress locks the mode until then.
 */
export function HardwarePanelEntry() {
  const [recordMode, setRecordMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(1);
  const [take, setTake] = useState<'none' | 'recording' | 'paused'>('none');
  const [takes, setTakes] = useState(0);
  const recording = take === 'recording';
  // The player pads under the keys for the gesture bar; mid-gallery it shouldn't.
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.md },
    status: { ...t.type.meta, color: t.roles.fgSecondary },
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

  const status = recordMode
    ? recording
      ? `Recording take ${takes + 1} · finish it to switch to Listen`
      : take === 'paused'
      ? `Take ${takes + 1} paused · Record keeps going, Eject finishes it`
      : `Record · ${takes} ${takes === 1 ? 'take' : 'takes'}${
          playing ? ' · playing back' : ''
        }`
    : `Listen · Mark 14:${VERSES[at]}${playing ? ' · Playing' : ''}`;
  const previous = VERSES[at - 1];
  const next = VERSES[at + 1];

  return (
    <View style={styles.demo}>
      <Text style={styles.status}>{status}</Text>
      <SafeAreaInsetsContext.Provider value={{ ...insets, bottom: 0 }}>
        <PlayerKeys
          recordMode={recordMode}
          onRecordModeChange={changeMode}
          modeLocked={inTake}
          record={{
            recording,
            paused: take === 'paused',
            recordDisabled: false,
            onRecord: () => {
              setPlaying(false);
              setTake(t => (t === 'recording' ? 'paused' : 'recording'));
            },
            playing,
            playDisabled: inTake || takes === 0,
            onPlay: () => setPlaying(p => !p),
            finishDisabled: !inTake,
            onFinish: () => {
              setTakes(n => n + 1);
              setTake('none');
            },
          }}
          listen={{
            playing,
            playDisabled: false,
            playLabel: playing ? 'Pause source audio' : 'Play source audio',
            onPlay: () => setPlaying(p => !p),
          }}
          previous={{
            label:
              previous === undefined
                ? 'Previous'
                : `Previous: verse ${previous}`,
            disabled: previous === undefined,
            onPress: () => setAt(a => a - 1),
          }}
          next={{
            label: next === undefined ? 'Next' : `Next: verse ${next}`,
            disabled: next === undefined,
            onPress: () => setAt(a => a + 1),
          }}
        />
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}
