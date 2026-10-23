import React, { type RefObject } from 'react';
import type { ScrollView } from 'react-native';
import {
  GestureDetector,
  type GestureType,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import type { usePassage } from '../../../../hooks/usePassage';
import { useThemedStyles } from '../../../../theme/useTheme';
import { HeroActions } from './HeroActions';
import { HeroHeader } from './HeroHeader';
import { ScriptPager } from './ScriptPager';
import { type Ready } from './steps';

/** Where the hero's pieces sit, worked out by the sheet. */
export interface HeroLayout {
  /** False until the header, actions and screen have been measured. */
  measured: boolean;
  /** The frame's height closed, and how much more it grows to open. */
  collapsed: number;
  range: number;
  statusBar: number;
  scriptTop: readonly [number, number];
  scriptHeight: readonly [number, number];
  actionsTop: number;
  pageWidth: number;
}

/**
 * The dark reading area: the header, the script and the hero's actions, in
 * a frame that grows from the hero to the full player. Drag the hero to open
 * it, or the header to close it.
 */
export function PassageHero({
  passage,
  downloadState,
  progress,
  expanded,
  recordMode,
  layout,
  openGesture,
  closeGesture,
  pagerRef,
  scriptRef,
  onHeaderLayout,
  onActionsLayout,
  onPageChange,
  onOpen,
  onBack,
  onClose,
  onDownload,
}: {
  passage: Ready;
  downloadState: ReturnType<typeof usePassage>['downloadState'];
  progress: SharedValue<number>;
  expanded: boolean;
  recordMode: boolean;
  layout: HeroLayout;
  openGesture: GestureType;
  closeGesture: GestureType;
  pagerRef: RefObject<ScrollView | null>;
  scriptRef: RefObject<ScrollView | null>;
  onHeaderLayout: (height: number, width: number) => void;
  onActionsLayout: (height: number) => void;
  onPageChange: (page: number) => void;
  /** Opens the player, on the recorder or the script. */
  onOpen: (record: boolean) => void;
  onBack: () => void;
  onClose: () => void;
  onDownload: () => void;
}) {
  const styles = useThemedStyles(t => ({
    frame: { overflow: 'hidden', backgroundColor: t.roles.bgDefault },
  }));
  const { measured, collapsed, range } = layout;
  const frameStyle = useAnimatedStyle(() =>
    measured
      ? { height: collapsed + range * Math.min(1, progress.value) }
      : { height: 0 },
  );
  return (
    <GestureDetector gesture={openGesture}>
      <Animated.View style={[styles.frame, frameStyle]}>
        <ScriptPager
          passage={passage}
          downloadState={downloadState}
          progress={progress}
          expanded={expanded}
          recordMode={recordMode}
          pageWidth={layout.pageWidth}
          top={layout.scriptTop}
          height={layout.scriptHeight}
          pagerRef={pagerRef}
          scriptRef={scriptRef}
          onPageChange={onPageChange}
          onOpen={() => onOpen(false)}
        />
        <HeroActions
          passage={passage}
          downloadState={downloadState}
          progress={progress}
          expanded={expanded}
          top={layout.actionsTop}
          onLayout={onActionsLayout}
          onListen={() => onOpen(false)}
          onRecord={() => onOpen(true)}
          onDownload={onDownload}
        />
        <HeroHeader
          title={passage.title ?? passage.reference}
          top={layout.statusBar}
          progress={progress}
          expanded={expanded}
          closeGesture={closeGesture}
          onLayout={onHeaderLayout}
          onBack={onBack}
          onClose={onClose}
        />
      </Animated.View>
    </GestureDetector>
  );
}
