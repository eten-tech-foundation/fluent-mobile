import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { setMicActive } from '../../../audio/micActivity';
import { EjectFill, PauseFill, PlayFill } from '../../../components/ui/icons';
import { Key } from '../../../components/ui/Key';
import { KeyDeck } from '../../../components/ui/KeyDeck';
import { MAX_RECORDING_TAKES } from '../../../constants/recordingTakes';
import {
  RECORD_MAX_TAKES,
  RECORD_PAUSED_TAKE,
} from '../../../constants/messages';
import { UNDO_MS } from '../../../hooks/usePendingDelete';
import { ColorModeScope, useThemedStyles } from '../../../theme/useTheme';
import { OFFICIAL_TOGGLE } from '../../v2/screens/passage/OfficialToggle';
import { RecordDot, StopRed } from '../../v2/screens/passage/PlayerKeys';
import {
  TakeCard,
  WAVE_H,
  type FrontTake,
} from '../../v2/screens/passage/TakeCard';
import {
  TAKE_FAN_BIN_ROOM,
  TakeFan,
  type FanTake,
} from '../../v2/screens/passage/TakeFan';

/** 100ms matches the recorder's level samples. */
const TICK_MS = 100;
const VERSE = 23;
/** The passage take over this verse, from Pericope mode. */
const COVER = {
  id: 'passage-1',
  takeNumber: 1,
  range: 'v. 22–25',
  durationMs: 14000,
};

interface Take {
  id: string;
  takeNumber: number;
  levels: number[];
  durationMs: number;
}

/** Syllable bursts with pauses between phrases, like speech. */
function level(tick: number) {
  const t = tick * (TICK_MS / 1000);
  if (Math.sin(t * 0.9) < -0.55) return 0;
  const syllable = Math.abs(Math.sin(t * 7.3));
  return Math.min(1, syllable * (0.45 + 0.55 * Math.abs(Math.sin(t * 1.7))));
}

function recorded(takeNumber: number, seconds: number): Take {
  const ticks = (seconds * 1000) / TICK_MS;
  return {
    id: `take-${takeNumber}`,
    takeNumber,
    levels: Array.from({ length: ticks }, (_, i) => level(i + takeNumber * 37)),
    durationMs: seconds * 1000,
  };
}

const label = (n: number) => `v. ${VERSE} · Take ${n}`;

/** The take in use: the official one, else the newest, else the next slot. */
function inUse(takes: Take[], officialId: string | null) {
  return officialId ?? takes[takes.length - 1]?.id ?? 'placeholder';
}

/**
 * Record mode in verse mode, Mark 14:23: tap a take to bring it to the
 * front, mark it official on its card, or hold and drag it up to the bin and
 * undo it there. Record, pause and Eject a new take into the fan. The
 * passage take over this verse sits in the fan too, and can't be deleted.
 */
export function TakeFanEntry() {
  return (
    <ColorModeScope value="canvas">
      <Recorder />
    </ColorModeScope>
  );
}

