import 'react-native-gesture-handler/jestSetup';
import React from 'react';
import { act, render } from '@testing-library/react-native';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import { clampScale, clampTranslate, ZoomableImage } from './ZoomableImage';

// The shared expo-image mock fires onLoad itself with a 1 × 1 source; this file
// keeps the handler so it can report the image's own size.
let mockImageOnLoad: ((event: unknown) => void) | undefined;
jest.mock('expo-image', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Image: (props: { source?: unknown; onLoad?: (event: unknown) => void }) => {
      mockImageOnLoad = props.onLoad;
      return React.createElement(View, { source: props.source });
    },
  };
});

describe('ZoomableImage limits', () => {
  it('holds a pinch between 1x and 4x', () => {
    expect(clampScale(1, 0.5)).toBe(1);
    expect(clampScale(2, 1.5)).toBe(3);
    expect(clampScale(3, 2)).toBe(4);
  });

  it('pins the image at 1x so it cannot pan', () => {
    const pinned = clampTranslate(40, -30, 1, 300, 200);
    expect(pinned.x).toBeCloseTo(0);
    expect(pinned.y).toBeCloseTo(0);
  });

  it('pans a zoomed image only as far as its edges', () => {
    // At 2x a 300 x 200 viewport has 150 x 100 of overhang on each side.
    expect(clampTranslate(500, -500, 2, 300, 200)).toEqual({
      x: 150,
      y: -100,
    });
    expect(clampTranslate(20, 10, 2, 300, 200)).toEqual({ x: 20, y: 10 });
  });
});

describe('ZoomableImage', () => {
  it("hands onLoad the image's own size", async () => {
    const onLoad = jest.fn();
    await render(
      <ZoomableImage uri="file:///map.jpg" onLoad={onLoad} testID="zoom" />,
    );
    await act(() => {
      mockImageOnLoad?.({
        cacheType: 'none',
        source: { url: 'file:///map.jpg', width: 800, height: 600 },
      });
    });
    expect(onLoad).toHaveBeenLastCalledWith({ width: 800, height: 600 });
  });

  it('taps with one still finger only, so a quick pinch never taps', async () => {
    const onPress = jest.fn();
    await render(<ZoomableImage uri="file:///map.jpg" onPress={onPress} />);
    const tap = getByGestureTestId('zoomable-image-tap');

    fireGestureHandler(tap);
    // The tap hands off to the JS thread on a microtask.
    await act(async () => {});
    expect(onPress).toHaveBeenCalledTimes(1);

    // A second finger, a pinch starting, fails the tap; one finger doesn't.
    const touchesDown = tap.handlers.onTouchesDown as unknown as (
      event: { numberOfTouches: number },
      manager: { fail: () => void },
    ) => void;
    const fail = jest.fn();
    touchesDown({ numberOfTouches: 1 }, { fail });
    expect(fail).not.toHaveBeenCalled();
    touchesDown({ numberOfTouches: 2 }, { fail });
    expect(fail).toHaveBeenCalledTimes(1);

    // A finger that moves past a small slop isn't a tap either.
    expect((tap.config as { maxDist?: number }).maxDist).toBe(10);
  });

  it('never reads two quick pinches as a double tap that resets the zoom', async () => {
    await render(<ZoomableImage uri="file:///map.jpg" />);
    const doubleTap = getByGestureTestId('zoomable-image-double-tap');
    const touchesDown = doubleTap.handlers.onTouchesDown as unknown as (
      event: { numberOfTouches: number },
      manager: { fail: () => void },
    ) => void;
    const fail = jest.fn();
    touchesDown({ numberOfTouches: 1 }, { fail });
    expect(fail).not.toHaveBeenCalled();
    touchesDown({ numberOfTouches: 2 }, { fail });
    expect(fail).toHaveBeenCalledTimes(1);
    expect((doubleTap.config as { maxDist?: number }).maxDist).toBe(10);
  });
});
