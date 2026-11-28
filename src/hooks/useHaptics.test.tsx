import { Platform } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { useHaptics } from './useHaptics';
import { setMicActive } from '../audio/micActivity';

jest.mock('expo-haptics', () => ({
  AndroidHaptics: {
    Virtual_Key: 'virtual-key',
    Toggle_On: 'toggle-on',
    Toggle_Off: 'toggle-off',
    Drag_Start: 'drag-start',
    Gesture_End: 'gesture-end',
    Long_Press: 'long-press',
  },
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
}));

const perform = jest.mocked(Haptics.performAndroidHapticsAsync);

describe('useHaptics', () => {
  afterEach(() => jest.restoreAllMocks());

  beforeEach(() => {
    jest.clearAllMocks();
    setMicActive('test', false);
    setMicActive('other', false);
    setMicActive('recording-engine', false);
    perform.mockImplementation(() => Promise.resolve());
  });

  it('fires the virtual key haptic on press', async () => {
    const { result } = await renderHook(() => useHaptics());
    result.current.press();
    expect(perform).toHaveBeenCalledWith('virtual-key');
  });

  it('maps toggle to the on and off haptics', async () => {
    const { result } = await renderHook(() => useHaptics());
    result.current.toggle(true);
    result.current.toggle(false);
    expect(perform.mock.calls.map(call => call[0])).toEqual([
      'toggle-on',
      'toggle-off',
    ]);
  });

  it('maps a drag pick-up and drop to the drag haptics', async () => {
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
    const { result } = await renderHook(() => useHaptics());
    result.current.dragStart();
    result.current.dragEnd();
    expect(perform.mock.calls.map(call => call[0])).toEqual([
      'drag-start',
      'gesture-end',
    ]);
  });

  it('falls back to haptics older Android has for a drag', async () => {
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(29);
    const { result } = await renderHook(() => useHaptics());
    result.current.dragStart();
    result.current.dragEnd();
    expect(perform.mock.calls.map(call => call[0])).toEqual([
      'long-press',
      'virtual-key',
    ]);
  });

  it('stays silent until every mic owner has closed', async () => {
    setMicActive('test', true);
    setMicActive('other', true);
    setMicActive('test', false);
    const { result } = await renderHook(() => useHaptics());
    result.current.press();
    expect(perform).not.toHaveBeenCalled();

    setMicActive('other', false);
    result.current.press();
    expect(perform).toHaveBeenCalledWith('virtual-key');
  });

  it('stays silent while a take is recording or paused', async () => {
    setMicActive('recording-engine', true);
    const { result } = await renderHook(() => useHaptics());
    result.current.press();
    result.current.toggle(true);
    result.current.dragStart();
    result.current.dragEnd();
    expect(perform).not.toHaveBeenCalled();
  });

  it('swallows a rejected haptic call', async () => {
    perform.mockRejectedValueOnce(new Error('motor unavailable'));
    const { result } = await renderHook(() => useHaptics());
    expect(() => result.current.press()).not.toThrow();
    await act(async () => {
      await Promise.resolve();
    });
    expect(perform).toHaveBeenCalledWith('virtual-key');
  });
});
