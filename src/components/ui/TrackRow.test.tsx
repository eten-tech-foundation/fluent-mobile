import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { TrackRow } from './TrackRow';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

jest.mock('../../hooks/useHaptics', () => ({
  useHaptics: () => ({ press: jest.fn() }),
}));

const hidden = { includeHiddenElements: true };

describe('TrackRow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockPreferenceStore();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("marks a track you haven't heard and opens it from the row", async () => {
    const onPress = jest.fn();
    await render(
      <TrackRow
        title="Hear & Heart"
        meta="Mark 14:22–25"
        listened={0}
        onPress={onPress}
        testID="t"
      />,
    );

    expect(screen.getByTestId('t-unheard', hidden)).toBeTruthy();
    expect(screen.queryByTestId('t-toggle')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Hear & Heart, not heard yet'));
    expect(onPress).toHaveBeenCalled();
  });

  it('gives only the live row a button, which pauses in place', async () => {
    const onToggle = jest.fn();
    const onPress = jest.fn();
    await render(
      <TrackRow
        title="Hear & Heart"
        meta="Mark 14:22–25"
        listened={0.4}
        state="playing"
        onPress={onPress}
        onToggle={onToggle}
        testID="t"
      />,
    );

    await fireEvent.press(screen.getByLabelText('Pause Hear & Heart'));
    expect(onToggle).toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('keeps the button while it sinks back, then removes it', async () => {
    const { rerender } = await render(
      <TrackRow
        title="Hear & Heart"
        meta="Mark 14:22–25"
        listened={1}
        state="paused"
        testID="t"
      />,
    );
    expect(screen.getByLabelText('Play Hear & Heart')).toBeTruthy();

    await rerender(
      <TrackRow
        title="Hear & Heart"
        meta="Mark 14:22–25"
        listened={1}
        testID="t"
      />,
    );
    expect(screen.getByLabelText('Play Hear & Heart')).toBeTruthy();

    await act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByLabelText('Play Hear & Heart')).toBeNull();
    expect(screen.getByLabelText('Hear & Heart, heard')).toBeTruthy();
  });
});
