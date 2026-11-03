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
import type { HeaderSync } from '../../../../hooks/useHeaderSync';
import type { PassageTake, usePassage } from '../../../../hooks/usePassage';
import { useThemedStyles } from '../../../../theme/useTheme';
import { HeroActions } from './HeroActions';
import { HeroHeader } from './HeroHeader';
import { type Ready } from './ready';
import { ScriptPager, type ScriptNotes } from './ScriptPager';
import type { RecordNotice } from './useRecorder';

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
}

/**
 * The dark reading area: the header, the script and the hero's actions, in
 * a frame that grows from the hero to the full player. Drag the hero to open
 * it, or the header to close it.
 */
export function PassageHero({
  passage,
  takes,
  title,
  downloadState,
  progress,
  expanded,
  playingVerse,
  recordBlocked,
  notices,
  layout,
  openGesture,
  closeGesture,
  scriptRef,
  onHeaderLayout,
  onActionsLayout,
  notes,
  onOpen,
  onBack,
  onClose,
  sync,
  onDownload,
  onOpenClassic,
  onTitlePress,
}: {
  passage: Ready;
  takes: PassageTake[];
  title: string;
  downloadState: ReturnType<typeof usePassage>['downloadState'];
  progress: SharedValue<number>;
  expanded: boolean;
  /** The source verse playing, highlighted in the script. */
  playingVerse: number | null;
  /** Why Record can't start here; the hero's Record is off with it. */
  recordBlocked: string | null;
  notices: RecordNotice[];
  layout: HeroLayout;
  openGesture: GestureType;
  closeGesture: GestureType;
  scriptRef: RefObject<ScrollView | null>;
  onHeaderLayout: (height: number) => void;
  onActionsLayout: (height: number) => void;
  /** The passage's translation notes, as chips in the script. */
  notes?: ScriptNotes;
  /** Opens the player, on the recorder or the script. */
  onOpen: (record: boolean) => void;
  onBack: () => void;
  onClose: () => void;
  sync: HeaderSync;
  onDownload: () => void;
  onOpenClassic?: () => void;
  onTitlePress?: () => void;
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
          playingVerse={playingVerse}
          top={layout.scriptTop}
          height={layout.scriptHeight}
          scriptRef={scriptRef}
          notes={notes}
          onOpen={() => onOpen(false)}
        />
        <HeroActions
          passage={passage}
          takes={takes}
          downloadState={downloadState}
          progress={progress}
          expanded={expanded}
          recordBlocked={recordBlocked}
          notices={notices}
          top={layout.actionsTop}
          onLayout={onActionsLayout}
          onListen={() => onOpen(false)}
          onRecord={() => onOpen(true)}
          onDownload={onDownload}
          onOpenClassic={onOpenClassic}
        />
        <HeroHeader
          title={title}
          top={layout.statusBar}
          progress={progress}
          expanded={expanded}
          closeGesture={closeGesture}
          onLayout={height => onHeaderLayout(height)}
          onBack={onBack}
          onClose={onClose}
          sync={sync}
          onTitlePress={onTitlePress}
        />
      </Animated.View>
    </GestureDetector>
  );
}
