import 'react-native-gesture-handler/jestSetup';
import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { clampScale, clampTranslate, ZoomableImage } from './ZoomableImage';

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
  it("hands onLoad the image's own size", () => {
    const onLoad = jest.fn();
    render(
      <ZoomableImage uri="file:///map.jpg" onLoad={onLoad} testID="zoom" />,
    );
    act(() => {
      screen.UNSAFE_getByType(Image).props.onLoad({
        cacheType: 'none',
        source: { url: 'file:///map.jpg', width: 800, height: 600 },
      });
    });
    expect(onLoad).toHaveBeenLastCalledWith({ width: 800, height: 600 });
  });
});
