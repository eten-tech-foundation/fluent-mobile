import 'react-native-gesture-handler/jestSetup';
import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ScrollView, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { makeMutable, getAnimatedStyle } from 'react-native-reanimated';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import type { ImagesMapsItem } from '../../../../types/resources/imagesMaps';
import { resolveTheme } from '../../../../theme/uiVersion';
import { PassageImages } from './PassageImages';
import { centerOffset, ResourcesCard } from './ResourcesCard';

/** The system's reduce-motion setting. */
let mockReduceMotion = false;
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => mockReduceMotion,
}));

/** The system's gesture bar; none unless a test sets one. */
let mockBottom = 0;
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: mockBottom, left: 0, right: 0 }),
}));

/** How tall it grows, and its docked header's height. */
const GROWN = 500;
const HEADER = 80;
/** Open, it floats this far above the bottom edge (no gesture bar here). */
const LIFT = resolveTheme('next').spacing.md;
/** Where it sits, against its place if it reached the bottom edge. */
const OPEN = -LIFT;
const DOCKED = GROWN - LIFT - HEADER;

let external: (open: boolean) => void = () => {};

const PREVIEWS: ImagesMapsItem[] = ['a', 'b', 'c'].map(id => ({
  id,
  title: `Image ${id}`,
  uri: `file:///${id}.jpg`,
}));

