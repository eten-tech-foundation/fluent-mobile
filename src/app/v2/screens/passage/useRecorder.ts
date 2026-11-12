import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  RECORD_AUDIO_CONFLICT_WARNING,
  RECORD_MAX_IN_PASSAGE_TAKES,
  RECORD_MAX_TAKES,
  RECORD_MAX_WITH_PASSAGE_TAKES,
  RECORD_MAX_VERSE_TAKES,
  RECORD_NO_PERICOPE,
  RECORD_NOT_OPEN,
  RECORD_OVER_PASSAGE_CANCEL,
  RECORD_OVER_PASSAGE_CONFIRM,
  recordInPassageTake,
  recordOverPassageMessage,
  swapPassageMessage,
  recordOverPassageTitle,
  RECORD_OBSERVER,
  RECORD_OTHERS_OFFICIAL,
  RECORD_PAUSED_TAKE,
  RECORD_RECOVERED_TAKE,
  RECORD_SOURCE_TEXT_SYNCING,
  RECORD_STAGE_ADVANCE_UNUPLOADABLE_WARNING,
  RECORD_TAKEN_CHAPTER_WARNING,
  RECORD_OVER_VERSES_MESSAGE,
  RECORD_OVER_VERSES_TITLE,
  PICK_OVER_VERSES_CONFIRM,
  pickOverPassageTitle,
  RECORD_VERSE_BY_VERSE,
  recordedOnTheirOwn,
  pickOverVersesTitle,
} from '../../../../constants/messages';
import { MAX_RECORDING_TAKES } from '../../../../constants/recordingTakes';
import { chapterHasUnuploadableSelectedTakes } from '../../../../db/queries';
import { isDevPreviewChapterConflictEnabled } from '../../../../config/devPreviewChapterConflict';
import { passageSessionVerse } from '../../../../navigation/passageSessionVerse';
import { useLiveLevels } from '../../../../hooks/useLiveLevels';
import { usePendingDelete } from '../../../../hooks/usePendingDelete';
import type { PassageTake } from '../../../../hooks/usePassage';
import { useRecordSession } from '../../../../hooks/useRecordSession';
import { useVerseStep } from '../../../../hooks/useVerseStep';
import type { DraftingUnit } from '../../../../services/draftingUnitPreference';
import { hasProjectObserverGrant } from '../../../../services/userOrgGrants';
import type { CaptureControls } from '../../../../types/captureControls';
import { logger } from '../../../../utils/logger';
import {
  buildCrossGranularityRows,
  type StitchedTakeRow,
} from '../../../../utils/crossGranularityRows';
import { rangeCoversVerse } from '../../../../utils/recordingRange';
import { hasProjectTranslatorGrant } from '../../../../utils/myWorkDraftDownload';
import type { RecordStatus } from './Footer';
import type { FrontTake } from './TakeCard';
import type { RecordKeys } from './PlayerKeys';
import type { FanTake } from './TakeFan';
import type { Ready } from './ready';

const log = logger.create('useRecorder');

/**
 * Something about this passage Legacy's Record tab would show as a banner.
 * `classic`: what it points at is only in classic drafting, so the notice
 * carries the way there.
 */
export interface RecordNotice {
  id: string;
  message: string;
  classic?: boolean;
}

/**
 * Observing only: an Observer grant here, no Translator grant, and not this
 * chapter's drafter or checker. Unknown grants don't block, as elsewhere.
 */
function isObserverOnly(
  assignment: Ready['assignment'],
  userId: number | null,
): boolean {
  const { projectId, assignedUserId, peerCheckerId } = assignment;
  if (userId === null || projectId === null) return false;
  if (assignedUserId === userId || peerCheckerId === userId) return false;
  const id = String(userId);
  return (
    hasProjectObserverGrant(id, projectId) &&
    !hasProjectTranslatorGrant(id, projectId)
  );
}

/** Verse mode's place: the verse Record is on and the ones either side. */
export interface VerseSteps {
  current: number;
  index: number;
  /** Verses Record steps through: this chapter's in the passage. */
  verses: Ready['verses'];
  previous: number | null;
  next: number | null;
  /** A take is in progress or saving, so the verse stays put. */
  locked: boolean;
  /** Asks first mid-take, like leaving a verse in the Record tab. */
  go: (verseNumber: number) => void;
}

