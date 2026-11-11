import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useSharedValue } from 'react-native-reanimated';
import { mockPreferenceStore } from '../../../../test/mocks/preferenceStore';
import { BAR_MAX, BAR_MIN, TakeCard, type FrontTake } from './TakeCard';

jest.mock('../../../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

let mockReduceMotion = false;
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => mockReduceMotion,
}));

const hidden = { includeHiddenElements: true };
const SLOT = 300;
const WAVE_LEAD = 32;
const BAR_SLOT = 6;
const SLOT_BARS = Math.max(1, Math.floor((SLOT - WAVE_LEAD) / BAR_SLOT));

function levelHeight(level: number) {
  return BAR_MIN + level * (BAR_MAX - BAR_MIN);
}

function recordingTake(over: Partial<FrontTake> = {}): FrontTake {
  return {
    takeNumber: 1,
    durationMs: 1200,
    levels: [0.2, 0.8],
    progress: 1,
    recording: true,
    official: false,
    ...over,
  };
}

function Card({ take }: { take: FrontTake }) {
  const mode = useSharedValue(1);
  return (
    <TakeCard
      take={take}
      blockedReason={null}
      firstVerse={1}
      mode={mode}
      shown
    />
  );
}

function renderTake(take: FrontTake) {
  const result = render(<Card take={take} />);
  fireEvent(screen.getByTestId('passage-take-wave-slot'), 'layout', {
    nativeEvent: { layout: { width: SLOT, height: 52 } },
  });
  return result;
}

function barCount() {
  let n = 0;
  while (screen.queryByTestId(`passage-take-wave-bar-${n}`, hidden)) n += 1;
  return n;
}

function barHeight(i: number) {
  return StyleSheet.flatten(
    screen.getByTestId(`passage-take-wave-bar-${i}`, hidden).props.style,
  ).height;
}

describe('TakeCard live waveform', () => {
  beforeEach(() => {
    mockReduceMotion = false;
    mockPreferenceStore();
  });

  it('spreads a short recording across the measured card width, newest last', () => {
    renderTake(recordingTake());

    expect(barCount()).toBe(SLOT_BARS);
    expect(barHeight(0)).toBe(levelHeight(0.2));
    expect(barHeight(SLOT_BARS - 1)).toBe(levelHeight(0.8));
    expect(
      screen.getByLabelText('Take 1, recording, 0:01').props.accessibilityRole,
    ).toBe('progressbar');
  });

  it('keeps that wave on pause and continues it on resume', () => {
    const { rerender } = renderTake(recordingTake());
    expect(barCount()).toBe(SLOT_BARS);
    expect(barHeight(SLOT_BARS - 1)).toBe(levelHeight(0.8));

    rerender(
      <Card
        take={recordingTake({
          recording: false,
          paused: true,
          durationMs: 2400,
        })}
      />,
    );
    fireEvent(screen.getByTestId('passage-take-wave-slot'), 'layout', {
      nativeEvent: { layout: { width: SLOT, height: 52 } },
    });
    expect(barCount()).toBe(SLOT_BARS);
    expect(barHeight(SLOT_BARS - 1)).toBe(levelHeight(0.8));
    expect(screen.getByLabelText('Take 1, paused, 0:02')).toBeTruthy();

    rerender(
      <Card
        take={recordingTake({
          levels: [0.2, 0.8, 0.5],
          durationMs: 3600,
        })}
      />,
    );
    fireEvent(screen.getByTestId('passage-take-wave-slot'), 'layout', {
      nativeEvent: { layout: { width: SLOT, height: 52 } },
    });
    expect(barCount()).toBe(SLOT_BARS);
    expect(barHeight(SLOT_BARS - 1)).toBe(levelHeight(0.5));
  });

  it('shows the saved take across the same width after stop', () => {
    const { rerender } = renderTake(recordingTake());
    rerender(
      <Card
        take={recordingTake({
          recording: false,
          progress: 0,
        })}
      />,
    );
    fireEvent(screen.getByTestId('passage-take-wave-slot'), 'layout', {
      nativeEvent: { layout: { width: SLOT, height: 52 } },
    });

    expect(barCount()).toBe(SLOT_BARS);
    expect(barHeight(0)).toBe(levelHeight(0.2));
    expect(barHeight(SLOT_BARS - 1)).toBe(levelHeight(0.8));
    expect(screen.getByLabelText('Take 1 playback')).toBeTruthy();
  });

  it('starts a new wave for the next take', () => {
    const { rerender } = renderTake(recordingTake());
    rerender(
      <Card
        take={recordingTake({
          takeNumber: 2,
          levels: [0.1],
        })}
      />,
    );
    fireEvent(screen.getByTestId('passage-take-wave-slot'), 'layout', {
      nativeEvent: { layout: { width: SLOT, height: 52 } },
    });

    expect(barCount()).toBe(SLOT_BARS);
    expect(barHeight(0)).toBe(levelHeight(0.1));
    expect(barHeight(SLOT_BARS - 1)).toBe(levelHeight(0.1));
    expect(screen.getByLabelText('Take 2, recording, 0:01')).toBeTruthy();
  });

  it('still fills the width when motion is reduced', () => {
    mockReduceMotion = true;
    renderTake(recordingTake());

    expect(barCount()).toBe(SLOT_BARS);
  });
});
