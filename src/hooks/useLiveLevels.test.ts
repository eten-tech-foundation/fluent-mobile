import { act, renderHook } from '@testing-library/react-native';
import { levelFromDb, useLiveLevels } from './useLiveLevels';

type Props = { capturing: boolean; sampling: boolean };

describe('levelFromDb', () => {
  it('maps room tone to the floor and full scale to the top', () => {
    expect(levelFromDb(null)).toBe(0);
    expect(levelFromDb(-80)).toBe(0);
    expect(levelFromDb(0)).toBe(1);
    expect(levelFromDb(-27.5)).toBeCloseTo(0.5);
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
    expect(result.current).toEqual([1, 1, 1]);

    rerender({ capturing: true, sampling: false });
    act(() => jest.advanceTimersByTime(300));
    expect(result.current).toHaveLength(3);
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
    expect(result.current).toHaveLength(2);

    rerender({ capturing: true, sampling: true });
    expect(result.current).toEqual([]);
  });
});
