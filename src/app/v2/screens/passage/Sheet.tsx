import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
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
import { useHaptics } from '../../../../hooks/useHaptics';
import type { usePassage } from '../../../../hooks/usePassage';
import { ColorModeScope, useTheme } from '../../../../theme/useTheme';
import { Footer } from './Footer';
import { ListeningMaterials } from './ListeningMaterials';
import { PassageHero } from './PassageHero';
import { PlayerChrome } from './PlayerChrome';
import { PlayerKeys, type KeyAction } from './PlayerKeys';
import { useScriptMetrics } from './scriptMetrics';
import { PAGE_COUNT, pageName, type Ready } from './steps';
import { TakeFan } from './TakeFan';
import { TitleSheet } from './TitleSheet';
import { useRecorder } from './useRecorder';

/** How far the hero drags before a release opens or closes it. */
const SNAP_AT = 0.35;
const FLING = 500;

/**
 * The hero and the player are one sheet. Opening it keeps the script where
 * it is and grows it to reading size, slides the title over to the player
 * header, then raises the keys from below the screen.
 *
 * This file owns the open: the gesture, `progress` and the layout it drives.
 * It also picks each surface's mode, once: the hero is Canvas, the listening
 * materials and the title's sheet Hardware, and the player chrome sets its
 * own two.
 */
