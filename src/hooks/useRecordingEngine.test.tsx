import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as ExpoAudio from 'expo-audio';
import {
  AudioRecorder,
  __setPermission,
  resetAudioMock,
} from '../test/mocks/expo-audio';
import { useRecordingEngine } from './useRecordingEngine';

describe('useRecordingEngine', () => {
  let recorder: AudioRecorder;
  let setAudioModeSpy: jest.SpiedFunction<typeof ExpoAudio.setAudioModeAsync>;
  let stopSpy: jest.SpiedFunction<AudioRecorder['stop']>;

  beforeEach(() => {
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
      uri: 'file:///mock-recording.m4a',
      durationMs: 0,
    });
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
});