/** The recorder, read inside its Canvas scope like the player. */
function Recorder() {
  const [takes, setTakes] = useState<Take[]>(() => [
    recorded(1, 6),
    recorded(2, 8),
  ]);
  const [officialId, setOfficialId] = useState<string | null>('take-2');
  const [frontId, setFrontId] = useState('take-2');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [held, setHeld] = useState<'none' | 'recording' | 'paused'>('none');
  const [live, setLive] = useState<number[]>([]);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const mode = useSharedValue(1);
  const recording = held === 'recording';
  // Numbered after the passage take too, as the recorder does.
  const nextNumber =
    takes.reduce((n, t) => Math.max(n, t.takeNumber), COVER.takeNumber) + 1;
  const full = takes.length >= MAX_RECORDING_TAKES;
  // A take waiting on undo goes for good when Record starts, so it's no cap.
  const atCap = full && pendingId === null;

  const styles = useThemedStyles(t => ({
    demo: { gap: t.spacing.lg },
    stage: {
      backgroundColor: t.roles.bgDefault,
      borderRadius: t.radius.sm,
    },
    script: {
      height: TAKE_FAN_BIN_ROOM,
      justifyContent: 'center',
      gap: t.spacing.xs,
      paddingHorizontal: t.spacing.xl,
    },
    hint: { ...t.type.meta, color: t.roles.fgSecondary, textAlign: 'center' },
    // The footer's height in Record: its padding, the wave and the row.
    footer: {
      height:
        t.spacing.lg +
        WAVE_H +
        t.spacing.lg +
        OFFICIAL_TOGGLE +
        t.spacing.xxl +
        t.spacing.lg,
    },
    fan: { paddingBottom: t.spacing.xs },
    key: { flex: 1 },
  }));

  // Like a real take: haptics stay silent until Eject finishes it.
  const inTake = held !== 'none';
  useEffect(() => {
    if (!inTake) return;
    setMicActive('gallery-take-fan', true);
    return () => setMicActive('gallery-take-fan', false);
  }, [inTake]);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(
      () => setLive(l => [...l, level(l.length + nextNumber * 37)]),
      TICK_MS,
    );
    return () => clearInterval(timer);
  }, [recording, nextNumber]);

  // The undo window: once it runs out, the take is gone.
  const finishRef = useRef(finishDelete);
  finishRef.current = finishDelete;
  useEffect(() => {
    if (pendingId === null) return;
    const timer = setTimeout(() => finishRef.current(pendingId), UNDO_MS);
    return () => clearTimeout(timer);
  }, [pendingId]);

  const frontTake = takes.find(t => t.id === frontId) ?? null;
  const frontCover = frontId === COVER.id;
  const frontLength = frontCover ? COVER.durationMs : frontTake?.durationMs;
  const playable =
    !inTake && frontLength !== undefined && frontId !== pendingId;

  useEffect(() => {
    if (!playing || frontLength === undefined) return;
    if (progress >= 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(
      () => setProgress(p => Math.min(1, p + TICK_MS / frontLength)),
      TICK_MS,
    );
    return () => clearTimeout(timer);
  }, [playing, progress, frontLength]);

  function finishDelete(id: string) {
    const rest = takes.filter(t => t.id !== id);
    const official = officialId === id ? null : officialId;
    setTakes(rest);
    setPendingId(null);
    setOfficialId(official);
    if (frontId === id) setFrontId(inUse(rest, official));
  }
  const bringForward = (id: string) => {
    setPlaying(false);
    setProgress(0);
    setFrontId(id);
  };
  // Tapping the take in front goes back to the one in use.
  const select = (id: string) => {
    if (id === pendingId) setPendingId(null);
    else bringForward(id === frontId ? inUse(takes, officialId) : id);
  };
  const remove = (id: string) => {
    if (pendingId !== null) finishDelete(pendingId);
    bringForward(id);
    setPendingId(id);
  };
  const toggleRecord = () => {
    if (held === 'none') {
      if (pendingId !== null) finishDelete(pendingId);
      setPlaying(false);
      setLive([]);
      setHeld('recording');
    } else {
      setHeld(held === 'recording' ? 'paused' : 'recording');
    }
  };
  const eject = () => {
    const take: Take = {
      id: `take-${nextNumber}`,
      takeNumber: nextNumber,
      levels: live,
      durationMs: live.length * TICK_MS,
    };
    setTakes(ts => [...ts, take]);
    setHeld('none');
    bringForward(take.id);
  };
  const toggleOfficial = (id: string) =>
    setOfficialId(o => (o === id ? null : id));

  const fan: FanTake[] = [
    {
      id: COVER.id,
      takeNumber: COVER.takeNumber,
      official: officialId === COVER.id,
      selected: officialId === COVER.id,
      passage: COVER.range,
    },
    ...takes.map(t => ({
      id: t.id,
      takeNumber: t.takeNumber,
      official: officialId === t.id,
      selected: officialId === t.id,
      deleted: t.id === pendingId,
    })),
  ];
  if (inTake) {
    fan.push({
      id: 'recording',
      takeNumber: nextNumber,
      official: false,
      recording,
      paused: held === 'paused',
    });
  } else if (!full) {
    fan.push({
      id: 'placeholder',
      takeNumber: nextNumber,
      official: false,
      placeholder: true,
    });
  }

  const front: FrontTake = inTake
    ? {
        takeNumber: nextNumber,
        label: label(nextNumber),
        durationMs: live.length * TICK_MS,
        levels: live,
        progress: 1,
        recording,
        paused: held === 'paused',
        official: false,
      }
    : frontTake
    ? {
        takeNumber: frontTake.takeNumber,
        label: label(frontTake.takeNumber),
        durationMs: frontTake.durationMs,
        levels: frontTake.levels,
        progress,
        recording: false,
        ...(frontTake.id === pendingId
          ? { official: false, onUndo: () => setPendingId(null) }
          : {
              official: officialId === frontTake.id,
              onToggleOfficial: () => toggleOfficial(frontTake.id),
              onSeek: setProgress,
            }),
      }
    : frontCover
    ? {
        takeNumber: COVER.takeNumber,
        label: `Passage take ${COVER.takeNumber} · ${COVER.range}`,
        durationMs: COVER.durationMs,
        levels: [],
        progress,
        recording: false,
        official: officialId === COVER.id,
        onToggleOfficial: () => toggleOfficial(COVER.id),
        onSeek: setProgress,
      }
    : {
        takeNumber: nextNumber,
        label: label(nextNumber),
        durationMs: null,
        levels: [],
        progress: 0,
        recording: false,
        official: false,
      };
  const blockedReason =
    held === 'paused'
      ? RECORD_PAUSED_TAKE
      : !inTake && atCap
      ? RECORD_MAX_TAKES
      : null;

  return (
    <View style={styles.demo}>
      <View style={styles.stage}>
        <View style={styles.script}>
          <Text style={styles.hint}>
            {`${takes.length} of ${MAX_RECORDING_TAKES} takes on v. ${VERSE}`}
          </Text>
          <Text style={styles.hint}>
            Hold a take and drag it up here to the bin
          </Text>
        </View>
        <View style={styles.fan}>
          <TakeFan
            takes={fan}
            frontId={inTake ? 'recording' : frontId}
            onSelect={select}
            onDelete={inTake ? undefined : remove}
          />
        </View>
        <View style={styles.footer}>
          <TakeCard
            take={front}
            blockedReason={blockedReason}
            firstVerse={VERSE}
            mode={mode}
            shown
          />
        </View>
      </View>
      <ColorModeScope value="hardware">
        <KeyDeck>
          <Key
            icon={recording ? StopRed : RecordDot}
            accessibilityLabel={
              recording
                ? 'Pause recording'
                : held === 'paused'
                ? 'Resume recording'
                : 'Record'
            }
            announceLatched={false}
            active={recording}
            disabled={!inTake && atCap}
            onPress={toggleRecord}
            style={styles.key}
            testID="gallery-take-record"
          />
          <Key
            icon={playing ? PauseFill : PlayFill}
            accessibilityLabel={playing ? 'Pause take' : 'Play take'}
            announceLatched={false}
            active={playing}
            disabled={!playable}
            onPress={() => {
              if (!playing && progress >= 1) setProgress(0);
              setPlaying(p => !p);
            }}
            style={styles.key}
            testID="gallery-take-play"
          />
          <Key
            icon={EjectFill}
            accessibilityLabel="Finish take"
            disabled={!inTake}
            onPress={eject}
            style={styles.key}
            testID="gallery-take-eject"
          />
        </KeyDeck>
      </ColorModeScope>
    </View>
  );
}
