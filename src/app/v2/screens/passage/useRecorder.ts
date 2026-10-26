import { useEffect, useRef } from 'react';
import {
  RECORD_MAX_TAKES,
  RECORD_MAX_VERSE_TAKES,
  RECORD_NO_PERICOPE,
  RECORD_NOT_OPEN,
  RECORD_RECOVERED_TAKE,
  RECORD_TAKEN_CHAPTER_WARNING,
} from '../../../../constants/messages';
import { MAX_RECORDING_TAKES } from '../../../../constants/recordingTakes';
import { useLiveLevels } from '../../../../hooks/useLiveLevels';
import type { PassageTake } from '../../../../hooks/usePassage';
import { useRecordSession } from '../../../../hooks/useRecordSession';
import type { RecordStatus } from './Footer';
import type { FrontTake } from './TakeCard';
import type { RecordKeys } from './PlayerKeys';
import type { FanTake } from './TakeFan';
import type { Ready } from './steps';

/**
 * Record mode's state for the passage player. Recording works as in Legacy's
 * Record tab: the shared session holds the capture unit, the chapter claim
 * and the rules for who can record here. This turns it into what the fan,
 * the take card and the keys show.
 */
export function useRecorder({
  passage,
  userId,
  onReload,
}: {
  passage: Ready;
  userId: number | null;
  /** Re-reads the passage, e.g. after recording claims its chapter. */
  onReload: () => void;
}) {
  const { assignment } = passage;
  const anchorVerse =
    passage.verses.find(v => v.chapterNumber === assignment.chapterNumber)
      ?.verseNumber ??
    passage.verses[0]?.verseNumber ??
    1;
  const session = useRecordSession({
    chapterData: assignment,
    userId,
    selectedVerse: anchorVerse,
    versesLength: passage.chapterVerseCount,
    draftingUnit: 'pericope',
    onChapterClaimed: onReload,
  });
  const { verseAudio } = session;
  const capturing = session.captureActive;
  /** Paused only happens after a crash: a recovered take waiting on Resume or Stop. */
  const live = verseAudio.state === 'recording';
  const recovered = verseAudio.state === 'paused';
  // Whole-passage takes, live, so a new take shows as soon as it's saved.
  const liveTakes: PassageTake[] = verseAudio.takes
    .filter(
      t => session.effectiveUnit !== 'pericope' || t.granularity === 'pericope',
    )
    .map(t => ({
      id: t.id,
      takeNumber: t.takeNumber,
      selected: t.isSelected,
      recordedAt: t.createdAt,
    }));
  const takes = liveTakes.length > 0 ? liveTakes : passage.takes;

  // Live input levels for the take in progress, kept per take for this
  // session so a take just recorded still shows its wave.
  const liveLevels = useLiveLevels(
    verseAudio.getMetering,
    capturing,
    verseAudio.state === 'recording',
  );
  const levelsByTake = useRef(new Map<string, number[]>());
  const knownTakeIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = verseAudio.takes.map(t => t.id);
    const known = knownTakeIds.current;
    const fresh = known ? ids.filter(id => !known.has(id)) : [];
    if (fresh.length === 1 && liveLevels.length > 0) {
      levelsByTake.current.set(fresh[0], liveLevels);
    }
    knownTakeIds.current = new Set(ids);
    // Only a change in the takes means one was saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verseAudio.takes]);

  const passageTakes = verseAudio.takes
    .filter(
      t => session.effectiveUnit !== 'pericope' || t.granularity === 'pericope',
    )
    .sort((a, b) => a.takeNumber - b.takeNumber);
  const nextTakeNumber =
    passageTakes.reduce((n, t) => Math.max(n, t.takeNumber), 0) + 1;
  // The new take keeps its tile and wave from Stop until it's saved.
  const held = capturing || verseAudio.state === 'saving';
  const fan: FanTake[] = passageTakes.map(t => ({
    id: t.id,
    takeNumber: t.takeNumber,
    official: t.id === verseAudio.ownCanonicalTakeId,
  }));
  if (held) {
    fan.push({
      id: 'recording',
      takeNumber: nextTakeNumber,
      official: false,
      recording: live,
    });
  } else if (fan.length < MAX_RECORDING_TAKES) {
    // Figma's dashed slot: where the next take lands, in front until the first.
    fan.push({
      id: 'placeholder',
      takeNumber: nextTakeNumber,
      official: false,
      placeholder: true,
    });
  }
  const frontTake = held
    ? null
    : passageTakes.find(t => t.id === verseAudio.selectedTake?.id) ??
      passageTakes[passageTakes.length - 1] ??
      null;
  const frontId = held ? 'recording' : frontTake?.id ?? 'placeholder';
  const playingFront =
    frontTake !== null && verseAudio.playingTakeId === frontTake.id;
  const take: FrontTake = held
    ? {
        takeNumber: nextTakeNumber,
        durationMs: session.elapsedMs,
        levels: liveLevels,
        progress: live ? 1 : 0,
        recording: live,
        official: false,
      }
    : frontTake
    ? {
        takeNumber: frontTake.takeNumber,
        durationMs: frontTake.durationMs ?? null,
        levels: levelsByTake.current.get(frontTake.id) ?? [],
        progress:
          playingFront && verseAudio.durationMs > 0
            ? verseAudio.positionMs / verseAudio.durationMs
            : 0,
        recording: false,
        official: frontTake.id === verseAudio.ownCanonicalTakeId,
        onToggleOfficial: () => void verseAudio.setCanonical(frontTake.id),
      }
    : {
        takeNumber: 1,
        durationMs: null,
        levels: [],
        progress: 0,
        recording: false,
        official: false,
      };
  // The player only records whole passages, so no pericope means no recording.
  const noPericope = session.pericopeUnavailable;
  const atCap = !held && !noPericope && !verseAudio.canRecordNewTake;
  const blockedReason = recovered
    ? RECORD_RECOVERED_TAKE
    : session.syncingMessage ??
      (session.isTaken
        ? RECORD_TAKEN_CHAPTER_WARNING
        : session.stageLocked || session.drafterCaptureBlocked
        ? RECORD_NOT_OPEN
        : noPericope
        ? RECORD_NO_PERICOPE
        : atCap && session.activeRecordingUnit !== null
        ? // The cap is per verse, so verse-by-verse takes count too.
          passageTakes.length >= MAX_RECORDING_TAKES
          ? RECORD_MAX_TAKES
          : RECORD_MAX_VERSE_TAKES
        : null);

  async function record() {
    // A double tap on Stop lands here while the take saves.
    if (verseAudio.state === 'saving') return;
    if (verseAudio.state === 'recording') {
      await verseAudio.stop();
      return;
    }
    if (verseAudio.state === 'paused') {
      await verseAudio.resume();
      return;
    }
    if (session.stageLocked || noPericope) return;
    if (!(await session.ensureMic())) return;
    session.setElapsedMs(0);
    await verseAudio.start();
  }

  async function playTake() {
    if (verseAudio.state === 'playing') {
      await verseAudio.pausePlayback();
      return;
    }
    // The take in front, which may not be the session's selected take.
    if (frontTake) await verseAudio.playTake(frontTake);
  }

  const footer: RecordStatus = {
    blockedReason: live ? null : blockedReason,
    take,
  };
  const keys: RecordKeys = {
    recording: live,
    recovered,
    recordDisabled:
      !capturing &&
      (held ||
        noPericope ||
        atCap ||
        session.captureDisabled ||
        session.isTaken),
    onRecord: () => void record(),
    onSave: () => void verseAudio.stop(),
    playing: verseAudio.state === 'playing',
    playDisabled: held || frontTake === null,
    onPlay: () => void playTake(),
  };

  return {
    /** A take is recording or paused: lock the mode and guard the close. */
    capturing,
    /** The passage's takes, live, for the hero's takes line. */
    takes,
    fan: {
      takes: fan,
      frontId,
      onSelect: (id: string) => void verseAudio.selectTake(id),
    },
    footer,
    keys,
    discardCapture: verseAudio.discardCapture,
  };
}
