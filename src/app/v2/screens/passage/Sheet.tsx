import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  BackHandler,
  InteractionManager,
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
import { useHaptics } from '../../../../hooks/useHaptics';
import type { HeaderSync } from '../../../../hooks/useHeaderSync';
import type { usePassage } from '../../../../hooks/usePassage';
import { useSourceAudio } from '../../../../hooks/useSourceAudio';
import type { CaptureControls } from '../../../../types/captureControls';
import type { SourceAudioLoadState } from '../../../../types/sourceAudio';
import { ColorModeScope, useTheme } from '../../../../theme/useTheme';
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

/** How far the hero drags before a release opens or closes it. */
const SNAP_AT = 0.35;
const FLING = 500;

/** One page now the FIA steps are hidden (Q11), so these stay off. */
const NO_TURN = (label: string): KeyAction => ({
  label,
  disabled: true,
  onPress: () => {},
});

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
  /** Notes load once the screen has arrived, ready for the player. */
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() =>
      setArrived(true),
    );
    return () => task.cancel();
  }, []);
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
  const recorder = useRecorder({
    passage,
    userId,
    showing: expanded && recordMode,
    downloading: downloadState === 'downloading',
    onReload,
    onCaptureActiveChange,
    onRegisterCaptureControls,
  });
  const notes = usePassageNotes(passage, userId, arrived || expanded);
  /** The translation note on the blue screen, by index. */
  const [noteIndex, setNoteIndex] = useState<number | null>(null);
  /** Where its phrase was tapped; the blue grows from there. */
  const [noteFrom, setNoteFrom] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [noteClosing, setNoteClosing] = useState(false);
  /** The note last read; its phrase stays marked in the script. */
  const [lastNote, setLastNote] = useState<number | null>(null);
  useEffect(() => {
    if (noteIndex !== null) setLastNote(noteIndex);
  }, [noteIndex]);
  const noteIndexRef = useRef(noteIndex);
  noteIndexRef.current = noteIndex;
  // A note belongs to the open player's Listen side.
  const openNote = useCallback(
    (index: number, from?: { x: number; y: number }) => {
      if (!expanded || recordMode) return;
      if (noteIndexRef.current === null) setNoteFrom(from ?? null);
      setNoteClosing(false);
      setNoteIndex(index);
    },
    [expanded, recordMode],
  );
  const noteOpen = noteIndex !== null && expanded && !recordMode;
  useEffect(() => {
    if (!expanded || recordMode) setNoteIndex(null);
  }, [expanded, recordMode]);
  // The notes can reload with fewer; don't hold an index past them.
  useEffect(() => {
    if (noteIndex !== null && !notes.notes[noteIndex]) setNoteIndex(null);
  }, [notes.notes, noteIndex]);
  const noteKey = (to: number, direction: 'Previous' | 'Next'): KeyAction => {
    const target = notes.notes[to];
    return {
      label: target ? `${direction} note: ${target.quote}` : direction,
      disabled: !target,
      onPress: () => {
        setNoteClosing(false);
        setNoteIndex(to);
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
            current: lastNote,
            onOpen: openNote,
          }
        : undefined,
    [atRest, notes, lastNote, openNote],
  );
  /** A take is lifted to delete it: everything but the fan dims. */
  const [lifted, setLifted] = useState(false);
  const { capturing } = recorder;
  // A recovered or live take can arrive after Listen opened, or after a drag
  // that never went through open(). Record stays up for the whole take so
  // Eject is reachable; Discard is not the only way out.
  const showRecord = recordMode || capturing;
  // Leaving mid-take would ask first; the bridge waits until it's done.
  const openClassic = capturing ? undefined : onOpenClassic;
  const { isOnline, hasResolved } = useConnectivity();
  const [playingVerse, setPlayingVerse] = useState<number | null>(null);
  // Same gate as Legacy's source bar: no API until /health resolves.
  const source = useSourceAudio({
    projectId: passage.assignment.projectId,
    bookCode: passage.assignment.bookCode,
    chapter: passage.assignment.chapterNumber,
    bibleId: passage.assignment.bibleId,
    languageCode: passage.assignment.sourceLanguageCode,
    verse: anchorVerse,
    enabled: !showRecord,
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

  const settled = useCallback(() => {
    haptics.press();
    setAtRest(true);
  }, [haptics]);
  const animateTo = useCallback(
    (open: boolean, velocity = 0) => {
      setExpanded(open);
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
  const close = useCallback(() => {
    if (!capturing) {
      animateTo(false);
      return;
    }
    Alert.alert(CAPTURE_LEAVE_TITLE, CAPTURE_LEAVE_MESSAGE, [
      { text: CAPTURE_LEAVE_RESUME, style: 'cancel' },
      {
        text: CAPTURE_LEAVE_DISCARD,
        style: 'destructive',
        onPress: () => {
          void discardCapture().then(() => animateTo(false));
        },
      },
    ]);
  }, [capturing, animateTo, discardCapture]);

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
          playingVerse={playingVerse}
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
        />
      </ColorModeScope>
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
            listen={{ progress: sourceProgress, onSeek: seekSource }}
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
                : NO_TURN('Previous')
            }
            next={noteOpen ? noteKey(noteIndex + 1, 'Next') : NO_TURN('Next')}
          />
        }
      />
      {noteOpen ? (
        <ColorModeScope value="accent">
          <NoteScreen
            notes={notes.notes}
            index={noteIndex}
            bottom={keys}
            from={noteFrom}
            closing={noteClosing}
            onIndexChange={setNoteIndex}
            onClose={() => setNoteClosing(true)}
            onClosed={() => {
              setNoteIndex(null);
              setNoteClosing(false);
            }}
          />
        </ColorModeScope>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ sheet: { flex: 1 } });
