import React, { useCallback } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import {
  Gesture,
  GestureDetector,
  type GestureStateManager,
  type GestureTouchEvent,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { theme } from '../../../theme';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const RESET_EPSILON = 0.01;
/** How far a finger can move and still be a tap. */
const TAP_SLOP = 10;

type ZoomableImageProps = {
  uri: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: 'cover' | 'contain';
  testID?: string;
  onLoadError?: () => void;
  /** Gets the image's own size, for callers that fit to its shape. */
  onLoad?: (size: { width: number; height: number }) => void;
  /** Invoked on a clean single tap (not a pinch/pan/double-tap). */
  onPress?: () => void;
  /**
   * Fill color for the clipping viewport (letterbox area for `contain`).
   * Fullscreen should pass a dark color so bars match the modal chrome.
   */
  hostBackgroundColor?: string;
};

/** Pinch scale held to 1x–4x. */
export function clampScale(savedScale: number, pinchScale: number) {
  'worklet';
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale * pinchScale));
}

/** Keeps a zoomed image's edges from panning inside the viewport. */
export function clampTranslate(
  x: number,
  y: number,
  scaleValue: number,
  width: number,
  height: number,
) {
  'worklet';
  const maxX = Math.max(0, (width * (scaleValue - 1)) / 2);
  const maxY = Math.max(0, (height * (scaleValue - 1)) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  };
}

/**
 * Pinch-to-zoom + pan image surface for Resources Images & Maps (#191).
 * Transforms run on the UI thread via Reanimated shared values.
 */
export function ZoomableImage({
  uri,
  accessibilityLabel,
  style,
  contentFit = 'cover',
  testID,
  onLoadError,
  onLoad,
  onPress,
  hostBackgroundColor = theme.colors.cardBackground,
}: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const viewportWidth = useSharedValue(0);
  const viewportHeight = useSharedValue(0);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      viewportWidth.value = width;
      viewportHeight.value = height;
    },
    [viewportHeight, viewportWidth],
  );

  const resetZoom = () => {
    'worklet';
    scale.value = withTiming(MIN_SCALE);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedScale.value = MIN_SCALE;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate(event => {
      const next = clampScale(savedScale.value, event.scale);
      scale.value = next;
      const clamped = clampTranslate(
        translateX.value,
        translateY.value,
        next,
        viewportWidth.value,
        viewportHeight.value,
      );
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (savedScale.value <= MIN_SCALE + RESET_EPSILON) {
        resetZoom();
        return;
      }
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Fail pan at 1× so single-finger vertical drags reach the parent ScrollView.
  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_event, state) => {
      if (scale.value > MIN_SCALE + RESET_EPSILON) {
        state.activate();
      } else {
        state.fail();
      }
    })
    .onUpdate(event => {
      const clamped = clampTranslate(
        savedTranslateX.value + event.translationX,
        savedTranslateY.value + event.translationY,
        scale.value,
        viewportWidth.value,
        viewportHeight.value,
      );
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Taps are one still finger: a second finger (a pinch starting) or a
  // finger that moves fails them, so a quick pinch or a drag never taps,
  // and two quick pinches never read as a double tap that resets the zoom.
  const failOnSecondFinger = (
    event: GestureTouchEvent,
    manager: GestureStateManager,
  ) => {
    'worklet';
    if (event.numberOfTouches > 1) manager.fail();
  };

  const doubleTap = Gesture.Tap()
    .withTestId('zoomable-image-double-tap')
    .numberOfTaps(2)
    .maxDistance(TAP_SLOP)
    .onTouchesDown(failOnSecondFinger)
    .onEnd(() => {
      resetZoom();
    });

  const singleTap = onPress
    ? Gesture.Tap()
        .withTestId('zoomable-image-tap')
        .numberOfTaps(1)
        .maxDistance(TAP_SLOP)
        .onTouchesDown(failOnSecondFinger)
        .onEnd(() => {
          scheduleOnRN(onPress);
        })
    : null;

  const tapGestures = singleTap
    ? Gesture.Exclusive(doubleTap, singleTap)
    : doubleTap;
  const composed = Gesture.Simultaneous(pinch, pan, tapGestures);

  const imageLayerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <View
        style={[styles.host, { backgroundColor: hostBackgroundColor }, style]}
        testID={testID}
        onLayout={onLayout}
      >
        <Animated.View style={[styles.imageLayer, imageLayerStyle]}>
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit={contentFit}
            accessibilityLabel={accessibilityLabel}
            onError={onLoadError}
            onLoad={
              onLoad
                ? e =>
                    onLoad({ width: e.source.width, height: e.source.height })
                : undefined
            }
            cachePolicy="memory-disk"
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  host: {
    overflow: 'hidden',
  },
  imageLayer: {
    width: '100%',
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
