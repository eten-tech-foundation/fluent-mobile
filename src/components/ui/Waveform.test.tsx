import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Waveform, waveformOffset } from './Waveform';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

const VERSES = [
  { verse: 22, bars: [10, 24, 52, 8] },
  { verse: 23, bars: [8, 18, 26, 22] },
];

// The strip is hidden from TalkBack, so query past that.
const hidden = { includeHiddenElements: true };

function colorOf(testID: string) {
  return StyleSheet.flatten(screen.getByTestId(testID, hidden).props.style)
    .backgroundColor;
}

describe('Waveform', () => {
  beforeEach(() => {
    mockPreferenceStore();
  });

  it('draws each bar at its amplitude and reports the percent', () => {
    render(
      <Waveform
        verses={VERSES}
        progress={0.5}
        accessibilityLabel="Mark 14:22–25"
        testID="w"
      />,
    );

    expect(
      StyleSheet.flatten(screen.getByTestId('w-bar-2', hidden).props.style)
        .height,
    ).toBe(52);
    expect(
      screen.getByRole('progressbar', { name: 'Mark 14:22–25' }).props
        .accessibilityValue,
    ).toEqual({ min: 0, max: 100, now: 50 });
  });

  it('colors bars before the playhead as played', () => {
    render(
      <Waveform
        verses={VERSES}
        progress={0.5}
        accessibilityLabel="Mark 14:22–25"
        testID="w"
      />,
    );

    const played = colorOf('w-bar-0');
    expect(colorOf('w-bar-3')).toBe(played);
    expect(colorOf('w-bar-4')).not.toBe(played);
    expect(colorOf('w-bar-7')).toBe(colorOf('w-bar-4'));
  });

  it('marks verse chips current once playback reaches them', () => {
    const { rerender } = render(
      <Waveform
        verses={VERSES}
        progress={0.25}
        accessibilityLabel="Mark 14:22–25"
        testID="w"
      />,
    );
    const reached = colorOf('w-verse-22');
    const ahead = colorOf('w-verse-23');
    expect(ahead).not.toBe(reached);

    rerender(
      <Waveform
        verses={VERSES}
        progress={0.5}
        accessibilityLabel="Mark 14:22–25"
        testID="w"
      />,
    );
    expect(colorOf('w-verse-23')).toBe(reached);
  });

  it('lands exactly on a verse start for ratios that do not divide evenly', () => {
    const verses = [
      { verse: 1, bars: Array(7).fill(10) },
      { verse: 2, bars: Array(7).fill(10) },
      { verse: 3, bars: Array(7).fill(10) },
    ];
    render(
      <Waveform
        verses={verses}
        progress={7 / 21}
        accessibilityLabel="Mark 14:22–25"
        testID="w"
      />,
    );

    expect(colorOf('w-bar-6')).toBe(colorOf('w-bar-0'));
    expect(colorOf('w-bar-7')).not.toBe(colorOf('w-bar-0'));
    expect(colorOf('w-verse-2')).toBe(colorOf('w-verse-1'));
  });

  it('clamps progress outside 0–1', () => {
    render(
      <Waveform
        verses={VERSES}
        progress={1.4}
        accessibilityLabel="Mark 14:22–25"
        testID="w"
      />,
    );

    expect(screen.getByRole('progressbar').props.accessibilityValue.now).toBe(
      100,
    );
    expect(colorOf('w-bar-7')).toBe(colorOf('w-bar-0'));
  });

  it('hides the bars and chips from TalkBack', () => {
    render(
      <Waveform
        verses={VERSES}
        progress={0}
        accessibilityLabel="Mark 14:22–25"
        testID="w"
      />,
    );

    expect(screen.queryByTestId('w-bar-0')).toBeNull();
    expect(screen.getByTestId('w-bar-0', hidden)).toBeTruthy();
  });
});

describe('Waveform windowing and chips', () => {
  beforeEach(() => {
    mockPreferenceStore();
  });

  it('only mounts bars for verses near the frame', () => {
    const long = Array.from({ length: 30 }, (_, i) => ({
      verse: i + 1,
      bars: Array(20).fill(10),
    }));
    render(
      <Waveform
        verses={long}
        progress={0}
        accessibilityLabel="Mark 14"
        testID="w"
      />,
    );

    expect(screen.getByTestId('w-bar-0', hidden)).toBeTruthy();
    expect(screen.queryByTestId('w-bar-580', hidden)).toBeNull();
  });

  it('keeps the bars at the new spot mounted after a big jump', () => {
    const long = Array.from({ length: 30 }, (_, i) => ({
      verse: i + 1,
      bars: Array(20).fill(10),
    }));
    const { rerender } = render(
      <Waveform
        verses={long}
        progress={0}
        accessibilityLabel="Mark 14"
        testID="w"
      />,
    );
    fireEvent(screen.getByTestId('w'), 'layout', {
      nativeEvent: { layout: { width: 360, height: 52 } },
    });
    rerender(
      <Waveform
        verses={long}
        progress={0.5}
        accessibilityLabel="Mark 14"
        testID="w"
      />,
    );

    expect(screen.getByTestId('w-bar-300', hidden)).toBeTruthy();
    expect(screen.queryByTestId('w-bar-0', hidden)).toBeNull();
  });

  it('widens the chip for three-digit verses', () => {
    render(
      <Waveform
        verses={[
          { verse: 99, bars: [10] },
          { verse: 176, bars: [10] },
        ]}
        progress={0}
        accessibilityLabel="Psalm 119"
        testID="w"
      />,
    );

    const width = (id: string) =>
      StyleSheet.flatten(screen.getByTestId(id, hidden).props.style).width;
    expect(width('w-verse-99')).toBe(24);
    expect(width('w-verse-176')).toBe(32);
  });
});

describe('waveformOffset', () => {
  it('holds still until the playhead reaches a third of the width', () => {
    expect(waveformOffset(100, 390)).toBe(0);
    expect(waveformOffset(130, 390)).toBe(0);
  });

  it('then scrolls so the playhead stays at the anchor', () => {
    expect(waveformOffset(330, 390)).toBe(200);
  });

  it('does not scroll before the frame is measured', () => {
    expect(waveformOffset(330, 0)).toBe(0);
  });
});
