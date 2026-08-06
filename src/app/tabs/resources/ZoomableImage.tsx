import React, { useCallback, useMemo, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { theme } from '../../../theme';

const MIN_SCALE = 1;
const MAX_SCALE = 4;

type ZoomableImageProps = {
  uri: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: 'cover' | 'contain';
  testID?: string;
  onLoadError?: () => void;
  /** Invoked on a clean tap (not a pinch/pan). */
  onPress?: () => void;
};

/**
 * Pinch-to-zoom + pan image surface for Resources Images & Maps (#191).
 * Uses RNGH Gesture API with RN Animated (same stack as settings panel swipe).
 */
export function ZoomableImage({
  uri,
  accessibilityLabel,
  style,
  contentFit = 'cover',
  testID,
  onLoadError,
  onPress,
}: ZoomableImageProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const savedScale = useRef(1);
  const currentScale = useRef(1);
  const savedTranslate = useRef({ x: 0, y: 0 });
  const currentTranslate = useRef({ x: 0, y: 0 });
  const viewport = useRef({ width: 0, height: 0 });

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    viewport.current = { width, height };
  }, []);

  // The scaled layer overflows the viewport by (size * (scale - 1)); half of
  // that on each side is the furthest it can pan before showing empty space.
  const clampTranslate = useCallback(
    (x: number, y: number, scaleValue: number) => {
      const maxX = Math.max(0, (viewport.current.width * (scaleValue - 1)) / 2);
      const maxY = Math.max(
        0,
        (viewport.current.height * (scaleValue - 1)) / 2,
      );
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    [],
  );

  const applyTranslate = useCallback(
    (next: { x: number; y: number }) => {
      currentTranslate.current = next;
      translateX.setValue(next.x);
      translateY.setValue(next.y);
    },
    [translateX, translateY],
  );

  const composed = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onUpdate(event => {
        const next = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, savedScale.current * event.scale),
        );
        currentScale.current = next;
        scale.setValue(next);
        applyTranslate(
          clampTranslate(
            currentTranslate.current.x,
            currentTranslate.current.y,
            next,
          ),
        );
      })
      .onEnd(() => {
        savedScale.current = currentScale.current;
        if (savedScale.current <= MIN_SCALE + 0.01) {
          savedScale.current = MIN_SCALE;
          currentScale.current = MIN_SCALE;
          scale.setValue(MIN_SCALE);
          applyTranslate({ x: 0, y: 0 });
        }
        savedTranslate.current = currentTranslate.current;
      });

    const pan = Gesture.Pan()
      .onUpdate(event => {
        if (currentScale.current <= MIN_SCALE) {
          return;
        }
        applyTranslate(
          clampTranslate(
            savedTranslate.current.x + event.translationX,
            savedTranslate.current.y + event.translationY,
            currentScale.current,
          ),
        );
      })
      .onEnd(() => {
        savedTranslate.current = currentTranslate.current;
      });

    const zoomGestures = Gesture.Simultaneous(pinch, pan);
    if (!onPress) {
      return zoomGestures;
    }

    const tap = Gesture.Tap().onEnd(() => {
      onPress();
    });
    return Gesture.Exclusive(zoomGestures, tap);
  }, [applyTranslate, clampTranslate, onPress, scale]);

  return (
    <GestureDetector gesture={composed}>
      <View style={[styles.host, style]} testID={testID} onLayout={onLayout}>
        <Animated.View
          style={[
            styles.imageLayer,
            {
              transform: [{ translateX }, { translateY }, { scale }],
            },
          ]}
        >
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit={contentFit}
            accessibilityLabel={accessibilityLabel}
            onError={onLoadError}
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
    backgroundColor: theme.colors.cardBackground,
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
