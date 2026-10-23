import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture } from 'react-native-gesture-handler';
import {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useHaptics } from '../../../../hooks/useHaptics';
import type { usePassage } from '../../../../hooks/usePassage';
import { ColorModeScope, useTheme } from '../../../../theme/useTheme';
import { Footer } from './Footer';
import { ListeningMaterials } from './ListeningMaterials';
import { PassageHero } from './PassageHero';
import { PlayerChrome } from './PlayerChrome';
import { PlayerKeys } from './PlayerKeys';
import { useScriptMetrics } from './scriptMetrics';
import { type Ready } from './steps';

/** Firm, barely any bounce; a drag's release speed carries into it. */
const SHEET_SPRING = { damping: 26, stiffness: 220, mass: 1 };
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
 * materials Hardware, and the player chrome sets its own two.
 */
export function Sheet({
  passage,
  onBack,
  onOpenDrafting,
  onDownload,
  downloadState,
}: {
  passage: Ready;
  onBack: () => void;
  onOpenDrafting: () => void;
  onDownload: () => void;
  downloadState: ReturnType<typeof usePassage>['downloadState'];
}) {
  const { spacing } = useTheme();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { preview } = useScriptMetrics();
  const [expanded, setExpanded] = useState(false);
  const [recordMode, setRecordMode] = useState(false);
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
  const goToPage = useCallback(
    (index: number) => {
      setPage(index);
      pagerRef.current?.scrollTo({ x: index * pageWidth, animated: false });
    },
    [pageWidth],
  );

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
        : withSpring(target, { ...SHEET_SPRING, velocity }, done);
    },
    [progress, reduceMotion, settled, goToPage],
  );
  /** Opens on the script, or on a listening material's page. */
  const open = useCallback(
    (record: boolean, atPage = 0) => {
      setRecordMode(record);
      goToPage(record ? 0 : atPage);
      animateTo(true);
    },
    [animateTo, goToPage],
  );
  // Recording is always of the script.
  const changeMode = useCallback(
    (record: boolean) => {
      setRecordMode(record);
      if (record) goToPage(0);
    },
    [goToPage],
  );

  useEffect(() => {
    if (!expanded) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      animateTo(false);
      return true;
    });
    return () => sub.remove();
  }, [expanded, animateTo]);

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

  return (
    <View style={styles.sheet} onLayout={measure(setContainer)}>
      <ColorModeScope value="canvas">
        <PassageHero
          passage={passage}
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
          closeGesture={drag(expanded)}
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
          onClose={() => animateTo(false)}
          onDownload={onDownload}
        />
      </ColorModeScope>
      <ColorModeScope value="hardware">
        <ListeningMaterials
          reference={passage.reference}
          progress={progress}
          hidden={expanded}
          onOpen={step => open(false, step + 1)}
        />
      </ColorModeScope>
      <PlayerChrome
        shown={expanded}
        style={chromeStyle}
        onLayout={measure(setPanel)}
        footer={
          <Footer
            passage={passage}
            page={page}
            recordMode={recordMode}
            takes={passage.takes}
            onOpenDrafting={onOpenDrafting}
          />
        }
        keys={
          <PlayerKeys
            recordMode={recordMode}
            onRecordModeChange={changeMode}
            onOpenDrafting={onOpenDrafting}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({ sheet: { flex: 1 } });
