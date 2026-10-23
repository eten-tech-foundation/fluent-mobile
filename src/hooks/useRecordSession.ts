import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { requestMicPermission } from '../audio/micPermission';
import {
  getBibleTextId,
  getPericopeForVerse,
  type PericopeGroupResult,
} from '../db/queries';
import { getProjectPericopeSetId } from '../db/repository';
import type { DraftingUnit } from '../services/draftingUnitPreference';
import type { CaptureControls } from '../types/captureControls';
import type { ChapterAssignmentData } from '../types/db/types';
import { isChapterTakenByOther } from '../utils/chapterTakenStatus';
import { recordSourceTextHint } from '../utils/recordSourceTextHint';
import {
  recordingUnitCapturesEqual,
  type RecordingUnitCapture,
} from '../utils/recordingRange';
import {
  isDrafterBlockedFromOpenPeerCheckCapture,
  isRecordingLockedByStage,
} from '../utils/stageAdvancement';
import { resolveRecordingUnit } from './resolveRecordingUnit';
import { useGlobalSyncStatus } from './useGlobalSyncStatus';
import { useVerseAudio } from './useVerseAudio';
import type { VerseAudioState } from './verseAudioReducer';

export interface RecordSessionArgs {
  chapterData: ChapterAssignmentData;
  userId: number | null;
  /** Verse the capture is for; in pericope mode, any verse in the pericope. */
  selectedVerse: number;
  /** The chapter's verse count; re-resolves the text id once verses load. */
  versesLength: number;
  draftingUnit: DraftingUnit;
  onChapterClaimed?: () => void;
  onCaptureActiveChange?: (active: boolean) => void;
  /** Resume/Discard while a take is in progress, null when it ends (#49). */
  onRegisterCaptureControls?: (controls: CaptureControls | null) => void;
  /** After the takes change, e.g. to refresh which verses are recorded. */
  onTakesChanged?: () => void | Promise<void>;
}

/**
 * Capturing a take for one verse or pericope: the capture unit and text id,
 * useVerseAudio, the timer and crash recovery, the mic, and the rules for
 * who can record here and when. Shared by Legacy's Record tab and the Next
 * player so recording behaves the same in both UIs.
 */
