import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { HardwarePanel } from '../../../../components/ui/HardwarePanel';
import {
  EjectFill,
  PauseFill,
  PlayFill,
  RecordFill,
  SkipBackFill,
  SkipForwardFill,
  StopFill,
} from '../../../../components/ui/icons';
import { Key } from '../../../../components/ui/Key';
import { useTheme } from '../../../../theme/useTheme';
import type { NextIconProps } from '../../../../components/ui/icons';

/** Figma's Record key: the dot is red at rest and while recording. */
function RecordDot({ size }: NextIconProps) {
  const theme = useTheme();
  return <RecordFill color={theme.roles.accentRecord} size={size} />;
}

/** How long one breath of the live Stop key takes, in and out (ms). */
const BREATH_MS = 900;
const BREATH_LOW = 0.45;

/**
 * Red Stop that breathes while a take records, a calm "live" signal.
 * Visual only: haptics stay silent for the whole take.
 */
function StopRed({ size }: NextIconProps) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const breath = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    breath.value = withRepeat(
      withSequence(
        withTiming(BREATH_LOW, { duration: BREATH_MS }),
        withTiming(1, { duration: BREATH_MS }),
      ),
      -1,
    );
    return () => cancelAnimation(breath);
  }, [reduceMotion, breath]);
  const style = useAnimatedStyle(() => ({ opacity: breath.value }));
  return (
    <Animated.View style={style}>
      <StopFill color={theme.roles.accentRecord} size={size} />
    </Animated.View>
  );
}

export interface RecordKeys {
  recording: boolean;
  /** A take recovered after a crash: Record resumes it, the next key saves it. */
  recovered: boolean;
  /** Can't record here right now; the footer says why. */
  recordDisabled: boolean;
  onRecord: () => void;
  onSave: () => void;
  playing: boolean;
  /** Nothing to play yet, or a take is being captured. */
  playDisabled: boolean;
  onPlay: () => void;
}

/** A key the sheet labels and turns on or off. */
export interface KeyAction {
  label: string;
  disabled: boolean;
  onPress: () => void;
}

/**
 * The player's Hardware panel; the player chrome puts it in Hardware. Record
 * mode captures real takes through the shared record session, and Eject
 * sends the chapter on. Listen mode's Play opens Legacy drafting until
 * playback is wired; Previous and Next turn the pages, like swiping.
 */
export function PlayerKeys({
  recordMode,
  onRecordModeChange,
  modeLocked,
  record,
  eject,
  previous,
  next,
  onOpenDrafting,
}: {
  recordMode: boolean;
  onRecordModeChange: (record: boolean) => void;
  /** Locked for the whole take. */
  modeLocked: boolean;
  record: RecordKeys;
  eject: KeyAction;
  previous: KeyAction;
  next: KeyAction;
  onOpenDrafting: () => void;
}) {
  return (
    <HardwarePanel
      recordMode={recordMode}
      onRecordModeChange={onRecordModeChange}
      modeLocked={modeLocked}
    >
      {recordMode ? (
        <>
          <Key
            icon={record.recording ? StopRed : RecordDot}
            accessibilityLabel={
              record.recording
                ? 'Stop recording'
                : record.recovered
                ? 'Resume take'
                : 'Record'
            }
            announceLatched={false}
            active={record.recording}
            disabled={record.recordDisabled}
            onPress={record.onRecord}
            style={styles.key}
            testID="passage-key-record"
          />
          {record.recovered ? (
            <Key
              icon={StopFill}
              accessibilityLabel="Stop and save take"
              onPress={record.onSave}
              style={styles.key}
              testID="passage-key-save"
            />
          ) : (
            <Key
              icon={record.playing ? PauseFill : PlayFill}
              accessibilityLabel={record.playing ? 'Pause take' : 'Play take'}
              announceLatched={false}
              active={record.playing}
              disabled={record.playDisabled}
              onPress={record.onPlay}
              style={styles.key}
              testID="passage-key-play"
            />
          )}
          <Key
            icon={EjectFill}
            accessibilityLabel={eject.label}
            disabled={eject.disabled}
            onPress={eject.onPress}
            style={styles.key}
            testID="passage-key-eject"
          />
        </>
      ) : (
        <>
          <Key
            icon={PlayFill}
            accessibilityLabel="Listen in drafting"
            onPress={onOpenDrafting}
            style={styles.key}
          />
          <Key
            icon={SkipBackFill}
            accessibilityLabel={previous.label}
            disabled={previous.disabled}
            onPress={previous.onPress}
            style={styles.key}
            testID="passage-key-previous"
          />
          <Key
            icon={SkipForwardFill}
            accessibilityLabel={next.label}
            disabled={next.disabled}
            onPress={next.onPress}
            style={styles.key}
            testID="passage-key-next"
          />
        </>
      )}
    </HardwarePanel>
  );
}

const styles = StyleSheet.create({ key: { flex: 1 } });