export function Sheet({
  passage,
  userId,
  onReload,
  chapterName,
  milestoneName,
  onBack,
  onOpenBook,
  onOpenDrafting,
  onDownload,
  downloadState,
}: {
  passage: Ready;
  userId: number | null;
  /** Re-reads the passage, e.g. after recording claims its chapter. */
  onReload: () => void;
  /** e.g. "Mark 14"; the title's sheet links it up to the book page. */
  chapterName: string;
  milestoneName: string;
  onBack: () => void;
  onOpenBook: () => void;
  onOpenDrafting: () => void;
  onDownload: () => void;
  downloadState: ReturnType<typeof usePassage>['downloadState'];
}) {
  const { spacing } = useTheme();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const focused = useIsFocused();
  const { preview } = useScriptMetrics();
  const [expanded, setExpanded] = useState(false);
  const [recordMode, setRecordMode] = useState(false);
  const [titleSheetOpen, setTitleSheetOpen] = useState(false);
  const [container, setContainer] = useState(0);
  const [header, setHeader] = useState(0);
  const [headerWidth, setHeaderWidth] = useState(0);
  const [actions, setActions] = useState(0);
  const [panel, setPanel] = useState(0);
  const progress = useSharedValue(0);
  const scriptRef = useRef<ScrollView>(null);
  const pagerRef = useRef<ScrollView>(null);
  /** 0 is the script; then one page per listening material. */
  const [page, setPage] = useState(0);

  const headerBottom = insets.top + header;
  const scriptTop = headerBottom + spacing.sm;
  const actionsTop = scriptTop + preview + spacing.lg;
  const collapsed = actionsTop + actions + spacing.xl;
  const range = Math.max(1, container - collapsed);
  const fullScript = Math.max(preview, container - headerBottom - panel);
  const pageWidth = headerWidth;
  const recorder = useRecorder({
    passage,
    userId,
    showing: expanded && recordMode,
    onReload,
  });
  /** A take is lifted to delete it: everything but the fan dims. */
  const [lifted, setLifted] = useState(false);
  const { capturing } = recorder;
  const goToPage = useCallback(
    (index: number, animated = false) => {
      setPage(index);
      pagerRef.current?.scrollTo({ x: index * pageWidth, animated });
    },
    [pageWidth],
  );
  const turnKey = (to: number, direction: 'Previous' | 'Next'): KeyAction => {
    const off = to < 0 || to >= PAGE_COUNT;
    return {
      label: off
        ? direction
        : `${direction}: ${pageName(passage.reference, to)}`,
      disabled: off,
      onPress: () => goToPage(to, !reduceMotion),
    };
  };

  const settled = useCallback(() => haptics.press(), [haptics]);
  const animateTo = useCallback(
    (open: boolean, velocity = 0) => {
      setExpanded(open);
      // The hero previews the first verses, wherever the player was scrolled.
      if (!open) {
        scriptRef.current?.scrollTo({ y: 0, animated: true });
        goToPage(0);
      }
      const target = open ? 1 : 0;
      const done = (finished?: boolean) => {
        'worklet';
        if (finished && open) scheduleOnRN(settled);
      };
      progress.value = reduceMotion
        ? withTiming(target, { duration: 0 }, done)
        : withSpring(target, { ...NEXT_SPRING, velocity }, done);
    },
    [progress, reduceMotion, settled, goToPage],
  );
  /** Opens on the script, or on a listening material's page. */
  const open = useCallback(
    (record: boolean, atPage = 0) => {
      // A take in progress (or recovered) always opens on the recorder.
      const toRecord = record || capturing;
      setRecordMode(toRecord);
      goToPage(toRecord ? 0 : atPage);
      animateTo(true);
    },
    [animateTo, goToPage, capturing],
  );
  // Recording is always of the script.
  const changeMode = useCallback(
    (record: boolean) => {
      setRecordMode(record);
      if (record) goToPage(0);
    },
    [goToPage],
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
      close();
      return true;
    });
    return () => sub.remove();
  }, [expanded, focused, close]);

  // The collapsed hero drags open; once open, only the header drags it
  // closed, so the script keeps its own scrolling.
  const drag = (enabled: boolean) =>
    Gesture.Pan()
      .enabled(enabled)
      .activeOffsetY([-12, 12])
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
          recordMode={recordMode}
          layout={{
            measured: header > 0 && actions > 0 && container > 0,
            collapsed,
            range,
            statusBar: insets.top,
            scriptTop: [scriptTop, headerBottom],
            scriptHeight: [preview, fullScript],
            actionsTop,
            pageWidth,
          }}
          openGesture={drag(!expanded)}
          closeGesture={drag(expanded && !capturing)}
          pagerRef={pagerRef}
          scriptRef={scriptRef}
          onHeaderLayout={(height, width) => {
            setHeader(height);
            setHeaderWidth(width);
          }}
          onActionsLayout={setActions}
          onPageChange={setPage}
          onOpen={record => open(record)}
          onBack={onBack}
          onClose={close}
          onDownload={onDownload}
          // Its book link would leave without asking, unlike Close.
          onTitlePress={capturing ? undefined : () => setTitleSheetOpen(true)}
        />
      </ColorModeScope>
      <ColorModeScope value="hardware">
        <ListeningMaterials
          reference={passage.reference}
          progress={progress}
          hidden={expanded}
          onOpen={step => open(false, step + 1)}
        />
        <TitleSheet
          visible={titleSheetOpen}
          title={title}
          chapterName={chapterName}
          milestoneName={milestoneName}
          onClose={() => setTitleSheetOpen(false)}
          onOpenBook={onOpenBook}
        />
      </ColorModeScope>
      <PlayerChrome
        shown={expanded}
        style={chromeStyle}
        onLayout={measure(setPanel)}
        fanShown={recordMode}
        fan={
          <LayoutAnimationConfig skipEntering>
            <TakeFan
              {...recorder.fan}
              visible={recordMode}
              onLiftChange={setLifted}
            />
          </LayoutAnimationConfig>
        }
        footer={
          <Footer
            passage={passage}
            page={page}
            recordMode={recordMode}
            record={recorder.footer}
            dimmed={lifted}
          />
        }
        keys={
          <PlayerKeys
            recordMode={recordMode}
            onRecordModeChange={changeMode}
            modeLocked={capturing}
            record={recorder.keys}
            previous={turnKey(page - 1, 'Previous')}
            next={turnKey(page + 1, 'Next')}
            onOpenDrafting={onOpenDrafting}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({ sheet: { flex: 1 } });
