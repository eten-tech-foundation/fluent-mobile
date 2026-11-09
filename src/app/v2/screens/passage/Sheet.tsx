import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BackHandler,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useIsFocused } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture } from 'react-native-gesture-handler';
import {
  interpolate,
  LayoutAnimationConfig,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { NEXT_SPRING } from '../../../../components/ui/motion';
import {
  CAPTURE_LEAVE_DISCARD,
  CAPTURE_LEAVE_MESSAGE,
  CAPTURE_LEAVE_RESUME,
  CAPTURE_LEAVE_TITLE,
} from '../../../../constants/messages';
import { useConnectivity } from '../../../../hooks/useConnectivity';
import { useDraftingUnit } from '../../../../hooks/useDraftingUnit';
import { useHaptics } from '../../../../hooks/useHaptics';
import type { HeaderSync } from '../../../../hooks/useHeaderSync';
import type { usePassage } from '../../../../hooks/usePassage';
import {
  hasVerseStart,
  verseStartMs,
} from '../../../../hooks/sourceAudioHelpers';
import { useSourceAudio } from '../../../../hooks/useSourceAudio';
import type { CaptureControls } from '../../../../types/captureControls';
import type { SourceAudioLoadState } from '../../../../types/sourceAudio';
import { ColorModeScope, useTheme } from '../../../../theme/useTheme';
import { Dialog, type DialogProps } from '../../../../components/ui/Dialog';
import { Footer } from './Footer';
import { NoteScreen } from './NoteScreen';
import { PassageHero } from './PassageHero';
import { PlayerChrome } from './PlayerChrome';
import { PlayerKeys, type KeyAction, type ListenKeys } from './PlayerKeys';
import { type Ready } from './ready';
import { useScriptMetrics } from './scriptMetrics';
import { sourceWindow, windowProgress, windowSeekMs } from './sourceWindow';
import { TakeFan } from './TakeFan';
import { TitleSheet } from './TitleSheet';
import { usePassageNotes } from './usePassageNotes';
import { useRecorder } from './useRecorder';
import { VerseList } from './VerseList';

/** How far the hero drags before a release opens or closes it. */
const SNAP_AT = 0.35;
const FLING = 500;

/** One page now the FIA steps are hidden (Q11), so these stay off. */
const NO_TURN = (label: string): KeyAction => ({
  label,
  disabled: true,
  onPress: () => {},
});

/** Verse mode's Previous and Next step verses in Listen (Q17). */
function verseTurn(
  steps: ReturnType<typeof useRecorder>['verse'],
  side: 'previous' | 'next',
  /** The verse playing, which they step from until the place catches up. */
  heard: number | null,
  /** Plays a verse from its start, for one that's already the place. */
  replay: (verse: number) => (() => void) | null,
): KeyAction {
  const label = side === 'previous' ? 'Previous' : 'Next';
  if (!steps) return NO_TURN(label);
  const at =
    heard === null ? -1 : steps.verses.findIndex(v => v.verseNumber === heard);
  const target =
    at < 0
      ? steps[side]
      : steps.verses[side === 'previous' ? at - 1 : at + 1]?.verseNumber ??
        null;
  const replaying = heard !== null && target === steps.current;
  const replayTarget = replaying && target !== null ? replay(target) : null;
  return {
    label: target === null ? label : `${label}: verse ${target}`,
    disabled: target === null || steps.locked || (replaying && !replayTarget),
    onPress: () => {
      if (target === null) return;
      if (replaying) replayTarget?.();
      else steps.go(target);
    },
  };
}

function listenKeys(
  source: {
    loadState: SourceAudioLoadState;
    isPlaying: boolean;
    isLoadingAudio: boolean;
    play: () => Promise<void>;
    pause: () => Promise<void>;
    retry: () => void;
  },
  pauseTake: () => Promise<void>,
  /** Play from the passage's start when it last stopped at its end. */
  rewind: () => Promise<void>,
): ListenKeys {
  const loading = source.loadState === 'loading' || source.isLoadingAudio;
  const failed = source.loadState === 'error';
  const playLabel = failed
    ? 'Retry loading source audio'
    : loading
    ? 'Loading source audio'
    : source.loadState === 'empty'
    ? 'No source audio'
    : source.isPlaying
    ? 'Pause source audio'
    : 'Play source audio';
  return {
    playing: source.isPlaying,
    playDisabled: loading || source.loadState === 'empty',
    playLabel,
    onPlay: () => {
      void (async () => {
        if (failed) {
          source.retry();
          return;
        }
        if (source.isPlaying) {
          await source.pause();
          return;
        }
        // A take still winding down must finish pausing before the chapter starts.
        await pauseTake();
        await rewind();
        await source.play();
      })();
    },
  };
}

/**
 * The hero and the player are one sheet. Opening it keeps the script where
 * it is and grows it to reading size, slides the title over to the player
 * header, then raises the keys from below the screen.
 *
 * This file owns the open: the gesture, `progress` and the layout it drives.
 * It also picks each surface's mode, once: the hero is Canvas, the title's
 * sheet Hardware, and the player chrome sets its own two.
 */
export function Sheet({
  passage,
  userId,
  onReload,
  anchorVerse,
  openVerse,
  chapterName,
  milestoneName,
  onBack,
  onOpenBook,
  onOpenClassic,
  sync,
  onDownload,
  downloadState,
  onCaptureActiveChange,
  onRegisterCaptureControls,
}: {
  passage: Ready;
  userId: number | null;
  /** Re-reads the passage, e.g. after recording claims its chapter. */
  onReload: () => void;
  /** Verse this passage was opened on; source audio seeks here. */
  anchorVerse: number;
  /** In verse mode, the verse Record opens on, e.g. a recovered take's. */
  openVerse?: number;
  /** e.g. "Mark 14"; the title's sheet links it up to the book page. */
  chapterName: string;
  milestoneName: string;
  onBack: () => void;
  onOpenBook: () => void;
  /** Legacy drafting for this chapter, for what Next can't do yet. */
  onOpenClassic: () => void;
  sync: HeaderSync;
  onDownload: () => void;
  downloadState: ReturnType<typeof usePassage>['downloadState'];
  onCaptureActiveChange?: (active: boolean) => void;
  onRegisterCaptureControls?: (controls: CaptureControls | null) => void;
}) {
  const { spacing } = useTheme();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const focused = useIsFocused();
  const { preview } = useScriptMetrics();
  const [expanded, setExpanded] = useState(false);
  /** The player is open and still; phrases are only drawn then. */
  const [atRest, setAtRest] = useState(false);
  /**
   * The player has been opened. Notes and source audio only show in it, so
   * neither loads before then; once opened they stay, so closing keeps
   * playback and the notes.
   */
  const [playerOpened, setPlayerOpened] = useState(false);
  const [recordMode, setRecordMode] = useState(false);
  const [titleSheetOpen, setTitleSheetOpen] = useState(false);
  const [container, setContainer] = useState(0);
  const [header, setHeader] = useState(0);
  const [actions, setActions] = useState(0);
  const [panel, setPanel] = useState(0);
  const [keys, setKeys] = useState(0);
  const progress = useSharedValue(0);
  const scriptRef = useRef<ScrollView>(null);

  const headerBottom = insets.top + header;
  const scriptTop = headerBottom + spacing.sm;
  const actionsTop = scriptTop + preview + spacing.lg;
  const collapsed = actionsTop + actions + spacing.xl;
  const range = Math.max(1, container - collapsed);
  const fullScript = Math.max(preview, container - headerBottom - panel);
  // Settings picks the unit; a chapter without pericopes is verse by verse.
  const { draftingUnit } = useDraftingUnit();
  const unit = passage.wholeChapter ? 'verse' : draftingUnit;
  const recorder = useRecorder({
    passage,
    userId,
    unit,
    openVerse,
    showing: expanded && recordMode,
    downloading: downloadState === 'downloading',
    onReload,
    onCaptureActiveChange,
    onRegisterCaptureControls,
  });
  const notes = usePassageNotes(passage, userId, playerOpened);
  // Notes that failed to load try again each time the player opens.
  const notesRef = useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  });
  useEffect(() => {
    if (expanded && notesRef.current.failed) void notesRef.current.retry();
  }, [expanded]);
  /** A take is lifted to delete it: everything but the fan dims. */
  const [lifted, setLifted] = useState(false);
  const { capturing } = recorder;
  // A recovered or live take can arrive after Listen opened, or after a drag
  // that never went through open(). Record stays up for the whole take so
  // Eject is reachable; Discard is not the only way out.
  const showRecord = recordMode || capturing;
  /** The translation note on the blue screen, by id so a reload keeps it. */
  const [noteId, setNoteId] = useState<string | null>(null);
  /** Where its phrase was tapped; the blue grows from there. */
  const [noteFrom, setNoteFrom] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [noteClosing, setNoteClosing] = useState(false);
  /** The note last read; its phrase stays marked in the script. */
  const [lastNoteId, setLastNoteId] = useState<string | null>(null);
  useEffect(() => {
    if (noteId !== null) setLastNoteId(noteId);
  }, [noteId]);
  const noteIndex = useMemo(
    () => indexOfNote(notes.notes, noteId),
    [notes.notes, noteId],
  );
  const lastNote = useMemo(
    () => indexOfNote(notes.notes, lastNoteId),
    [notes.notes, lastNoteId],
  );
  // A note belongs to the open player's Listen side.
  const openNote = useCallback(
    (index: number, from?: { x: number; y: number }) => {
      const target = notes.notes[index];
      if (!expanded || recordMode || !target) return;
      if (noteId === null) setNoteFrom(from ?? null);
      setNoteClosing(false);
      setNoteId(target.id);
    },
    [expanded, recordMode, notes.notes, noteId],
  );
  const noteOpen = noteIndex !== null && expanded && !recordMode;
  useEffect(() => {
    if (!expanded || recordMode) setNoteId(null);
  }, [expanded, recordMode]);
  // The notes can reload without it; don't hold on to a note that's gone.
  useEffect(() => {
    if (noteId !== null && noteIndex === null) setNoteId(null);
  }, [noteId, noteIndex]);
  const noteKey = (to: number, direction: 'Previous' | 'Next'): KeyAction => {
    const target = notes.notes[to];
    return {
      label: target ? `${direction} note: ${target.quote}` : direction,
      disabled: !target,
      onPress: () => {
        setNoteClosing(false);
        if (target) setNoteId(target.id);
      },
    };
  };
  const scriptNotes = useMemo(
    () =>
      atRest
        ? {
            chips: notes.chips,
            quotes: notes.notes.map(n => n.quote),
            unplaced: notes.notes.filter(n => n.span === null).length,
            unplacedAt: unplacedByVerse(notes.notes),
            current: lastNote,
            // Notes are Listen's; the chips stay, quiet, but don't open in Record.
            onOpen: showRecord ? undefined : openNote,
            dimmed: showRecord,
          }
        : undefined,
    [atRest, notes, lastNote, showRecord, openNote],
  );
  // Leaving mid-take would ask first; the bridge waits until it's done.
  const openClassic = capturing ? undefined : onOpenClassic;
  const { isOnline, hasResolved } = useConnectivity();
  const [playingVerse, setPlayingVerse] = useState<number | null>(null);
  const steps = recorder.verse;
  // Until the text is in, the script shows why instead.
  const versePages =
    steps !== null && expanded && passage.downloaded && steps.verses.length > 0;
  // Same gate as Legacy's source bar: no API until /health resolves.
  const source = useSourceAudio({
    projectId: passage.assignment.projectId,
    bookCode: passage.assignment.bookCode,
    chapter: passage.assignment.chapterNumber,
    bibleId: passage.assignment.bibleId,
    languageCode: passage.assignment.sourceLanguageCode,
    verse: steps?.current ?? anchorVerse,
    enabled: !showRecord,
    deferred: !playerOpened,
    isOnline: hasResolved && isOnline,
    userId,
    onPlayingVerseChange: setPlayingVerse,
  });
  // The waveform and scrubbing cover the passage, not the whole chapter.
  const span = sourceWindow(
    passage.verses,
    passage.assignment.chapterNumber,
    source.verseTimestamps,
    source.dblAudioBibleId,
    source.durationMs,
  );
  const sourceProgress = windowProgress(
    source.positionMs,
    source.durationMs,
    span,
  );
  const seekSource =
    source.durationMs > 0
      ? (ratio: number) => {
          void source.seek(windowSeekMs(ratio, source.durationMs, span));
        }
      : undefined;
  // Listen ends with the passage, and plays it again from the top.
  const spanEnd = span?.endMs ?? null;
  const { isPlaying, positionMs, pause: pauseSource } = source;
  // Only crossing the end stops it: right after a replay's rewind the
  // position can still read the old end for a tick.
  const lastPositionRef = useRef(positionMs);
  useEffect(() => {
    const last = lastPositionRef.current;
    lastPositionRef.current = positionMs;
    if (spanEnd === null || !isPlaying) return;
    if (last < spanEnd && positionMs >= spanEnd) void pauseSource();
  }, [spanEnd, isPlaying, positionMs, pauseSource]);
  // Play is off on a note, so the chapter can't keep playing under it.
  useEffect(() => {
    if (noteOpen && isPlaying) void pauseSource();
  }, [noteOpen, isPlaying, pauseSource]);
  const rewind = async () => {
    if (span && source.positionMs >= span.endMs) {
      await source.seek(span.startMs);
    }
  };
  // Verse mode marks its own place once the source stops. Without verse
  // timings the source can't say which verse is playing, so it claims none.
  const timed = (source.verseTimestamps?.length ?? 0) > 0;
  const heardVerse = steps && (!isPlaying || !timed) ? null : playingVerse;
  // Verse mode takes up the last verse heard once the source stops, so Record
  // opens there. Moving it mid-play would seek against the playback.
  const goVerse = steps?.go;
  const stepCurrent = steps?.current;
  const lastHeard = useRef<number | null>(null);
  useEffect(() => {
    if (heardVerse !== null) {
      lastHeard.current = heardVerse;
      return;
    }
    const heard = lastHeard.current;
    lastHeard.current = null;
    if (!goVerse || heard === null || heard === stepCurrent) return;
    if (!steps?.verses.some(v => v.verseNumber === heard)) return;
    goVerse(heard);
    // Only the verse playing moves the place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heardVerse]);

  // A tapped verse row plays once it's the place and the source has loaded.
  const [playAt, setPlayAt] = useState<number | null>(null);
  // Once the place reaches it, moving away again drops the play.
  const reachedPlayAt = useRef(false);
  const { loadState, verseTimestamps, dblAudioBibleId } = source;
  const { pauseTakePlayback } = recorder;
  const replayVerse = (verse: number) =>
    hasVerseStart(verse, verseTimestamps, dblAudioBibleId)
      ? () => {
          void source.seek(
            verseStartMs(verse, verseTimestamps, dblAudioBibleId),
          );
        }
      : null;
  useEffect(() => {
    if (playAt === null) return;
    if (showRecord || !expanded || loadState === 'error') {
      setPlayAt(null);
      return;
    }
    if (playAt !== stepCurrent) {
      if (reachedPlayAt.current) setPlayAt(null);
      return;
    }
    reachedPlayAt.current = true;
    if (loadState !== 'ready') return;
    setPlayAt(null);
    // Without its timing it would play from the top of the chapter.
    if (isPlaying || !hasVerseStart(playAt, verseTimestamps, dblAudioBibleId)) {
      return;
    }
    void (async () => {
      await pauseTakePlayback();
      // Paused partway, play would resume there rather than at the verse.
      if (source.status === 'paused') {
        await source.seek(
          verseStartMs(playAt, verseTimestamps, dblAudioBibleId),
        );
      }
      await source.play();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playAt, stepCurrent, loadState, showRecord, expanded]);

  const settled = useCallback(() => {
    haptics.press();
    setAtRest(true);
  }, [haptics]);
  const animateTo = useCallback(
    (open: boolean, velocity = 0) => {
      setExpanded(open);
      if (open) setPlayerOpened(true);
      // Hundreds of phrases resizing with the script every frame is the
      // lag; they wait out the motion as plain text.
      setAtRest(false);
      // The hero previews the first verses, wherever the player was scrolled.
      if (!open) scriptRef.current?.scrollTo({ y: 0, animated: true });
      const target = open ? 1 : 0;
      const done = (finished?: boolean) => {
        'worklet';
        if (finished && open) scheduleOnRN(settled);
      };
      progress.value = reduceMotion
        ? withTiming(target, { duration: 0 }, done)
        : withSpring(target, { ...NEXT_SPRING, velocity }, done);
    },
    [progress, reduceMotion, settled],
  );
  const open = useCallback(
    (record: boolean) => {
      // A take in progress (or recovered) always opens on the recorder.
      setRecordMode(record || capturing);
      animateTo(true);
    },
    [animateTo, capturing],
  );

  // A take in progress asks first, like leaving a verse in the Record tab.
  const { discardCapture } = recorder;
  const [leaving, setLeaving] = useState(false);
  // Nothing to leave once the take ends on its own.
  useEffect(() => {
    if (!capturing) setLeaving(false);
  }, [capturing]);
  const close = useCallback(() => {
    if (!capturing) {
      animateTo(false);
      return;
    }
    setLeaving(true);
  }, [capturing, animateTo]);
  const leaveDialog: Omit<DialogProps, 'visible'> | null = leaving
    ? {
        title: CAPTURE_LEAVE_TITLE,
        message: CAPTURE_LEAVE_MESSAGE,
        confirmLabel: CAPTURE_LEAVE_DISCARD,
        cancelLabel: CAPTURE_LEAVE_RESUME,
        onConfirm: () => {
          setLeaving(false);
          void discardCapture().then(() => animateTo(false));
        },
        onCancel: () => setLeaving(false),
      }
    : null;
  // One question at a time, drawn as the Next dialog. The last one stays
  // while it fades out.
  const asked = leaveDialog ?? recorder.confirm;
  const lastAsked = useRef(asked);
  if (asked) lastAsked.current = asked;

  // A screen pushed over the open player gets back presses first.
  useEffect(() => {
    if (!expanded || !focused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (noteOpen) setNoteClosing(true);
      else close();
      return true;
    });
    return () => sub.remove();
  }, [expanded, focused, close, noteOpen]);

  // The collapsed hero drags open; once open, only the header drags it
  // closed, so the script keeps its own scrolling.
  const drag = (enabled: boolean) =>
    Gesture.Pan()
      .enabled(enabled)
      .activeOffsetY([-12, 12])
      .onStart(() => {
        scheduleOnRN(setAtRest, false);
      })
      .onUpdate(e => {
        const start = expanded ? 1 : 0;
        progress.value = Math.min(
          1,
          Math.max(0, start - e.translationY / range),
        );
      })
      .onEnd(e => {
        const shouldOpen = expanded
          ? progress.value > 1 - SNAP_AT && e.velocityY < FLING
          : progress.value > SNAP_AT || e.velocityY < -FLING;
        scheduleOnRN(animateTo, shouldOpen, -e.velocityY / range);
      });

  // Overlaps the materials fading out on the same cream, so the keys come
  // up out of the page instead of arriving after it.
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.45, 0.8], [0, 1], 'clamp'),
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0.4, 1],
          [(panel || container) * 0.4, 0],
          'clamp',
        ),
      },
    ],
  }));

  const measure = (set: (h: number) => void) => (e: LayoutChangeEvent) =>
    set(Math.round(e.nativeEvent.layout.height));
  const title = passage.title ?? passage.reference;

  return (
    <View style={styles.sheet} onLayout={measure(setContainer)}>
      <ColorModeScope value="canvas">
        <PassageHero
          passage={passage}
          takes={recorder.takes}
          title={title}
          downloadState={downloadState}
          progress={progress}
          expanded={expanded}
          playingVerse={heardVerse}
          verseSteps={steps}
          versesAreDraft={recorder.versesAreDraft}
          versePages={versePages}
          recordBlocked={recorder.cannotRecord}
          notices={recorder.notices}
          layout={{
            measured: header > 0 && actions > 0 && container > 0,
            collapsed,
            range,
            statusBar: insets.top,
            scriptTop: [scriptTop, headerBottom],
            scriptHeight: [preview, fullScript],
            actionsTop,
          }}
          openGesture={drag(!expanded)}
          closeGesture={drag(expanded && !capturing)}
          scriptRef={scriptRef}
          onHeaderLayout={setHeader}
          onActionsLayout={setActions}
          notes={scriptNotes}
          onOpen={record => open(record)}
          onBack={onBack}
          onClose={close}
          sync={sync}
          onDownload={onDownload}
          onOpenClassic={openClassic}
          // Its book link would leave without asking, unlike Close.
          onTitlePress={capturing ? undefined : () => setTitleSheetOpen(true)}
          covered={noteOpen}
        />
      </ColorModeScope>
      {steps ? (
        <VerseList
          verses={steps.verses}
          onOpen={verseNumber => {
            steps.go(verseNumber);
            open(false);
            reachedPlayAt.current = false;
            setPlayAt(verseNumber);
          }}
        />
      ) : null}
      <ColorModeScope value="hardware">
        <TitleSheet
          visible={titleSheetOpen}
          title={title}
          chapterName={chapterName}
          milestoneName={milestoneName}
          onClose={() => setTitleSheetOpen(false)}
          onOpenBook={onOpenBook}
          onOpenClassic={onOpenClassic}
        />
      </ColorModeScope>
      <PlayerChrome
        shown={expanded}
        style={chromeStyle}
        onLayout={measure(setPanel)}
        onKeysLayout={measure(setKeys)}
        fanShown={showRecord}
        footerCovered={noteOpen}
        fan={
          <LayoutAnimationConfig skipEntering>
            <TakeFan
              {...recorder.fan}
              visible={showRecord}
              onLiftChange={setLifted}
            />
          </LayoutAnimationConfig>
        }
        footer={
          <Footer
            passage={passage}
            recordMode={showRecord}
            record={recorder.footer}
            listen={{
              progress: sourceProgress,
              onSeek: seekSource,
              verseChips: steps === null || timed,
            }}
            notices={recorder.notices}
            onOpenClassic={openClassic}
            dimmed={lifted}
          />
        }
        keys={
          <PlayerKeys
            recordMode={showRecord}
            onRecordModeChange={setRecordMode}
            modeLocked={capturing}
            record={recorder.keys}
            listen={
              noteOpen
                ? // Notes have no audio yet (tap-to-hear, DES-2989).
                  {
                    playing: false,
                    playDisabled: true,
                    playLabel: "This note's audio isn't available yet",
                    onPlay: () => undefined,
                  }
                : listenKeys(source, recorder.pauseTakePlayback, rewind)
            }
            previous={
              noteOpen
                ? noteKey(noteIndex - 1, 'Previous')
                : verseTurn(steps, 'previous', heardVerse, replayVerse)
            }
            next={
              noteOpen
                ? noteKey(noteIndex + 1, 'Next')
                : verseTurn(steps, 'next', heardVerse, replayVerse)
            }
          />
        }
      />
      {lastAsked.current ? (
        <Dialog
          {...lastAsked.current}
          visible={asked !== null}
          testID="passage-confirm"
        />
      ) : null}
      {noteOpen ? (
        <ColorModeScope value="accent">
          <NoteScreen
            notes={notes.notes}
            index={noteIndex}
            bottom={keys}
            from={noteFrom}
            closing={noteClosing}
            onIndexChange={i => setNoteId(notes.notes[i]?.id ?? null)}
            onClose={() => setNoteClosing(true)}
            onClosed={() => {
              setNoteId(null);
              setNoteClosing(false);
            }}
          />
        </ColorModeScope>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ sheet: { flex: 1 } });

function unplacedByVerse(notes: { span: unknown; verse: string | null }[]) {
  const at = new Map<string, number[]>();
  notes.forEach((n, i) => {
    if (n.span !== null) return;
    const key = n.verse ?? '';
    at.set(key, [...(at.get(key) ?? []), i]);
  });
  return at;
}

function indexOfNote(notes: { id: string }[], id: string | null) {
  const index = id === null ? -1 : notes.findIndex(n => n.id === id);
  return index < 0 ? null : index;
}
