import { Alert, type AlertButton } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import type { VerseAudioState } from './verseAudioReducer';
import { useVerseStep } from './useVerseStep';

const verses = [{ verseNumber: 1 }, { verseNumber: 2 }, { verseNumber: 3 }];

function setup(selectedVerse: number, audioState: VerseAudioState = 'idle') {
  const onChange = jest.fn();
  const resetCapture = jest.fn();
  const discardCapture = jest.fn(async () => {});
  const { result } = renderHook(() =>
    useVerseStep({
      verses,
      selectedVerse,
      onChange,
      audioState,
      discardCapture,
      resetCapture,
    }),
  );
  return { result, onChange, resetCapture, discardCapture };
}

describe('useVerseStep', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('finds the verses either side and stops at the ends', () => {
    expect(setup(2).result.current).toMatchObject({
      index: 1,
      previous: 1,
      next: 3,
    });
    expect(setup(1).result.current.previous).toBeNull();
    expect(setup(3).result.current.next).toBeNull();
    expect(setup(9).result.current).toMatchObject({
      index: -1,
      previous: null,
      next: null,
    });
  });

  it('moves straight away when nothing is being captured', () => {
    const { result, onChange, resetCapture } = setup(1, 'recorded');
    act(() => result.current.request(2));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(resetCapture).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("leaves the capture alone when it's already on that verse", () => {
    const { result, onChange, resetCapture } = setup(2, 'paused');
    act(() => result.current.request(2));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(resetCapture).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('asks first mid-take, and only moves after Discard', async () => {
    const { result, onChange, discardCapture } = setup(1, 'paused');
    act(() => result.current.request(2));
    expect(onChange).not.toHaveBeenCalled();
    const buttons = (Alert.alert as jest.Mock).mock
      .calls[0][2] as AlertButton[];
    await act(async () => {
      buttons.find(b => b.style === 'destructive')?.onPress?.();
    });
    expect(discardCapture).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
