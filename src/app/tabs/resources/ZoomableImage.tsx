import React, { useMemo, useRef } from 'react';
import {
  Animated,
  StyleSheet,
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

  const composed = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onUpdate(event => {
        const next = Math.min(
          MAX_SCALE,
          Math.max(MIN_SCALE, savedScale.current * event.scale),
        );
        currentScale.current = next;
        scale.setValue(next);
      })
      .onEnd(() => {
        savedScale.current = currentScale.current;
        if (savedScale.current <= MIN_SCALE + 0.01) {
          savedScale.current = MIN_SCALE;
          currentScale.current = MIN_SCALE;
          scale.setValue(MIN_SCALE);
          savedTranslate.current = { x: 0, y: 0 };
          currentTranslate.current = { x: 0, y: 0 };
          translateX.setValue(0);
          translateY.setValue(0);
        }
      });

    const pan = Gesture.Pan()
      .onUpdate(event => {
        if (currentScale.current <= MIN_SCALE) {
          return;
        }
        const nextX = savedTranslate.current.x + event.translationX;
        const nextY = savedTranslate.current.y + event.translationY;
        currentTranslate.current = { x: nextX, y: nextY };
        translateX.setValue(nextX);
        translateY.setValue(nextY);
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
  }, [onPress, scale, translateX, translateY]);

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          styles.host,
          style,
          {
            transform: [{ translateX }, { translateY }, { scale }],
          },
        ]}
        testID={testID}
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
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  host: {
    overflow: 'hidden',
    backgroundColor: theme.colors.cardBackground,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
