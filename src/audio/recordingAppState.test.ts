import type { RecorderStatus } from './types';
import type { PauseResult } from './types';
import { handleRecordingAppStateChange } from './recordingAppState';

jest.mock('../utils/logger', () => ({
  logger: {
    create: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

function fakeEngine(
  status: RecorderStatus,
  pauseImpl?: () => Promise<PauseResult | null>,
) {
  return {
    getStatus: jest.fn(() => status),
    pause: jest.fn(
      pauseImpl ??
        (() =>
          Promise.resolve({
            uri: 'file:///take.aac',
            durationMs: 1000,
          })),
    ),
    syncPausedNativeState: jest.fn(),
  };
}

describe('handleRecordingAppStateChange', () => {
  it('pauses when backgrounded while recording', () => {
    const engine = fakeEngine('recording');
    handleRecordingAppStateChange(engine, 'background');
    expect(engine.pause).toHaveBeenCalledTimes(1);
  });

  it.each<RecorderStatus>(['idle', 'paused'])(
    'does not pause when backgrounded while %s',
    status => {
      const engine = fakeEngine(status);
      handleRecordingAppStateChange(engine, 'background');
      expect(engine.pause).not.toHaveBeenCalled();
    },
  );

  it('ignores inactive', () => {
    const engine = fakeEngine('recording');
    handleRecordingAppStateChange(engine, 'inactive');
    expect(engine.pause).not.toHaveBeenCalled();
  });

  it('re-syncs native paused state when returning to active', () => {
    const engine = fakeEngine('paused');
    handleRecordingAppStateChange(engine, 'active');
    expect(engine.syncPausedNativeState).toHaveBeenCalledTimes(1);
    expect(engine.pause).not.toHaveBeenCalled();
  });

  it('swallows a failed auto-pause instead of leaving an unhandled rejection', async () => {
    const engine = fakeEngine('recording', () =>
      Promise.reject(new Error('native pause failed')),
    );
    expect(() =>
      handleRecordingAppStateChange(engine, 'background'),
    ).not.toThrow();
    await Promise.resolve();
  });
});
