import React from 'react';
import { ScrollView, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ScreenHeader, useScrolled } from './ScreenHeader';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

function Screen() {
  const scroll = useScrolled();
  return (
    <>
      <ScreenHeader scrolled={scroll.scrolled} testID="h">
        <Text>Back</Text>
      </ScreenHeader>
      <ScrollView onScroll={scroll.onScroll} testID="list">
        <Text>Row</Text>
      </ScrollView>
    </>
  );
}

async function scrollTo(y: number) {
  await fireEvent.scroll(screen.getByTestId('list'), {
    nativeEvent: { contentOffset: { x: 0, y } },
  });
  await act(() => {
    jest.advanceTimersByTime(500);
  });
}

function expectStroke(opacity: number) {
  expect(screen.getByTestId('h-stroke')).toHaveAnimatedStyle({ opacity });
}

describe('ScreenHeader', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPreferenceStore();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('has no stroke at rest', async () => {
    await render(<Screen />);
    expectStroke(0);
  });

  it('fades the stroke in once the content scrolls under it, and out at the top', async () => {
    await render(<Screen />);

    await scrollTo(40);
    expectStroke(1);

    await scrollTo(0);
    expectStroke(0);
  });

  it('keeps the stroke out of touches', async () => {
    await render(<Screen />);
    expect(screen.getByTestId('h-stroke').props.pointerEvents).toBe('none');
  });
});
