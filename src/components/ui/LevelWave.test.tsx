import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { LevelWave, levelWaveOffset } from './LevelWave';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

// Bars and ticks are hidden from TalkBack, so query past that.
const hidden = { includeHiddenElements: true };

function heightOf(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID, hidden).props.style)
    .height;
}

describe('LevelWave short', () => {
  beforeEach(() => {
    mockPreferenceStore();
  });

  it('rests as 16 dots with no input', () => {
    render(
      <LevelWave
        variant="short"
        levels={[]}
        accessibilityLabel="Not recording"
        testID="s"
      />,
    );

    expect(heightOf('s-dot-0')).toBe(4);
    expect(heightOf('s-dot-15')).toBe(4);
    expect(screen.queryByTestId('s-dot-16', hidden)).toBeNull();
  });

  it('lifts the newest samples on the right and keeps the last 16', () => {
    const levels = [...Array(20).fill(0), 0.5, 1];
    render(
      <LevelWave
        variant="short"
        levels={levels}
        accessibilityLabel="Recording"
        testID="s"
      />,
    );

    expect(heightOf('s-dot-15')).toBe(16);
    expect(heightOf('s-dot-14')).toBe(8);
    expect(heightOf('s-dot-13')).toBe(4);
  });

  it('is read as one element with its status', () => {
    render(
      <LevelWave
        variant="short"
        levels={[0.4]}
        accessibilityLabel="Recording"
      />,
    );

    expect(screen.getByLabelText('Recording').props.accessible).toBe(true);
  });
});

describe('LevelWave long', () => {
  beforeEach(() => {
    mockPreferenceStore();
  });

  function layout(width: number) {
    fireEvent(screen.getByTestId('l'), 'layout', {
      nativeEvent: { layout: { width, height: 80 } },
    });
  }

  it('draws one bar per level, silence as the shortest bar', () => {
    render(
      <LevelWave
        variant="long"
        levels={[0, 1, 0.5]}
        accessibilityLabel="Take 1"
        testID="l"
      />,
    );

    expect(heightOf('l-bar-0')).toBe(6);
    expect(heightOf('l-bar-1')).toBe(66);
    expect(heightOf('l-bar-2')).toBe(36);
  });

  it('shows the playhead only while recording a take', () => {
    const { rerender } = render(
      <LevelWave
        variant="long"
        levels={[0.3]}
        recording
        accessibilityLabel="Take 1"
        testID="l"
      />,
    );
    expect(screen.getByTestId('l-playhead')).toBeTruthy();

    rerender(
      <LevelWave
        variant="long"
        levels={[0.3]}
        accessibilityLabel="Take 1"
        testID="l"
      />,
    );
    expect(screen.queryByTestId('l-playhead')).toBeNull();
  });

  it('skips bars that have scrolled well off the left edge', () => {
    render(
      <LevelWave
        variant="long"
        levels={Array(400).fill(0.5)}
        recording
        accessibilityLabel="Take 1"
        testID="l"
      />,
    );
    layout(300);

    expect(screen.queryByTestId('l-bar-0', hidden)).toBeNull();
    expect(screen.getByTestId('l-bar-399', hidden)).toBeTruthy();
  });

  it('keeps rest ticks on the bar grid once it scrolls', () => {
    render(
      <LevelWave
        variant="long"
        levels={Array(400).fill(0.5)}
        recording
        accessibilityLabel="Take 1"
        testID="l"
      />,
    );
    layout(328);

    const leftOf = (id: string) =>
      StyleSheet.flatten(screen.getByTestId(id, hidden).props.style).left;
    const pitch = leftOf('l-bar-399') - leftOf('l-bar-398');
    expect(screen.queryByTestId('l-tick-400', hidden)).toBeNull();
    expect(leftOf('l-tick-401')).toBe(leftOf('l-bar-399') + 2 * pitch);
  });
});

describe('levelWaveOffset', () => {
  it('holds still until the front reaches two thirds of the width', () => {
    expect(levelWaveOffset(200, 300)).toBe(0);
  });

  it('then scrolls so the front stays at the anchor', () => {
    expect(levelWaveOffset(500, 300)).toBe(300);
  });

  it('does not scroll before the frame is measured', () => {
    expect(levelWaveOffset(500, 0)).toBe(0);
  });
});