/**
 * Record mode's state for the passage player. Recording works as in Legacy's
 * Record tab: the shared session holds the capture unit, the chapter claim
 * and the rules for who can record here. This turns it into what the fan,
 * the take card and the keys show. In verse mode it records one verse at a
 * time, inside the passage.
 */
export function useRecorder({
  passage,
  userId,
  unit,
  openVerse,
  showing,
  focused,
  downloading,
  onReload,
  onCaptureActiveChange,
  onRegisterCaptureControls,
}: {
  passage: Ready;
  userId: number | null;
  /** Whole passages, or verse by verse. */
  unit: DraftingUnit;
  /** Verse mode starts here when it's in the passage, e.g. a recovered take. */
  openVerse?: number;
  /** The player is open in Record mode; leaving it commits a pending delete. */
  showing: boolean;
  /** Passage has its route; a screen pushed over it (Book) takes it. */
  focused: boolean;
  /** The passage's text is downloading, so recording waits on it. */
  downloading: boolean;
  /** Re-reads the passage, e.g. after recording claims its chapter. */
  onReload: () => void;
  onCaptureActiveChange?: (active: boolean) => void;
  onRegisterCaptureControls?: (controls: CaptureControls | null) => void;
}) {
  const { assignment } = passage;
  const anchorVerse =
    passageSessionVerse(passage.verses, assignment.chapterNumber) ?? 1;
  const verseMode = unit === 'verse';
  // Source audio and takes are this chapter's only (Q12, Q28).
  const stepVerses = useMemo(
    () =>
      passage.verses.filter(v => v.chapterNumber === assignment.chapterNumber),
    [passage.verses, assignment.chapterNumber],
  );
  const firstVerse = () =>
    stepVerses.find(v => v.verseNumber === openVerse)?.verseNumber ??
    // Before the text is in, a recovered take still opens on its verse.
    (stepVerses.length === 0 ? openVerse : undefined) ??
    stepVerses.find(v => v.recorded === null)?.verseNumber ??
    anchorVerse;
  const [verse, setVerse] = useState(firstVerse);
  // Text arriving after open picks again, since there was nothing to step to.
  const versesIn = stepVerses.length > 0;
  const [pickedWithVerses, setPickedWithVerses] = useState(versesIn);
  if (!pickedWithVerses && versesIn) {
    setPickedWithVerses(true);
    setVerse(firstVerse());
  }
  const session = useRecordSession({
    chapterData: assignment,
    userId,
    selectedVerse: verseMode ? verse : anchorVerse,
    versesLength: passage.chapterVerseCount,
    draftingUnit: unit,
    onChapterClaimed: onReload,
    onCaptureActiveChange,
    onRegisterCaptureControls,
  });
  const { verseAudio } = session;
  const step = useVerseStep({
    verses: stepVerses,
    selectedVerse: verse,
    onChange: setVerse,
    audioState: verseAudio.state,
    discardCapture: verseAudio.discardCapture,
    resetCapture: session.resetCapture,
  });
  // The passage's own assignment row, reloaded with it on focus and sync.
  const hasConflict =
    isDevPreviewChapterConflictEnabled() || assignment.hasConflict === true;
  const observerOnly = isObserverOnly(assignment, userId);
  const classicReason =
    !verseMode && session.pericopeUnavailable ? RECORD_NO_PERICOPE : null;

  // A saved, deleted or newly picked take re-reads the passage, so its recorded state and send line stay current.
  // Keyed on what changed, so a reload that finds the same takes can't loop.
  const takesKey = verseAudio.takes
    .map(t => `${t.id}:${t.isSelected ? 1 : 0}:${t.syncStatus}`)
    .join(',');
  const reloadRef = useRef(onReload);
  reloadRef.current = onReload;
  const textId = session.captureBibleTextId;
  const takesSeen = useRef({ id: textId, key: takesKey });
  useEffect(() => {
    const seen = takesSeen.current;
    takesSeen.current = { id: textId, key: takesKey };
    if (seen.key === takesKey) return;
    // Stepping verses swaps the takes; only a change on one verse reloads.
    if (verseMode && (textId === null || seen.id !== textId)) return;
    reloadRef.current();
  }, [takesKey, textId, verseMode]);

  // Legacy's Record tab warns when a selected take here can't upload (#585).
  const { bibleId, bookId, chapterNumber } = assignment;
  const [unuploadable, setUnuploadable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void chapterHasUnuploadableSelectedTakes(
      bibleId,
      bookId,
      chapterNumber,
    ).then(found => {
      if (!cancelled) setUnuploadable(found);
    });
    return () => {
      cancelled = true;
    };
  }, [bibleId, bookId, chapterNumber, takesKey]);
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
  // Capture can become active while the sheet is still in Listen. Treat that
  // as Record showing so a pending delete is not committed and Eject can run.
  const shown = showing || capturing;
  const showingRef = useRef(shown);
  showingRef.current = shown;
  // Source audio owns Listen. A take does not keep playing once Record is
  // hidden, so the two never run together.
  const pausePlaybackRef = useRef(verseAudio.pausePlayback);
  pausePlaybackRef.current = verseAudio.pausePlayback;
  useEffect(() => {
    if (shown || verseAudio.state !== 'playing') return;
    void pausePlaybackRef.current();
  }, [shown, verseAudio.state]);
  useEffect(
    () => () => {
      showingRef.current = false;
    },
    [],
  );
  /** A take just deleted shows in front, with its undo, until it's settled. */
  const [frontOverride, setFrontOverride] = useState<string | null>(null);
  /** A confirm on screen, answered through the Dialog the sheet draws. */
  const [asking, setAsking] = useState<{
    title: string;
    message: string;
    confirm: string;
    resolve: (ok: boolean) => void;
  } | null>(null);
  /** The tile tapped forward to play. Tapping doesn't pick; the check does. */
  const [viewId, setViewId] = useState<string | null>(null);
  /** A paused or scrubbed spot in a take, for Play to start from. */
  const [parked, setParked] = useState<{ id: string; ms: number } | null>(null);
  // Verse mode lists the verse's own takes; the passage takes over it get
  // tiles of their own (`coverTakes`), which can't be deleted here.
  const isPassageTake = (t: { id: string; granularity: string }) =>
    (verseMode
      ? t.granularity !== 'pericope'
      : session.effectiveUnit !== 'pericope' || t.granularity === 'pericope') &&
    !deletion.hiddenIds.has(t.id);
  const coverTakes = verseMode
    ? verseAudio.takes
        .filter(
          t =>
            t.granularity === 'pericope' &&
            rangeCoversVerse(t, assignment.chapterNumber, verse) &&
            !deletion.hiddenIds.has(t.id),
        )
        .sort((a, b) => a.takeNumber - b.takeNumber)
    : [];
  const coveringTake = coverTakes.find(t => t.isSelected) ?? null;
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
    liveTakes.length > 0 && !verseMode
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
  // The levels belong to the take just saved, not to a verse stepped onto.
  const justSaved = useRef(false);
  useEffect(() => {
    if (verseAudio.state === 'saving') justSaved.current = true;
  }, [verseAudio.state]);
  useEffect(() => {
    const ids = verseAudio.takes.map(t => t.id);
    const known = knownTakeIds.current;
    const fresh = known ? ids.filter(id => !known.has(id)) : [];
    if (justSaved.current && fresh.length === 1 && liveLevels.length > 0) {
      levelsByTake.current.set(fresh[0], liveLevels);
      justSaved.current = false;
    }
    knownTakeIds.current = new Set(ids);
    // Only a change in the takes means one was saved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verseAudio.takes]);

  const passageTakes = verseAudio.takes
    .filter(isPassageTake)
    .sort((a, b) => a.takeNumber - b.takeNumber);
  // A saved take's number counts every take on or covering the verse.
  const nextTakeNumber =
    [...passageTakes, ...coverTakes].reduce(
      (n, t) => Math.max(n, t.takeNumber),
      0,
    ) + 1;
  // In pericope mode, verses recorded on their own play back to back, as
  // Legacy's stitched row does, while no passage take is the draft.
  const stitched = verseMode
    ? null
    : (buildCrossGranularityRows({
        draftingUnit: 'pericope',
        // The whole passage, so one crossing a chapter plays and counts all.
        pericopeVerses: passage.verses,
        takes: verseAudio.takes.filter(t => !deletion.hiddenIds.has(t.id)),
      }).find(row => row.kind === 'stitched') as StitchedTakeRow | undefined) ??
      null;
  const verseDraft =
    stitched && !passageTakes.some(t => t.isSelected) ? stitched : null;
  const versesSelected =
    !verseMode &&
    verseAudio.takes.some(t => t.granularity !== 'pericope' && t.isSelected);
  const first = passage.verses[0];
  const last = passage.verses[passage.verses.length - 1];
  const othersOfficial =
    first !== undefined &&
    last !== undefined &&
    verseAudio.allTakes.some(
      t =>
        t.isCanonical &&
        typeof t.recordedByUserId === 'number' &&
        t.recordedByUserId !== userId &&
        (verseMode
          ? rangeCoversVerse(t, assignment.chapterNumber, verse)
          : t.granularity === 'pericope' &&
            t.startChapter === first.chapterNumber &&
            t.startVerse === first.verseNumber &&
            t.endChapter === last.chapterNumber &&
            t.endVerse === last.verseNumber),
    );
  // The new take keeps its tile and wave from Eject until it's saved.
  // A step waits on a pending delete; Record would start on the old verse.
  const [stepping, setStepping] = useState(false);
  const steppingRef = useRef(false);
  const steps = useRef(0);
  const held = capturing || verseAudio.state === 'saving';
  const pendingId = deletion.pending?.id ?? null;
  // Only while that take's undo is open; after that the selected take leads.
  const overrideId = frontOverride === pendingId ? frontOverride : null;
  const leadId = overrideId ?? viewId;
  const pickedTake =
    passageTakes.find(t => t.id === verseAudio.selectedTake?.id) ??
    // A passage take picked over the verse leads instead of its last take.
    (coveringTake ? null : passageTakes[passageTakes.length - 1] ?? null);
  const leadTake = passageTakes.find(t => t.id === leadId) ?? null;
  // A pending delete's undo leads, then a tile tapped forward.
  const shownCover =
    verseMode && !held && !overrideId
      ? coverTakes.find(t => t.id === viewId) ??
        (pickedTake || leadTake ? null : coveringTake)
      : null;
  const fan: FanTake[] = coverTakes.map(t => ({
    id: t.id,
    takeNumber: t.takeNumber,
    official: inUse(t),
    selected: t.isSelected,
    passage: coverRange(t),
  }));
  fan.push(
    ...passageTakes.map(t => ({
      id: t.id,
      takeNumber: t.takeNumber,
      official: inUse(t),
      // While the verses are the draft, no passage take is picked.
      selected: !verseDraft && t.id === pickedTake?.id,
      deleted: t.id === pendingId,
    })),
  );
  if (held) {
    fan.push({
      id: 'recording',
      takeNumber: nextTakeNumber,
      official: false,
      recording: live,
      paused,
    });
  } else if (passageTakes.length < MAX_RECORDING_TAKES) {
    // Figma's dashed slot: where the next take lands, in front until the first.
    fan.push({
      id: 'placeholder',
      takeNumber: nextTakeNumber,
      official: false,
      placeholder: true,
    });
  }
  const frontTake =
    held || shownCover ? null : leadTake ?? (verseDraft ? null : pickedTake);
  const frontVerses = !held && !frontTake ? verseDraft : null;
  // A passage take over the verse on the card: the one picked when the verse
  // has no take of its own, or a tile tapped forward.
  const frontCover = shownCover;
  const playingCover =
    frontCover !== null && verseAudio.playingTakeId === frontCover.id;
  const coverLength = frontCover?.durationMs ?? 0;
  const coverParkedMs =
    parked !== null && frontCover !== null && parked.id === frontCover.id
      ? parked.ms
      : 0;
  const versesLength = frontVerses?.durationMs ?? 0;
  const playingVerses =
    frontVerses !== null && verseAudio.playingTakeId === frontVerses.id;
  const frontDeleted = frontTake !== null && frontTake.id === pendingId;
  const frontId = held
    ? 'recording'
    : frontTake?.id ?? frontCover?.id ?? 'placeholder';
  const playingFront =
    frontTake !== null && verseAudio.playingTakeId === frontTake.id;
  // Where Play picks up the front take: where it was paused or scrubbed to.
  const frontLength = frontTake?.durationMs ?? 0;
  const parkedMs =
    parked !== null && frontTake !== null && parked.id === frontTake.id
      ? parked.ms
      : 0;
  // The card names its unit, since a take looks the same in either mode.
  const takeLabel = (n: number) =>
    verseMode ? `v. ${verse} · Take ${n}` : `Passage take ${n}`;
  const take: FrontTake = held
    ? {
        takeNumber: nextTakeNumber,
        label: takeLabel(nextTakeNumber),
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
        label: takeLabel(frontTake.takeNumber),
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
              official: inUse(frontTake),
              // Someone else's official take isn't taken over unseen.
              onToggleOfficial:
                session.stageLocked || othersOfficial
                  ? undefined
                  : () => void chooseTake(frontTake),
            }),
      }
    : frontVerses
    ? {
        takeNumber: frontVerses.takeNumber,
        label:
          frontVerses.segments.length >= passage.verses.length
            ? RECORD_VERSE_BY_VERSE
            : recordedOnTheirOwn(
                frontVerses.segments.length,
                passage.verses.length,
              ),
        durationMs: frontVerses.durationMs,
        levels: [],
        progress:
          playingVerses && versesLength > 0
            ? Math.min(1, verseAudio.stitchPositionMs / versesLength)
            : 0,
        onSeek:
          versesLength > 0
            ? p =>
                void verseAudio.seekStitched(
                  frontVerses,
                  Math.round(p * versesLength),
                )
            : undefined,
        recording: false,
        official: false,
      }
    : frontCover
    ? {
        takeNumber: frontCover.takeNumber,
        label: `Passage take ${frontCover.takeNumber} · ${coverRange(
          frontCover,
        )}`,
        durationMs: frontCover.durationMs ?? null,
        levels: [],
        progress:
          playingCover && verseAudio.durationMs > 0
            ? verseAudio.positionMs / verseAudio.durationMs
            : coverLength > 0
            ? coverParkedMs / coverLength
            : 0,
        onSeek: coverLength > 0 ? p => void scrubCover(p) : undefined,
        recording: false,
        official: inUse(frontCover),
        onToggleOfficial:
          session.stageLocked || othersOfficial
            ? undefined
            : () => void chooseTake(frontCover),
      }
    : {
        takeNumber: 1,
        durationMs: null,
        levels: [],
        progress: 0,
        recording: false,
        official: false,
      };
  // A take waiting on undo is deleted first when Record is pressed.
  const atCap =
    !held &&
    classicReason === null &&
    !deletion.pending &&
    !verseAudio.canRecordNewTake;
  // Our own download doesn't go through sync, so say it's on its way.
  const textHint =
    session.syncingMessage !== null && downloading
      ? RECORD_SOURCE_TEXT_SYNCING
      : session.syncingMessage;
  // Why Record can't start at all, which the hero's Record shows too.
  const cannotRecord =
    textHint ??
    (session.isTaken
      ? RECORD_TAKEN_CHAPTER_WARNING
      : session.stageLocked || session.drafterCaptureBlocked
      ? RECORD_NOT_OPEN
      : observerOnly
      ? RECORD_OBSERVER
      : classicReason);
  const blockedReason = recovered
    ? RECORD_RECOVERED_TAKE
    : paused
    ? RECORD_PAUSED_TAKE
    : cannotRecord ??
      (atCap && (verseMode || session.activeRecordingUnit !== null)
        ? // The cap is per verse, so verse-by-verse takes count too.
          passageTakes.length >= MAX_RECORDING_TAKES
          ? RECORD_MAX_TAKES
          : verseMode
          ? passageTakes.length === 0
            ? RECORD_MAX_IN_PASSAGE_TAKES
            : RECORD_MAX_WITH_PASSAGE_TAKES
          : RECORD_MAX_VERSE_TAKES
        : coveringTake && passageTakes.length === 0
        ? recordInPassageTake(coveringTake.takeNumber)
        : null);

  const notices: RecordNotice[] = [];
  if (hasConflict) {
    notices.push({ id: 'conflict', message: RECORD_AUDIO_CONFLICT_WARNING });
  } else if (unuploadable) {
    notices.push({
      id: 'unuploadable',
      message: RECORD_STAGE_ADVANCE_UNUPLOADABLE_WARNING,
    });
  }
  if (session.isTaken) {
    notices.push({ id: 'taken', message: RECORD_TAKEN_CHAPTER_WARNING });
  } else if (session.drafterCaptureBlocked && !session.stageLocked) {
    notices.push({ id: 'not-open', message: RECORD_NOT_OPEN });
  } else if (observerOnly) {
    notices.push({ id: 'observer', message: RECORD_OBSERVER });
  }
  if (classicReason !== null && !session.stageLocked) {
    notices.push({ id: 'classic', message: classicReason, classic: true });
  }
  if (othersOfficial) {
    notices.push({
      id: 'others-official',
      message: RECORD_OTHERS_OFFICIAL,
      classic: true,
    });
  }

  function deleteTake(id: string) {
    const target = passageTakes.find(t => t.id === id);
    if (!target) return;
    if (verseAudio.state === 'playing' && verseAudio.playingTakeId === id) {
      void verseAudio.pausePlayback();
    }
    deletion.remove({ id, takeNumber: target.takeNumber });
    setFrontOverride(id);
    setViewId(null);
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

  // Tapping a tile only brings it forward to play.
  function selectTake(id: string) {
    if (id === pendingId) {
      undoDelete();
      return;
    }
    setFrontOverride(null);
    // Tapping the tile in front again goes back to the take in use.
    setViewId(id === viewId ? null : id);
  }

  /** A passage take's verses, "v. 1–7", or across chapters "1:30–2:3". */
  function coverRange(t: {
    startChapter: number;
    startVerse: number;
    endChapter: number;
    endVerse: number;
  }) {
    return t.startChapter === t.endChapter
      ? `v. ${t.startVerse}–${t.endVerse}`
      : `${t.startChapter}:${t.startVerse}–${t.endChapter}:${t.endVerse}`;
  }

  /**
   * The take in use and official: the card's check shows it. A failed upload
   * (e.g. another take became active on the server) isn't official, so its
   * toggle stays live for choosing it again.
   */
  function inUse(t: {
    isSelected: boolean;
    isCanonical: boolean;
    syncStatus: string;
  }) {
    return t.isSelected && t.isCanonical && t.syncStatus !== 'failed';
  }

  /**
   * The card's check: use this take, picked and official. Picking over takes
   * of the other unit deselects them, so it asks first.
   */
  const choosing = useRef(false);
  async function chooseTake(t: (typeof verseAudio.takes)[number]) {
    if (choosing.current) return;
    choosing.current = true;
    try {
      await choose(t);
    } finally {
      choosing.current = false;
    }
  }
  async function choose(t: (typeof verseAudio.takes)[number]) {
    const isCover = coverTakes.some(c => c.id === t.id);
    const ask = t.isSelected
      ? null
      : isCover && coveringTake
      ? // Swapping passage takes: the one picked over the verse goes.
        ([
          pickOverVersesTitle(t.takeNumber, coverRange(t)),
          swapPassageMessage(coveringTake),
        ] as const)
      : isCover || versesSelected
      ? // Picking a passage take deselects the verses recorded on their own.
        ([
          pickOverVersesTitle(
            t.takeNumber,
            verseMode ? coverRange(t) : undefined,
          ),
          RECORD_OVER_VERSES_MESSAGE,
        ] as const)
      : coveringTake
      ? // Picking a verse take deselects the passage take over it.
        ([
          pickOverPassageTitle(t.takeNumber, verse),
          recordOverPassageMessage(coveringTake),
        ] as const)
      : null;
    if (
      ask &&
      !(await confirmRecordOver(ask[0], ask[1], PICK_OVER_VERSES_CONFIRM))
    ) {
      return;
    }
    // Selecting a selected take whose upload failed starts a new attempt.
    if (!t.isSelected || t.syncStatus === 'failed') {
      await verseAudio.selectTake(t.id);
    }
    await verseAudio.setCanonical(t.id);
  }

  // Leaving Record answers an open question with no.
  useEffect(() => {
    if (!shown && asking) {
      asking.resolve(false);
      setAsking(null);
    }
  }, [shown, asking]);

  // A tile tapped forward leads on its verse until a take starts or Record
  // closes.
  useEffect(() => {
    setViewId(null);
  }, [verse, held, shown]);

  // Closing the player or leaving Record hides the undo, so it commits.
  const { commit: commitDelete } = deletion;
  useEffect(() => {
    if (!shown) void commitDelete();
  }, [shown, commitDelete]);

  // The recorder's state only changes once the native call returns, so a
  // second key pressed meanwhile would act on a recorder mid-change.
  const busy = useRef(false);
  async function oneAtATime(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    try {
      await action();
    } catch (error) {
      // Recorder calls report their own errors; the mic request and start()'s
      // take count can still reject.
      log.error('Player key failed', { error });
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
    if (
      session.stageLocked ||
      session.drafterCaptureBlocked ||
      session.isTaken ||
      observerOnly ||
      classicReason !== null
    ) {
      return;
    }
    const stepsBefore = steps.current;
    if (
      coveringTake &&
      !(await confirmRecordOver(
        recordOverPassageTitle(verse),
        recordOverPassageMessage(coveringTake),
      ))
    ) {
      return;
    }
    if (
      versesSelected &&
      !(await confirmRecordOver(
        RECORD_OVER_VERSES_TITLE,
        RECORD_OVER_VERSES_MESSAGE,
      ))
    ) {
      return;
    }
    if (!(await session.ensureMic())) return;
    // A new take counts toward the limit, so a pending delete goes first.
    await deletion.commit();
    // The player may have closed while the delete ran; don't record hidden.
    if (
      !showingRef.current ||
      steppingRef.current ||
      steps.current !== stepsBefore
    ) {
      return;
    }
    session.setElapsedMs(0);
    await latestAudio.current.start();
  }

  // Saving a take deselects every take it overlaps, whatever its unit.
  function confirmRecordOver(
    title: string,
    message: string,
    confirm = RECORD_OVER_PASSAGE_CONFIRM,
  ) {
    return new Promise<boolean>(resolve => {
      setAsking(prev => {
        prev?.resolve(false);
        return { title, message, confirm, resolve };
      });
    });
  }
  function answer(ok: boolean) {
    asking?.resolve(ok);
    setAsking(null);
  }

  async function playTake() {
    if (verseAudio.state === 'playing') {
      if (playingFront) {
        setParked({ id: frontTake.id, ms: verseAudio.positionMs });
      } else if (playingCover) {
        setParked({ id: frontCover.id, ms: verseAudio.positionMs });
      }
      await verseAudio.pausePlayback();
      return;
    }
    if (frontVerses) {
      await verseAudio.playStitched(frontVerses);
      return;
    }
    if (frontCover) {
      setParked(null);
      const parkedHere = parked?.id === frontCover.id;
      await verseAudio.playTake(
        frontCover,
        parkedHere
          ? coverParkedMs >= coverLength
            ? 0
            : coverParkedMs
          : undefined,
      );
      return;
    }
    // The take in front, which may not be the session's selected take.
    if (!frontTake) return;
    setParked(null);
    const parkedHere = parked?.id === frontTake.id;
    // Nothing parked resumes. A scrub, including to 0 or the end, is explicit.
    await verseAudio.playTake(
      frontTake,
      parkedHere ? (parkedMs >= frontLength ? 0 : parkedMs) : undefined,
    );
  }

  // Passage stays mounted under a pushed screen, Record still open. Losing
  // the route stops review, including a take still loading, and keeps its
  // spot for Play; coming back doesn't play it. A take being recorded is
  // left to the capture leave guard.
  function releaseReview() {
    if (capturing || verseAudio.state === 'saving') return;
    if (verseAudio.state === 'playing') {
      if (playingFront) {
        setParked({ id: frontTake.id, ms: verseAudio.positionMs });
      } else if (playingCover) {
        setParked({ id: frontCover.id, ms: verseAudio.positionMs });
      }
    }
    void verseAudio.stopPlayback();
  }
  const releaseRef = useRef(releaseReview);
  releaseRef.current = releaseReview;
  useEffect(() => {
    if (!focused) releaseRef.current();
  }, [focused]);

  async function scrubFront(p: number) {
    if (!frontTake) return;
    const ms = Math.round(p * frontLength);
    if (playingFront && verseAudio.state === 'playing') {
      await verseAudio.seek(ms, frontTake);
      return;
    }
    setParked({ id: frontTake.id, ms });
  }

  async function scrubCover(p: number) {
    if (!frontCover) return;
    const ms = Math.round(p * coverLength);
    if (playingCover && verseAudio.state === 'playing') {
      await verseAudio.seek(ms, frontCover);
      return;
    }
    setParked({ id: frontCover.id, ms });
  }

  const footer: RecordStatus = {
    blockedReason: live ? null : blockedReason,
    take,
    firstVerse: verseMode ? verse : first?.verseNumber ?? 1,
  };
  const verseSteps: VerseSteps | null = verseMode
    ? {
        current: verse,
        index: step.index,
        verses: stepVerses,
        previous: step.previous,
        next: step.next,
        locked: held || stepping,
        go: verseNumber => {
          justSaved.current = false;
          // A passage take playing over the next verse too picks up there.
          if (playingCover && verseAudio.state === 'playing') {
            setParked({ id: frontCover.id, ms: verseAudio.positionMs });
          }
          steps.current += 1;
          steppingRef.current = true;
          setStepping(true);
          // A delete waiting on undo belongs to this verse, so it goes first.
          void deletion
            .commit()
            .then(() => step.request(verseNumber))
            .finally(() => {
              steppingRef.current = false;
              setStepping(false);
            });
        },
      }
    : null;
  const keys: RecordKeys = {
    recording: live,
    paused,
    recordDisabled:
      !capturing &&
      (held ||
        stepping ||
        observerOnly ||
        classicReason !== null ||
        atCap ||
        session.captureDisabled ||
        session.isTaken),
    onRecord: () => void oneAtATime(record),
    playing: verseAudio.state === 'playing',
    playDisabled:
      held ||
      (frontTake === null && frontVerses === null && frontCover === null) ||
      frontDeleted,
    onPlay: () => void playTake(),
    finishDisabled: !capturing,
    onFinish: () => void oneAtATime(() => verseAudio.stop()),
  };

  return {
    /** A take is recording or paused: lock the mode and guard the close. */
    capturing,
    /** Verse mode's place; null when Record takes whole passages. */
    verse: verseSteps,
    /** The passage's takes, live, for the hero's takes line. */
    takes,
    /** Verses recorded on their own are the draft, so the hero counts them. */
    versesAreDraft: verseDraft !== null,
    fan: {
      takes: fan,
      frontId,
      onSelect: selectTake,
      onDelete: held || session.stageLocked ? undefined : deleteTake,
    },
    footer,
    keys,
    /** Why Record can't start here; null when it can. */
    cannotRecord: live || capturing ? null : cannotRecord,
    /** Legacy's Record-tab banners, for the hero and player. */
    notices,
    /** A record or pick confirm waiting on an answer. */
    confirm: asking && {
      title: asking.title,
      message: asking.message,
      confirmLabel: asking.confirm,
      cancelLabel: RECORD_OVER_PASSAGE_CANCEL,
      onConfirm: () => answer(true),
      onCancel: () => answer(false),
    },
    /** Stops a take so Listen's source audio can start alone. */
    pauseTakePlayback: verseAudio.pausePlayback,
    /** Stops review before leaving for another screen, e.g. Book. */
    releaseReview,
    discardCapture: verseAudio.discardCapture,
  };
}