export function useRecordSession({
  chapterData,
  userId,
  selectedVerse,
  versesLength,
  draftingUnit,
  onChapterClaimed,
  onCaptureActiveChange,
  onRegisterCaptureControls,
  onTakesChanged,
}: RecordSessionArgs) {
  const [bibleTextId, setBibleTextId] = useState<number | null>(null);
  /** Verse `selectedVerse` that `bibleTextId` was resolved for (null while stale). */
  const [bibleTextVerse, setBibleTextVerse] = useState<number | null>(null);

  const [elapsedMs, setElapsedMs] = useState(0);

  const [recordingUnit, setRecordingUnit] =
    useState<RecordingUnitCapture | null>(null);

  const [pericopeSetId, setPericopeSetId] = useState<number | null>(null);
  const [pericopeSetResolved, setPericopeSetResolved] = useState(
    chapterData.projectId === null,
  );
  const [activePericope, setActivePericope] =
    useState<PericopeGroupResult | null>(null);
  const [activePericopeResolved, setActivePericopeResolved] = useState(
    draftingUnit !== 'pericope',
  );
  const pericopeRequestIdRef = useRef(0);

  useEffect(() => {
    if (chapterData.projectId === null) {
      setPericopeSetId(null);
      setPericopeSetResolved(true);
      return;
    }
    setPericopeSetResolved(false);
    let cancelled = false;
    void getProjectPericopeSetId(chapterData.projectId).then(id => {
      if (!cancelled) {
        setPericopeSetId(id);
        setPericopeSetResolved(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [chapterData.projectId]);

  useEffect(() => {
    const requestId = ++pericopeRequestIdRef.current;
    if (draftingUnit !== 'pericope') {
      setActivePericope(null);
      setActivePericopeResolved(true);
      return;
    }
    if (!pericopeSetResolved) {
      setActivePericope(null);
      setActivePericopeResolved(false);
      return;
    }
    if (pericopeSetId === null) {
      setActivePericope(null);
      setActivePericopeResolved(true);
      return;
    }
    setActivePericope(null);
    setActivePericopeResolved(false);
    void getPericopeForVerse(
      chapterData.bookId,
      chapterData.chapterNumber,
      selectedVerse,
      pericopeSetId,
    ).then(result => {
      if (requestId === pericopeRequestIdRef.current) {
        setActivePericope(result);
        setActivePericopeResolved(true);
      }
    });
  }, [
    draftingUnit,
    pericopeSetId,
    pericopeSetResolved,
    chapterData.bookId,
    chapterData.chapterNumber,
    selectedVerse,
  ]);

  const pericopeUnavailable =
    draftingUnit === 'pericope' &&
    pericopeSetResolved &&
    (pericopeSetId === null ||
      (activePericopeResolved && activePericope === null));

  /**
   * Unit used for capture + My Takes rows. Settings may say 'pericope' while
   * the project has no local pericope data (#588); in that case behave as verse
   * mode so verse takes stay real, deletable rows instead of a stitched row.
   */
  const effectiveUnit = pericopeUnavailable ? 'verse' : draftingUnit;

  const captureBibleTextId = useMemo(() => {
    if (bibleTextId === null || bibleTextVerse !== selectedVerse) {
      return null;
    }
    return bibleTextId;
  }, [bibleTextId, bibleTextVerse, selectedVerse]);

  const recordingCaptureReady = useMemo(() => {
    if (captureBibleTextId === null) {
      return false;
    }
    if (effectiveUnit !== 'pericope') {
      return true;
    }
    return (
      recordingUnit !== null &&
      recordingUnit.coveredViews.some(
        view =>
          view.bibleTextId === captureBibleTextId &&
          view.chapterNumber === chapterData.chapterNumber &&
          view.verseNumber === selectedVerse,
      )
    );
  }, [
    captureBibleTextId,
    chapterData.chapterNumber,
    effectiveUnit,
    recordingUnit,
    selectedVerse,
  ]);

  const activeRecordingUnit =
    effectiveUnit === 'pericope' && recordingCaptureReady
      ? recordingUnit
      : null;

  const verseAudio = useVerseAudio({
    bibleTextId: captureBibleTextId,
    chapterAssignmentId: chapterData.id,
    projectUnitId: chapterData.projectUnitId,
    userId,
    chapterClaim: {
      bibleId: chapterData.bibleId,
      bookId: chapterData.bookId,
      chapterNumber: chapterData.chapterNumber,
      assignedUserId: chapterData.assignedUserId,
    },
    onChapterClaimed,
    chapterNumber: chapterData.chapterNumber,
    verseNumber: selectedVerse,
    draftingUnit: effectiveUnit,
    recordingUnit: activeRecordingUnit,
  });
  /**
   * Latest-value ref synced during render so async `resolveRecordingUnit`
   * settlements read current audio state without listing `verseAudio.state` in
   * effect deps (that re-ran resolve and looped REHYDRATE — #411). Do not move
   * to useLayoutEffect: the .then can settle before layout effects run.
   */
  const verseAudioStateRef = useRef<VerseAudioState>(verseAudio.state);
  verseAudioStateRef.current = verseAudio.state;

  const resolveBibleTextId = useCallback(async () => {
    return getBibleTextId(
      chapterData.bibleId,
      chapterData.bookId,
      chapterData.chapterNumber,
      selectedVerse,
    );
  }, [
    chapterData.bibleId,
    chapterData.bookId,
    chapterData.chapterNumber,
    selectedVerse,
  ]);

  useEffect(() => {
    if (verseAudio.recoveredElapsedMs > 0) {
      setElapsedMs(verseAudio.recoveredElapsedMs);
    }
  }, [verseAudio.recoveredElapsedMs]);

  /** Shared generation so sync-triggered and verse-change lookups ignore stale IDs. */
  const bibleTextRequestIdRef = useRef(0);

  const refreshBibleTextId = useCallback(() => {
    const requestId = ++bibleTextRequestIdRef.current;
    const verse = selectedVerse;
    void resolveBibleTextId().then(id => {
      if (requestId === bibleTextRequestIdRef.current) {
        setBibleTextId(id);
        setBibleTextVerse(verse);
      }
    });
  }, [resolveBibleTextId, selectedVerse]);

  const isSyncing = useGlobalSyncStatus(refreshBibleTextId);

  // verseAudio.state is read via ref — listing it in deps caused a REHYDRATE
  // idle↔recorded loop when switching to pericope (#411 device QA).
  useEffect(() => {
    const audioState = verseAudioStateRef.current;
    if (
      audioState === 'recording' ||
      audioState === 'paused' ||
      // Re-resolving during review would drop the capture unit mid-take, and
      // the take load keys off it (#411). Verse changes tear playback down
      // first, so this effect still re-runs with a fresh verse.
      audioState === 'playing'
    ) {
      return;
    }
    if (captureBibleTextId === null) {
      setRecordingUnit(null);
      return;
    }
    let cancelled = false;
    void resolveRecordingUnit({
      draftingUnit,
      projectId: chapterData.projectId ?? null,
      bibleId: chapterData.bibleId,
      bookId: chapterData.bookId,
      chapterNumber: chapterData.chapterNumber,
      verseNumber: selectedVerse,
      selectedBibleTextId: captureBibleTextId,
    }).then(unit => {
      if (cancelled) {
        return;
      }
      const settledState = verseAudioStateRef.current;
      // Do not discard the first resolved unit just because review playback
      // already started — only block while capture is active (#411).
      if (settledState === 'recording' || settledState === 'paused') {
        return;
      }
      // Keep the prior unit while async resolve runs, and skip setState when
      // content is unchanged — nulling first made loadTakesFn flip and loop
      // with REHYDRATE (#411 device QA).
      setRecordingUnit(prev =>
        recordingUnitCapturesEqual(prev, unit) ? prev : unit,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [
    captureBibleTextId,
    chapterData.bibleId,
    chapterData.bookId,
    chapterData.chapterNumber,
    chapterData.projectId,
    draftingUnit,
    selectedVerse,
  ]);

  useEffect(() => {
    void onTakesChanged?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only takes should trigger this
  }, [verseAudio.takes]);

  useEffect(() => {
    const requestId = ++bibleTextRequestIdRef.current;
    const verse = selectedVerse;
    setBibleTextId(null);
    setBibleTextVerse(null);
    void resolveBibleTextId().then(id => {
      if (requestId === bibleTextRequestIdRef.current) {
        setBibleTextId(id);
        setBibleTextVerse(verse);
      }
    });
    return () => {
      bibleTextRequestIdRef.current += 1;
    };
  }, [resolveBibleTextId, selectedVerse, versesLength]);

  useEffect(() => {
    if (verseAudio.state !== 'recording') {
      return;
    }
    const tickStartedAt = Date.now() - elapsedMs;
    const id = setInterval(() => {
      setElapsedMs(Date.now() - tickStartedAt);
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [verseAudio.state]);

  useEffect(() => {
    if (verseAudio.state === 'idle') {
      setElapsedMs(0);
    }
  }, [verseAudio.state]);

  useEffect(() => {
    if (!verseAudio.errorMessage) return;
    Alert.alert('Audio error', verseAudio.errorMessage);
  }, [verseAudio.errorMessage]);

  const captureActive =
    verseAudio.state === 'recording' || verseAudio.state === 'paused';

  useEffect(() => {
    onCaptureActiveChange?.(captureActive);
    return () => onCaptureActiveChange?.(false);
  }, [captureActive, onCaptureActiveChange]);

  // `useRecordingEngine` returns a fresh object every render, so
  // `verseAudio.resume` / `discardCapture` change identity each render. Hand the
  // parent one stable controls object that delegates to the latest callbacks via
  // a ref, otherwise the registration effect below re-registers every render and
  // loops through the parent's `setCaptureControls`.
  const captureActionsRef = useRef({
    resume: verseAudio.resume,
    discardCapture: verseAudio.discardCapture,
  });
  captureActionsRef.current = {
    resume: verseAudio.resume,
    discardCapture: verseAudio.discardCapture,
  };

  const captureControls = useMemo<CaptureControls>(
    () => ({
      resume: () => captureActionsRef.current.resume(),
      discardCapture: () => captureActionsRef.current.discardCapture(),
    }),
    [],
  );

  useEffect(() => {
    onRegisterCaptureControls?.(captureActive ? captureControls : null);
    return () => onRegisterCaptureControls?.(null);
  }, [captureActive, captureControls, onRegisterCaptureControls]);

  const recordDisabled = captureBibleTextId === null;
  const syncingMessage = recordSourceTextHint(captureBibleTextId, isSyncing);

  async function ensureMic(): Promise<boolean> {
    const permission = await requestMicPermission();
    if (permission === 'granted') return true;
    Alert.alert(
      'Microphone required',
      'Allow microphone access in Settings to record drafts.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Go to Settings',
          onPress: () => {
            void Linking.openSettings();
          },
        },
      ],
    );
    return false;
  }

  const drafterCaptureBlocked = useMemo(
    () => isDrafterBlockedFromOpenPeerCheckCapture(chapterData, userId),
    [chapterData, userId],
  );
  const stageLocked = useMemo(
    () => isRecordingLockedByStage(chapterData),
    [chapterData],
  );
  const captureDisabled =
    recordDisabled || drafterCaptureBlocked || stageLocked;
  const isTaken = useMemo(
    () => isChapterTakenByOther(chapterData, userId),
    [chapterData, userId],
  );

  /** Before moving to another verse: drop the stale text id and unit. */
  const resetCapture = useCallback(() => {
    bibleTextRequestIdRef.current += 1;
    setBibleTextId(null);
    setBibleTextVerse(null);
    setRecordingUnit(null);
  }, []);

  return {
    verseAudio,
    effectiveUnit,
    pericopeSetId,
    pericopeSetResolved,
    activePericope,
    activePericopeResolved,
    pericopeUnavailable,
    captureBibleTextId,
    activeRecordingUnit,
    elapsedMs,
    setElapsedMs,
    isSyncing,
    captureActive,
    recordDisabled,
    syncingMessage,
    ensureMic,
    resetCapture,
    drafterCaptureBlocked,
    stageLocked,
    captureDisabled,
    isTaken,
  };
}
