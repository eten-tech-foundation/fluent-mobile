import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as ExpoAudio from 'expo-audio';
import { AppState } from 'react-native';
import {
  AudioRecorder,
  __setPermission,
  resetAudioMock,
} from '../test/mocks/expo-audio';
import { useRecordingEngine } from './useRecordingEngine';
import { isMicActive, setMicActive } from '../audio/micActivity';

describe('useRecordingEngine', () => {
  let recorder: AudioRecorder;
  let setAudioModeSpy: jest.SpiedFunction<typeof ExpoAudio.setAudioModeAsync>;
  let stopSpy: jest.SpiedFunction<AudioRecorder['stop']>;

  beforeEach(() => {
    setMicActive('recording-engine', false);
    resetAudioMock();
    recorder = new AudioRecorder();
    stopSpy = jest.spyOn(recorder, 'stop');
    jest
      .spyOn(ExpoAudio, 'useAudioRecorder')
      .mockReturnValue(
        recorder as unknown as ReturnType<typeof ExpoAudio.useAudioRecorder>,
      );
    setAudioModeSpy = jest
      .spyOn(ExpoAudio, 'setAudioModeAsync')
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts idle and runs start → pause → resume → stop', async () => {
    const { result } = renderHook(() => useRecordingEngine());

    expect(result.current.status).toBe('idle');

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('recording');

    await act(async () => {
      await result.current.pause();
    });
    expect(result.current.status).toBe('paused');

    await act(async () => {
      await result.current.resume();
    });
    expect(result.current.status).toBe('recording');

    let stopResult: { uri: string; durationMs: number } | undefined;
    await act(async () => {
      stopResult = await result.current.stop();
    });
    expect(result.current.status).toBe('idle');
    expect(stopResult).toEqual({
      uri: 'file:///mock-recording.aac',
      durationMs: 0,
    });
  });

  it('uses document-backed ADTS AAC capture for kill-safe paused takes', () => {
    renderHook(() => useRecordingEngine());

    expect(ExpoAudio.useAudioRecorder).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: 'document',
        extension: '.aac',
        android: expect.objectContaining({
          extension: '.aac',
          outputFormat: 'aac_adts',
          audioEncoder: 'aac',
        }),
      }),
    );
  });

  it('marks the mic active for the whole take, including pause', async () => {
    const { result } = renderHook(() => useRecordingEngine());
    expect(isMicActive()).toBe(false);

    await act(async () => {
      await result.current.start();
    });
    expect(isMicActive()).toBe(true);

    await act(async () => {
      await result.current.pause();
    });
    expect(isMicActive()).toBe(true);

    await act(async () => {
      await result.current.resume();
      await result.current.stop();
    });
    expect(isMicActive()).toBe(false);
  });

  it('throws when stop is called while idle', async () => {
    const { result } = renderHook(() => useRecordingEngine());

    await expect(
      act(async () => {
        await result.current.stop();
      }),
    ).rejects.toThrow(/idle/i);
  });

  it('prepares recording audio mode on first start', async () => {
    const { result } = renderHook(() => useRecordingEngine());

    await act(async () => {
      await result.current.start();
    });

    expect(setAudioModeSpy).toHaveBeenCalledWith({
      playsInSilentMode: true,
      allowsRecording: true,
    });
  });

  it('releases recording audio mode after stop', async () => {
    const { result } = renderHook(() => useRecordingEngine());

    await act(async () => {
      await result.current.start();
    });
    setAudioModeSpy.mockClear();

    await act(async () => {
      await result.current.stop();
    });

    expect(setAudioModeSpy).toHaveBeenCalledWith({
      playsInSilentMode: true,
      allowsRecording: false,
    });
  });

  it('exposes requestMicPermission without wrapping behavior', async () => {
    __setPermission({ granted: false, status: 'denied' });

    const { result } = renderHook(() => useRecordingEngine());

    await expect(result.current.requestMicPermission()).resolves.toBe('denied');
  });

  it('releases audio mode on unmount when idle', async () => {
    const { unmount } = renderHook(() => useRecordingEngine());

    setAudioModeSpy.mockClear();
    unmount();

    expect(setAudioModeSpy).toHaveBeenCalledWith({
      playsInSilentMode: true,
      allowsRecording: false,
    });
    expect(stopSpy).not.toHaveBeenCalled();
  });

  it('re-pauses a paused recorder when the app returns active', async () => {
    let appStateListener: ((state: string) => void) | undefined;
    const remove = jest.fn();
    const pauseSpy = jest.spyOn(recorder, 'pause');
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        appStateListener = listener as (state: string) => void;
        return { remove };
      });

    const { result, unmount } = renderHook(() => useRecordingEngine());

    await act(async () => {
      await result.current.start();
      await result.current.pause();
    });
    expect(result.current.status).toBe('paused');
    pauseSpy.mockClear();

    recorder.isRecording = true;
    act(() => {
      appStateListener?.('active');
    });

    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(recorder.isRecording).toBe(false);

    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('stops an active recording on unmount', async () => {
    const { result, unmount } = renderHook(() => useRecordingEngine());

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('recording');

    setAudioModeSpy.mockClear();
    stopSpy.mockClear();
    await act(async () => {
      unmount();
    });

    await waitFor(() => {
      expect(stopSpy).toHaveBeenCalled();
    });
    expect(setAudioModeSpy).toHaveBeenCalledWith({
      playsInSilentMode: true,
      allowsRecording: false,
    });
  });

  it('uses the latest host background-pause callback without resubscribing or duplicating native pause', async () => {
    let listener: ((state: string) => void) | undefined;
    const remove = jest.fn();
    const subscribe = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, callback) => {
        listener = callback as (state: string) => void;
        return { remove };
      });
    subscribe.mockClear();
    const nativePause = jest.spyOn(recorder, 'pause');
    const firstPause = jest.fn();
    const latestPause = jest.fn();
    const { result, rerender, unmount } = renderHook<
      ReturnType<typeof useRecordingEngine>,
      { onAutoPause: () => void }
    >(({ onAutoPause }) => useRecordingEngine({ onAutoPause }), {
      initialProps: { onAutoPause: firstPause },
    });
    await act(async () => {
      await result.current.start();
    });
    rerender({ onAutoPause: latestPause });
    act(() => {
      listener?.('background');
    });

    expect(latestPause).toHaveBeenCalledTimes(1);
    expect(firstPause).not.toHaveBeenCalled();
    expect(nativePause).not.toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledTimes(1);
    await act(async () => {
      unmount();
    });
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('stops a paused take on unmount and clears mic ownership and recording mode', async () => {
    const { result, unmount } = renderHook(() => useRecordingEngine());
    await act(async () => {
      await result.current.start();
      await result.current.pause();
    });
    expect(isMicActive()).toBe(true);
    stopSpy.mockClear();
    setAudioModeSpy.mockClear();

    await act(async () => {
      unmount();
    });

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(isMicActive()).toBe(false);
    expect(setAudioModeSpy).toHaveBeenCalledTimes(1);
    expect(setAudioModeSpy).toHaveBeenCalledWith({
      playsInSilentMode: true,
      allowsRecording: false,
    });
  });

  it('clears mic ownership and retries audio-mode release if unmount native stop rejects', async () => {
    const { result, unmount } = renderHook(() => useRecordingEngine());
    await act(async () => {
      await result.current.start();
    });
    stopSpy.mockRejectedValueOnce(new Error('native stop failed'));
    setAudioModeSpy.mockClear();

    await act(async () => {
      unmount();
    });

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(isMicActive()).toBe(false);
    expect(setAudioModeSpy).toHaveBeenCalledTimes(2);
    expect(setAudioModeSpy.mock.calls).toEqual([
      [{ playsInSilentMode: true, allowsRecording: false }],
      [{ playsInSilentMode: true, allowsRecording: false }],
    ]);
  });
});