function Card({
  previews = [],
  previewsScope = 'p',
  maxHeight = GROWN,
}: {
  previews?: ImagesMapsItem[];
  previewsScope?: string;
  maxHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  external = setOpen;
  return (
    <ResourcesCard
      shown
      open={open}
      onOpenChange={setOpen}
      maxHeight={maxHeight}
      player={makeMutable(0)}
      onPeekHeight={() => {}}
      images={{ state: { status: 'loading' }, scope: 'a' }}
      previews={previews}
      previewsScope={previewsScope}
      onRetryImages={() => {}}
    />
  );
}

const settle = () => act(() => jest.advanceTimersByTime(1000));

/** How far the card is moved from its place: `OPEN` grown, `DOCKED` docked. */
function offset() {
  const { transform } = getAnimatedStyle(
    screen.getByTestId('passage-resources-peek'),
  ) as { transform: { translateY: number }[] };
  return Math.round(transform[0].translateY);
}

/** The card's own height. */
const cardHeight = () =>
  StyleSheet.flatten(screen.getByTestId('passage-resources-peek').props.style)
    .height;

function renderCard(maxHeight = GROWN) {
  jest.useFakeTimers();
  render(<Card maxHeight={maxHeight} />);
  fireEvent(screen.getByTestId('passage-resources-grab'), 'layout', {
    nativeEvent: { layout: { width: 360, height: HEADER } },
  });
  settle();
}

describe('ResourcesCard', () => {
  afterEach(() => {
    jest.useRealTimers();
    mockBottom = 0;
  });

  it('docks above a gesture bar, and floats above it when open', () => {
    mockBottom = 24;
    renderCard();
    // Docked, the header shows above the bar, as without one.
    expect(offset()).toBe(GROWN - (LIFT + 24) - (HEADER + 24));
    act(() => external(true));
    settle();
    expect(offset()).toBe(-(LIFT + 24));
    expect(cardHeight()).toBe(GROWN - (LIFT + 24));
  });

  it('floats less on a page too short to float, and never covers the header', () => {
    renderCard(HEADER + 10);
    expect(cardHeight()).toBe(HEADER);
    expect(offset()).toBe(0);
    act(() => external(true));
    settle();
    expect(offset()).toBe(-10);
  });

  it('docks with only its header showing', () => {
    renderCard();
    expect(offset()).toBe(DOCKED);
    // Short of the bottom by the gap, so it floats when open.
    expect(cardHeight()).toBe(GROWN - LIFT);
  });

  it('grows and docks when opened or closed from outside', () => {
    renderCard();
    act(() => external(true));
    settle();
    expect(offset()).toBe(OPEN);

    act(() => external(false));
    settle();
    expect(offset()).toBe(DOCKED);
  });

  it.each([
    [false, true],
    [true, false],
  ])(
    'scrolls a grown image to its middle (reduce motion %s, animated %s)',
    (reduce, animated) => {
      mockReduceMotion = reduce;
      renderCard();
      fireEvent.press(screen.getByRole('button', { name: 'Resources' }));
      settle();
      fireEvent(screen.getByTestId('passage-resources'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 600 } },
      });
      // Opening scrolls to the top; only the grow's scroll counts here.
      const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
      scrollTo.mockClear();
      const { onGrown } = screen.UNSAFE_getByType(PassageImages).props;
      act(() => onGrown(800, 1000));
      expect(scrollTo).toHaveBeenCalledWith({ y: 600, animated });
      scrollTo.mockRestore();
      mockReduceMotion = false;
    },
  );

  it('grows on a tap and docks from its chevron', () => {
    renderCard();
    fireEvent.press(screen.getByRole('button', { name: 'Resources' }));
    settle();
    expect(offset()).toBe(OPEN);

    fireEvent.press(screen.getByRole('button', { name: 'Collapse resources' }));
    settle();
    expect(offset()).toBe(DOCKED);
  });

  it('follows a flick up and a flick down', () => {
    renderCard();
    const drag = getByGestureTestId('passage-resources-drag');

    fireGestureHandler(drag, [
      { translationY: 0, velocityY: 0 },
      { translationY: -60, velocityY: -1200 },
    ]);
    settle();
    expect(offset()).toBe(OPEN);
    expect(
      screen.getByTestId('passage-resources-open').props.accessibilityState
        .expanded,
    ).toBe(true);

    fireGestureHandler(drag, [
      { translationY: 0, velocityY: 0 },
      { translationY: 60, velocityY: 1200 },
    ]);
    settle();
    expect(offset()).toBe(DOCKED);
  });

  it('springs back when a short, slow drag lets go', () => {
    renderCard();
    fireGestureHandler(getByGestureTestId('passage-resources-drag'), [
      { translationY: 0, velocityY: 0 },
      { translationY: -40, velocityY: -50 },
    ]);
    settle();
    expect(offset()).toBe(DOCKED);
  });

  it('drops a preview whose thumbnail fails to load', () => {
    render(<Card previews={PREVIEWS} />);
    expect(screen.UNSAFE_getAllByType(Image)).toHaveLength(3);
    act(() => {
      screen.UNSAFE_getAllByType(Image)[1].props.onError();
    });
    expect(screen.UNSAFE_getAllByType(Image)).toHaveLength(2);
  });

  it('fills in with the next preview that loads, up to three', () => {
    const four = [
      ...PREVIEWS,
      { id: 'd', title: 'Image d', uri: 'file:///d.jpg' },
    ];
    render(<Card previews={four} />);
    const uris = () =>
      screen
        .UNSAFE_getAllByType(Image)
        .map(image => (image.props.source as { uri: string }).uri);
    expect(uris()).toEqual(['file:///a.jpg', 'file:///b.jpg', 'file:///c.jpg']);
    act(() => {
      screen.UNSAFE_getAllByType(Image)[0].props.onError();
    });
    expect(uris()).toEqual(['file:///b.jpg', 'file:///c.jpg', 'file:///d.jpg']);
  });

  it('gives a failed preview another try when the previews load again', () => {
    const view = render(<Card previews={PREVIEWS} previewsScope="first" />);
    act(() => {
      screen.UNSAFE_getAllByType(Image)[1].props.onError();
    });
    expect(screen.UNSAFE_getAllByType(Image)).toHaveLength(2);

    // The same images, loaded again (a retry, back online, the full list).
    view.rerender(<Card previews={PREVIEWS} previewsScope="all" />);
    expect(screen.UNSAFE_getAllByType(Image)).toHaveLength(3);
  });
});

describe('centerOffset', () => {
  // A 600-tall view with a 16 margin.
  it('puts a span in the middle of the view', () => {
    expect(centerOffset(800, 1000, 600, 16)).toBe(600);
  });

  it('starts a span taller than the view at its top, past the margin', () => {
    expect(centerOffset(800, 1400, 600, 16)).toBe(784);
  });

  it('counts the margin at both edges', () => {
    // 580 tall: fits a 600 view, but not with 16 kept clear at each edge.
    expect(centerOffset(800, 1380, 600, 16)).toBe(784);
  });

  it('never scrolls above the top of the list', () => {
    expect(centerOffset(20, 120, 600, 16)).toBe(0);
  });

  it('waits for the view to have a size', () => {
    expect(centerOffset(800, 1000, 0, 16)).toBeNull();
  });
});
