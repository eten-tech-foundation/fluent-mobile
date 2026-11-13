import { act, renderHook } from '@testing-library/react-native';
import {
  LEVEL_ENVELOPE_BARS,
  LIVE_LEVEL_BARS,
  emptyLevelEnvelope,
  levelFromDb,
  levelsFromEnvelope,
  pushLevel,
  useLiveLevels,
  type LevelEnvelope,
} from './useLiveLevels';

type Props = { capturing: boolean; sampling: boolean };

describe('levelFromDb', () => {
  it('maps room tone to the floor and full scale to the top', () => {
    expect(levelFromDb(null)).toBe(0);
    expect(levelFromDb(-80)).toBe(0);
    expect(levelFromDb(-32)).toBe(0);
    expect(levelFromDb(0)).toBe(1);
    // Halfway up the dB range stays short; voice near full scale fills the bar.
    expect(levelFromDb(-16)).toBeCloseTo(0.25);
  });
});

describe('useLiveLevels', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('samples every 100ms while recording and keeps levels through a pause', () => {
    const getMetering = jest.fn(() => 0);
    const { result, rerender } = renderHook(
      ({ capturing, sampling }: Props) =>
        useLiveLevels(getMetering, capturing, sampling),
      { initialProps: { capturing: true, sampling: true } },
    );

    act(() => jest.advanceTimersByTime(300));
    expect(result.current.live).toEqual([1, 1, 1]);

    rerender({ capturing: true, sampling: false });
    act(() => jest.advanceTimersByTime(300));
    expect(result.current.live).toHaveLength(3);
  });

  it('starts a new take with fresh levels', () => {
    const getMetering = jest.fn(() => 0);
    const { result, rerender } = renderHook(
      ({ capturing, sampling }: Props) =>
        useLiveLevels(getMetering, capturing, sampling),
      { initialProps: { capturing: true, sampling: true } },
    );
    act(() => jest.advanceTimersByTime(200));
    rerender({ capturing: false, sampling: false });
    expect(result.current.live).toHaveLength(2);

    rerender({ capturing: true, sampling: true });
    expect(result.current.live).toEqual([]);
  });

  it('stops the sampler when the hook unmounts', () => {
    const getMetering = jest.fn(() => 0);
    const { unmount } = renderHook(() =>
      useLiveLevels(getMetering, true, true),
    );
    act(() => jest.advanceTimersByTime(100));
    const calls = getMetering.mock.calls.length;
    unmount();
    act(() => jest.advanceTimersByTime(500));
    expect(getMetering).toHaveBeenCalledTimes(calls);
  });

  it('keeps sampling on the same take after a pause', () => {
    const getMetering = jest.fn(() => 0);
    const { result, rerender } = renderHook(
      ({ sampling }: { sampling: boolean }) =>
        useLiveLevels(getMetering, true, sampling),
      { initialProps: { sampling: true } },
    );
    act(() => jest.advanceTimersByTime(200));
    rerender({ sampling: false });
    act(() => jest.advanceTimersByTime(500));
    rerender({ sampling: true });
    act(() => jest.advanceTimersByTime(100));
    expect(result.current.live).toEqual([1, 1, 1]);
  });

  it('keeps one new live bar per sample after the window is full (#904)', () => {
    let sample = 0;
    const getMetering = jest.fn(() => (sample++ === LIVE_LEVEL_BARS ? 0 : -32));
    const { result } = renderHook(() => useLiveLevels(getMetering, true, true));
    act(() => jest.advanceTimersByTime((LIVE_LEVEL_BARS + 5) * 100));
    expect(result.current.live).toHaveLength(LIVE_LEVEL_BARS);
    expect(result.current.live.at(-5)).toBe(1);
    expect(result.current.envelope.length).toBeLessThanOrEqual(
      LEVEL_ENVELOPE_BARS + 1,
    );
  });
});

describe('pushLevel', () => {
  function simulate(samples: number, at: (i: number) => number) {
    let env = emptyLevelEnvelope();
    let copies = 0;
    for (let i = 0; i < samples; i++) {
      copies += levelsFromEnvelope(env).length;
      env = pushLevel(env, at(i));
    }
    return { env, copies };
  }

  function coveredSamples(env: LevelEnvelope): number {
    return env.bars.length * env.stride + env.filled;
  }

  it.each([
    [10, 6_000, 18_003_000],
    [30, 18_000, 162_009_000],
  ])(
    'bounds a %i-minute capture and keeps equal bar strides (#904)',
    (_minutes, samples, fullHistoryCopies) => {
      const peakAt = Math.floor(samples / 2);
      const { env, copies } = simulate(samples, i => (i === peakAt ? 1 : 0));
      const bars = levelsFromEnvelope(env);
      const peak = bars.indexOf(1);
      expect(bars.length).toBeLessThanOrEqual(LEVEL_ENVELOPE_BARS + 1);
      expect(coveredSamples(env)).toBe(samples);
      expect(peak / bars.length).toBeCloseTo(0.5, 1);
      expect(copies).toBeLessThanOrEqual(samples * (LEVEL_ENVELOPE_BARS + 1));
      expect(copies).toBeLessThan(fullHistoryCopies);
    },
  );

  it('keeps the peak of the bar that is open when the stride doubles (#904)', () => {
    const { env } = simulate(6_000, i => (i === 240 || i === 3850 ? 1 : 0));
    const bars = levelsFromEnvelope(env);
    expect(bars.filter(level => level === 1).length).toBeGreaterThanOrEqual(2);
  });
});
