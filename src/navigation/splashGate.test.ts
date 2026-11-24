import BootSplash from 'react-native-bootsplash';
import {
  __resetSplashGateForTests,
  afterFirstPaint,
  armSplashGate,
  hideSplash,
  holdSplashForFirstPaint,
  isLaunchOverlayVisible,
  LAUNCH_OVERLAY_CAP_MS,
  SPLASH_FALLBACK_MS,
  subscribeLaunchOverlay,
} from './splashGate';
import {
  getStartupMarks,
  resetStartupTraceForTests,
} from '../utils/startupTrace';

jest.mock('react-native-bootsplash', () => ({
  hide: jest.fn().mockResolvedValue(undefined),
}));

const mockLogError = jest.fn();
const mockLogWarn = jest.fn();
jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: (...args: unknown[]) => mockLogWarn(...args),
      error: (...args: unknown[]) => mockLogError(...args),
    }),
  },
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

  it('logs a native hide failure instead of leaving it unhandled', async () => {
    mockHide.mockRejectedValueOnce(new Error('no splash'));
    hideSplash('auth');
    await Promise.resolve();
    await Promise.resolve();

    expect(getStartupMarks().some(m => m.name === 'splash_hidden')).toBe(false);
    expect(mockLogError).toHaveBeenCalledWith('BootSplash hide failed', {
      error: 'Error: no splash',
    });
  });

  it('notifies overlay subscribers on a real paint and when a new activity arms the gate', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeLaunchOverlay(listener);

    hideSplash('fallback');
    expect(listener).not.toHaveBeenCalled();
    expect(isLaunchOverlayVisible()).toBe(true);

    hideSplash('home:content');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(isLaunchOverlayVisible()).toBe(false);

    armSplashGate();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(isLaunchOverlayVisible()).toBe(true);

    unsubscribe();
    hideSplash('auth');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps the launch overlay up on the native fallback, and clears it on a real paint', () => {
    expect(isLaunchOverlayVisible()).toBe(true);

    holdSplashForFirstPaint();
    jest.advanceTimersByTime(SPLASH_FALLBACK_MS);

    expect(mockHide).toHaveBeenCalledTimes(1);
    expect(isLaunchOverlayVisible()).toBe(true);

    hideSplash('home:content');
    expect(isLaunchOverlayVisible()).toBe(false);
    expect(mockHide).toHaveBeenCalledTimes(1);
  });

  it('does not clear the launch overlay when Home blurs under a pushed screen', () => {
    hideSplash('home:blurred');

    expect(mockHide).toHaveBeenCalledTimes(1);
    expect(isLaunchOverlayVisible()).toBe(true);

    hideSplash('home:content');
    expect(isLaunchOverlayVisible()).toBe(false);
  });

  it('clears the launch overlay on the hard cap when no screen reports a paint', () => {
    jest.advanceTimersByTime(LAUNCH_OVERLAY_CAP_MS - 1);
    expect(isLaunchOverlayVisible()).toBe(true);

    jest.advanceTimersByTime(1);

    expect(isLaunchOverlayVisible()).toBe(false);
    expect(mockHide).not.toHaveBeenCalled();
    expect(mockLogWarn).toHaveBeenCalledWith(
      'No screen reported a paint; clearing the launch overlay on the cap',
    );
  });

  it('hides the splash a new activity shows once the app root mounts again', () => {
    hideSplash('home:content');
    holdSplashForFirstPaint();
    expect(mockHide).toHaveBeenCalledTimes(1);

    // Same JS runtime, new activity (the upload service kept the process).
    armSplashGate();
    holdSplashForFirstPaint();
    hideSplash('sync');

    expect(mockHide).toHaveBeenCalledTimes(2);
  });

  it("drops the last activity's fallback when re-armed, so it can't cut the new wait short", () => {
    holdSplashForFirstPaint();
    jest.advanceTimersByTime(SPLASH_FALLBACK_MS - 1);

    armSplashGate();
    jest.advanceTimersByTime(1);

    expect(mockHide).not.toHaveBeenCalled();
  });

  describe('afterFirstPaint', () => {
    it('waits for a real paint before running deferred work', () => {
      const work = jest.fn();
      afterFirstPaint(work);
      expect(work).not.toHaveBeenCalled();

      hideSplash('fallback');
      expect(work).not.toHaveBeenCalled();

      hideSplash('home:content');
      expect(work).toHaveBeenCalledTimes(1);
    });

    it('runs immediately once a paint was already reported', () => {
      hideSplash('home:content');
      const work = jest.fn();

      afterFirstPaint(work);

      expect(work).toHaveBeenCalledTimes(1);
    });

    it('runs queued work on the hard cap when no paint is reported', () => {
      const work = jest.fn();
      afterFirstPaint(work);

      jest.advanceTimersByTime(LAUNCH_OVERLAY_CAP_MS);

      expect(work).toHaveBeenCalledTimes(1);
    });

    it('runs each queued callback once, in order', () => {
      const order: number[] = [];
      afterFirstPaint(() => order.push(1));
      afterFirstPaint(() => order.push(2));

      hideSplash('home:content');
      hideSplash('auth');

      expect(order).toEqual([1, 2]);
    });

    it('keeps a throwing callback from blocking the rest of the queue', () => {
      const later = jest.fn();
      afterFirstPaint(() => {
        throw new Error('boom');
      });
      afterFirstPaint(later);

      hideSplash('home:content');

      expect(later).toHaveBeenCalledTimes(1);
      expect(mockLogError).toHaveBeenCalledWith(
        'Deferred post-paint work failed',
        { error: 'Error: boom' },
      );
    });

    it('keeps queued work across a re-arm, for the next activity paint', () => {
      const work = jest.fn();
      afterFirstPaint(work);

      armSplashGate();
      expect(work).not.toHaveBeenCalled();

      hideSplash('home:content');
      expect(work).toHaveBeenCalledTimes(1);
    });

    it('drops queued work when the test reset runs', () => {
      const work = jest.fn();
      afterFirstPaint(work);

      __resetSplashGateForTests();
      hideSplash('home:content');

      expect(work).not.toHaveBeenCalled();
    });
  });
});
