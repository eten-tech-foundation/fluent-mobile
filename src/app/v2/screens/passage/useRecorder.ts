import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  RECORD_MAX_TAKES,
  RECORD_MAX_VERSE_TAKES,
  RECORD_NO_PERICOPE,
  RECORD_NOT_OPEN,
  RECORD_PAUSED_TAKE,
  RECORD_RECOVERED_TAKE,
  RECORD_TAKEN_CHAPTER_WARNING,
} from '../../../../constants/messages';
import { MAX_RECORDING_TAKES } from '../../../../constants/recordingTakes';
import { useLiveLevels } from '../../../../hooks/useLiveLevels';
import { usePendingDelete } from '../../../../hooks/usePendingDelete';
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
  showing,
  onReload,
}: {
  passage: Ready;
  userId: number | null;
  /** The player is open in Record mode; leaving it commits a pending delete. */
  showing: boolean;
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
  const live = verseAudio.state === 'recording';
  const paused = verseAudio.state === 'paused';
  // A take found paused without recording here was recovered after a crash.
  // A failed save also lands on paused, so saving keeps what came before.
  const [wentLive, setWentLive] = useState(false);
  useEffect(() => {
    if (live) setWentLive(true);
    else if (!paused && verseAudio.state !== 'saving') setWentLive(false);
  }, [live, paused, verseAudio.state]);
  const recovered = paused && !wentLive;
  // A deleted take waits out the undo window first; Legacy's deleteTake does
  // the rest, including handing off the selection.
  const deletion = usePendingDelete(async id => {
    await verseAudio.deleteTake(id);
    // The hero's takes line falls back to the loaded passage once none are left.
    onReload();
  });
  // record() awaits a commit, then starts from the session as it is by then.
  const latestAudio = useRef(verseAudio);
  latestAudio.current = verseAudio;
  const showingRef = useRef(showing);
  showingRef.current = showing;
  useEffect(
    () => () => {
      showingRef.current = false;
    },
    [],
  );
  /** A take just deleted shows in front, with its undo, until it's settled. */
  const [frontOverride, setFrontOverride] = useState<string | null>(null);
  /** On a stage-locked chapter, the take tapped forward to play; the pick stays. */
  const [lockedFront, setLockedFront] = useState<string | null>(null);
  /** A paused or scrubbed spot in a take, for Play to start from. */
  const [parked, setParked] = useState<{ id: string; ms: number } | null>(null);
  const isPassageTake = (t: { id: string; granularity: string }) =>
    (session.effectiveUnit !== 'pericope' || t.granularity === 'pericope') &&
    !deletion.hiddenIds.has(t.id);
  // Whole-passage takes, live, so a new take shows as soon as it's saved.
  const liveTakes: PassageTake[] = verseAudio.takes
    .filter(isPassageTake)
    .map(t => ({
      id: t.id,
      takeNumber: t.takeNumber,
      selected: t.isSelected,
      recordedAt: t.createdAt,
    }));
  const takes =
    liveTakes.length > 0
      ? liveTakes
      : passage.takes.filter(t => !deletion.hiddenIds.has(t.id));

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
    .filter(isPassageTake)
    .sort((a, b) => a.takeNumber - b.takeNumber);
  const nextTakeNumber =
    passageTakes.reduce((n, t) => Math.max(n, t.takeNumber), 0) + 1;
  // The new take keeps its tile and wave from Eject until it's saved.
  const held = capturing || verseAudio.state === 'saving';
  const pendingId = deletion.pending?.id ?? null;
  // Only while that take's undo is open; after that the selected take leads.
  const overrideId = frontOverride === pendingId ? frontOverride : null;
  const leadId = overrideId ?? (session.stageLocked ? lockedFront : null);
  const pickedTake =
    passageTakes.find(t => t.id === verseAudio.selectedTake?.id) ??
    passageTakes[passageTakes.length - 1] ??
    null;
  const fan: FanTake[] = passageTakes.map(t => ({
    id: t.id,
    takeNumber: t.takeNumber,
    official: t.id === verseAudio.ownCanonicalTakeId,
    selected: t.id === pickedTake?.id,
    deleted: t.id === pendingId,
  }));
  if (held) {
    fan.push({
      id: 'recording',
      takeNumber: nextTakeNumber,
      official: false,
      recording: live,
      paused,
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
    : passageTakes.find(t => t.id === leadId) ?? pickedTake;
  const frontDeleted = frontTake !== null && frontTake.id === pendingId;
  const frontId = held ? 'recording' : frontTake?.id ?? 'placeholder';
  const playingFront =
    frontTake !== null && verseAudio.playingTakeId === frontTake.id;
  // Where Play picks up the front take: where it was paused or scrubbed to.
  const frontLength = frontTake?.durationMs ?? 0;
  const parkedMs =
    parked !== null && frontTake !== null && parked.id === frontTake.id
      ? parked.ms
      : 0;
  const take: FrontTake = held
    ? {
        takeNumber: nextTakeNumber,
        durationMs: session.elapsedMs,
        levels: liveLevels,
        progress: live ? 1 : 0,
        recording: live,
        paused,
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
            : frontLength > 0
            ? parkedMs / frontLength
            : 0,
        onSeek:
          frontDeleted || frontLength <= 0
            ? undefined
            : p => void scrubFront(p),
        recording: false,
        ...(frontDeleted
          ? { official: false, onUndo: () => undoDelete() }
          : {
              official: frontTake.id === verseAudio.ownCanonicalTakeId,
              onToggleOfficial: session.stageLocked
                ? undefined
                : () => void verseAudio.setCanonical(frontTake.id),
            }),
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
  // A take waiting on undo is deleted first when Record is pressed.
  const atCap =
    !held && !noPericope && !deletion.pending && !verseAudio.canRecordNewTake;
  const blockedReason = recovered
    ? RECORD_RECOVERED_TAKE
    : paused
    ? RECORD_PAUSED_TAKE
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

  function deleteTake(id: string) {
    const target = passageTakes.find(t => t.id === id);
    if (!target) return;
    if (verseAudio.state === 'playing' && verseAudio.playingTakeId === id) {
      void verseAudio.pausePlayback();
    }
    deletion.remove({ id, takeNumber: target.takeNumber });
    setFrontOverride(id);
    AccessibilityInfo.announceForAccessibility(
      `Take ${target.takeNumber} deleted. Undo is on the take card.`,
    );
  }

  function undoDelete() {
    const target = deletion.pending;
    deletion.undo();
    if (target) {
      AccessibilityInfo.announceForAccessibility(
        `Take ${target.takeNumber} restored.`,
      );
    }
  }

  function selectTake(id: string) {
    if (id === pendingId) {
      undoDelete();
      return;
    }
    setFrontOverride(null);
    if (session.stageLocked) {
      setLockedFront(id);
      return;
    }
    void verseAudio.selectTake(id);
  }

  // Closing the player or leaving Record hides the undo, so it commits.
  const { commit: commitDelete } = deletion;
  useEffect(() => {
    if (!showing) void commitDelete();
  }, [showing, commitDelete]);

  // The recorder's state only changes once the native call returns, so a
  // second key pressed meanwhile would act on a recorder mid-change.
  const busy = useRef(false);
  async function oneAtATime(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    try {
      await action();
    } finally {
      busy.current = false;
    }
  }

  // Record pauses and resumes one take; Eject finishes it.
  async function record() {
    if (verseAudio.state === 'saving') return;
    if (verseAudio.state === 'recording') {
      await verseAudio.pause();
      return;
    }
    if (verseAudio.state === 'paused') {
      await verseAudio.resume();
      return;
    }
    if (session.stageLocked || noPericope) return;
    if (!(await session.ensureMic())) return;
    // A new take counts toward the limit, so a pending delete goes first.
    await deletion.commit();
    // The player may have closed while the delete ran; don't record hidden.
    if (!showingRef.current) return;
    session.setElapsedMs(0);
    await latestAudio.current.start();
  }

  async function playTake() {
    if (verseAudio.state === 'playing') {
      if (playingFront) {
        setParked({ id: frontTake.id, ms: verseAudio.positionMs });
      }
      await verseAudio.pausePlayback();
      return;
    }
    // The take in front, which may not be the session's selected take.
    if (!frontTake) return;
    setParked(null);
    // Scrubbed to the very end, Play starts over.
    await verseAudio.playTake(
      frontTake,
      parkedMs >= frontLength ? 0 : parkedMs,
    );
  }

  async function scrubFront(p: number) {
    if (!frontTake) return;
    const ms = Math.round(p * frontLength);
    if (playingFront && verseAudio.state === 'playing') {
      await verseAudio.seek(ms, frontTake.id);
      return;
    }
    setParked({ id: frontTake.id, ms });
  }

  const footer: RecordStatus = {
    blockedReason: live ? null : blockedReason,
    take,
  };
  const keys: RecordKeys = {
    recording: live,
    paused,
    recordDisabled:
      !capturing &&
      (held ||
        noPericope ||
        atCap ||
        session.captureDisabled ||
        session.isTaken),
    onRecord: () => void oneAtATime(record),
    playing: verseAudio.state === 'playing',
    playDisabled: held || frontTake === null || frontDeleted,
    onPlay: () => void playTake(),
    finishDisabled: !capturing,
    onFinish: () => void oneAtATime(() => verseAudio.stop()),
  };

  return {
    /** A take is recording or paused: lock the mode and guard the close. */
    capturing,
    /** The passage's takes, live, for the hero's takes line. */
    takes,
    fan: {
      takes: fan,
      frontId,
      onSelect: selectTake,
      onDelete: held || session.stageLocked ? undefined : deleteTake,
    },
    footer,
    keys,
    discardCapture: verseAudio.discardCapture,
  };
}
