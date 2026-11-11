import BootSplash from 'react-native-bootsplash';
import {
  __resetSplashGateForTests,
  hideSplash,
  holdSplashForFirstPaint,
  SPLASH_FALLBACK_MS,
} from './splashGate';
import {
  getStartupMarks,
  resetStartupTraceForTests,
} from '../utils/startupTrace';

jest.mock('react-native-bootsplash', () => ({
  hide: jest.fn().mockResolvedValue(undefined),
}));

const mockHide = BootSplash.hide as jest.Mock;

describe('splashGate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockHide.mockResolvedValue(undefined);
    __resetSplashGateForTests();
    resetStartupTraceForTests();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('hides the splash once, for the first screen that reports a paint', () => {
    hideSplash('home:content');
    hideSplash('auth');

    expect(mockHide).toHaveBeenCalledTimes(1);
    expect(mockHide).toHaveBeenCalledWith();
    const marks = getStartupMarks().filter(
      m => m.name === 'splash_hide_requested',
    );
    expect(marks).toHaveLength(1);
    expect(marks[0].context).toEqual({ reason: 'home:content' });
  });

  it('holds the splash for the first paint, then hides it when that comes', () => {
    holdSplashForFirstPaint();
    jest.advanceTimersByTime(SPLASH_FALLBACK_MS - 1);
    expect(mockHide).not.toHaveBeenCalled();

    hideSplash('home:empty');
    expect(mockHide).toHaveBeenCalledTimes(1);

    // The fallback no longer fires.
    jest.advanceTimersByTime(SPLASH_FALLBACK_MS);
    expect(mockHide).toHaveBeenCalledTimes(1);
  });

  it('hides the splash on the fallback when no screen reports a paint', () => {
    holdSplashForFirstPaint();
    holdSplashForFirstPaint();
    jest.advanceTimersByTime(SPLASH_FALLBACK_MS);

    expect(mockHide).toHaveBeenCalledTimes(1);
    expect(
      getStartupMarks().find(m => m.name === 'splash_hide_requested')?.context,
    ).toEqual({ reason: 'fallback' });
  });

  it('does not arm a fallback once the splash is down', () => {
    hideSplash('init-error');
    holdSplashForFirstPaint();
    jest.advanceTimersByTime(SPLASH_FALLBACK_MS);

    expect(mockHide).toHaveBeenCalledTimes(1);
  });

  it('records when the native splash is gone', async () => {
    hideSplash('auth');
    await Promise.resolve();

    expect(getStartupMarks().some(m => m.name === 'splash_hidden')).toBe(true);
  });

  it('survives a native hide failure', async () => {
    mockHide.mockRejectedValueOnce(new Error('no splash'));
    hideSplash('auth');
    await Promise.resolve();
    await Promise.resolve();

    expect(getStartupMarks().some(m => m.name === 'splash_hidden')).toBe(false);
  });
});
