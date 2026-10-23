import { act, renderHook } from '@testing-library/react-native';
import { useCommentRecordingAdapter } from './useCommentRecordingAdapter';
import { useRecordingEngine } from './useRecordingEngine';

jest.mock('./useRecordingEngine', () => ({
  useRecordingEngine: jest.fn(),
}));

const mockUseRecordingEngine = useRecordingEngine as jest.MockedFunction<
  typeof useRecordingEngine
>;

describe('useCommentRecordingAdapter', () => {
  const start = jest.fn(async () => undefined);
  const stop = jest.fn(async () => ({
    uri: 'file://comment-clip.aac',
    durationMs: 1200,
  }));
  const requestMicPermission = jest.fn(
    async (): Promise<'granted' | 'denied' | 'undetermined'> => 'granted',
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRecordingEngine.mockReturnValue({
      status: 'idle',
      start,
      pause: jest.fn(async () => null),
      resume: jest.fn(async () => undefined),
      stop,
      requestMicPermission,
    });
  });

  it('starts recording after mic grant and clears prior uri', async () => {
    const { result, rerender } = renderHook(() =>
      useCommentRecordingAdapter(),
    );

    await act(async () => {
      result.current.onRecordStart();
    });

    expect(requestMicPermission).toHaveBeenCalled();
    expect(start).toHaveBeenCalled();

    mockUseRecordingEngine.mockReturnValue({
      status: 'recording',
      start,
      pause: jest.fn(async () => null),
      resume: jest.fn(async () => undefined),
      stop,
      requestMicPermission,
    });
    rerender({});
    expect(result.current.isRecording).toBe(true);
  });

  it('stops into recordedAudioUri for the composer', async () => {
    mockUseRecordingEngine.mockReturnValue({
      status: 'recording',
      start,
      pause: jest.fn(async () => null),
      resume: jest.fn(async () => undefined),
      stop,
      requestMicPermission,
    });
    const { result } = renderHook(() => useCommentRecordingAdapter());

    await act(async () => {
      result.current.onRecordStop();
    });

    expect(stop).toHaveBeenCalled();
    expect(result.current.recordedAudioUri).toBe('file://comment-clip.aac');
  });

  it('does not start when mic is denied and surfaces micPermission', async () => {
    requestMicPermission.mockResolvedValueOnce('denied');
    const { result } = renderHook(() => useCommentRecordingAdapter());

    await act(async () => {
      result.current.onRecordStart();
    });

    expect(start).not.toHaveBeenCalled();
    expect(result.current.recordedAudioUri).toBeNull();
    expect(result.current.micPermission).toBe('denied');
  });
});
