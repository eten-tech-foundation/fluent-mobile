import 'react-native-gesture-handler/jestSetup';
import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { makeMutable, getAnimatedStyle } from 'react-native-reanimated';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';
import type { ImagesMapsItem } from '../../../../types/resources/imagesMaps';
import { ResourcesCard } from './ResourcesCard';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/** How tall it grows, and its docked header's height. */
const GROWN = 500;
const HEADER = 80;

let external: (open: boolean) => void = () => {};

const PREVIEWS: ImagesMapsItem[] = ['a', 'b', 'c'].map(id => ({
  id,
  title: `Image ${id}`,
  uri: `file:///${id}.jpg`,
}));

function Card({ previews = [] }: { previews?: ImagesMapsItem[] }) {
  const [open, setOpen] = useState(false);
  external = setOpen;
  return (
    <ResourcesCard
      shown
      open={open}
      onOpenChange={setOpen}
      maxHeight={GROWN}
      player={makeMutable(0)}
      onPeekHeight={() => {}}
      images={{ state: { status: 'loading' }, scope: 'a' }}
      previews={previews}
      onRetryImages={() => {}}
    />
  );
}

const settle = () => act(() => jest.advanceTimersByTime(1000));

/** How far below fully grown the card sits: 0 grown, `GROWN - HEADER` docked. */
function offset() {
  const { transform } = getAnimatedStyle(
    screen.getByTestId('passage-resources-peek'),
  ) as { transform: { translateY: number }[] };
  return Math.round(transform[0].translateY);
}

function renderCard() {
  jest.useFakeTimers();
  render(<Card />);
  fireEvent(screen.getByTestId('passage-resources-grab'), 'layout', {
    nativeEvent: { layout: { width: 360, height: HEADER } },
  });
  settle();
}

describe('ResourcesCard', () => {
  afterEach(() => jest.useRealTimers());

  it('docks with only its header showing', () => {
    renderCard();
    expect(offset()).toBe(GROWN - HEADER);
  });

  it('grows and docks when opened or closed from outside', () => {
    renderCard();
    act(() => external(true));
    settle();
    expect(offset()).toBe(0);

    act(() => external(false));
    settle();
    expect(offset()).toBe(GROWN - HEADER);
  });

  it('grows on a tap and docks from its chevron', () => {
    renderCard();
    fireEvent.press(screen.getByRole('button', { name: 'Resources' }));
    settle();
    expect(offset()).toBe(0);

    fireEvent.press(screen.getByRole('button', { name: 'Collapse resources' }));
    settle();
    expect(offset()).toBe(GROWN - HEADER);
  });

  it('follows a flick up and a flick down', () => {
    renderCard();
    const drag = getByGestureTestId('passage-resources-drag');

    fireGestureHandler(drag, [
      { translationY: 0, velocityY: 0 },
      { translationY: -60, velocityY: -1200 },
    ]);
    settle();
    expect(offset()).toBe(0);
    expect(
      screen.getByTestId('passage-resources-open').props.accessibilityState
        .expanded,
    ).toBe(true);

    fireGestureHandler(drag, [
      { translationY: 0, velocityY: 0 },
      { translationY: 60, velocityY: 1200 },
    ]);
    settle();
    expect(offset()).toBe(GROWN - HEADER);
  });

  it('springs back when a short, slow drag lets go', () => {
    renderCard();
    fireGestureHandler(getByGestureTestId('passage-resources-drag'), [
      { translationY: 0, velocityY: 0 },
      { translationY: -40, velocityY: -50 },
    ]);
    settle();
    expect(offset()).toBe(GROWN - HEADER);
  });

  it('drops a preview whose thumbnail fails to load', () => {
    render(<Card previews={PREVIEWS} />);
    expect(screen.UNSAFE_getAllByType(Image)).toHaveLength(3);
    act(() => {
      screen.UNSAFE_getAllByType(Image)[1].props.onError();
    });
    expect(screen.UNSAFE_getAllByType(Image)).toHaveLength(2);
  });
});
