import { AppState } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { useDraftingUploadHold } from './useDraftingUploadHold';
import { setDraftingUploadHold } from '../services/uploadOrchestrator';

jest.mock('../services/uploadOrchestrator', () => ({
  setDraftingUploadHold: jest.fn(),
}));

type Listener = () => void;
const mockFocusListeners: Listener[] = [];
const mockBlurListeners: Listener[] = [];
let mockFocused = true;

jest.mock('expo-router', () => ({
  useNavigation: () => ({
    isFocused: () => mockFocused,
    addListener: (event: string, listener: Listener) => {
      const list = event === 'focus' ? mockFocusListeners : mockBlurListeners;
      list.push(listener);
      return () => {
        const index = list.indexOf(listener);
        if (index >= 0) list.splice(index, 1);
      };
    },
  }),
}));

const mockHold = setDraftingUploadHold as jest.Mock;

describe('useDraftingUploadHold', () => {
  const previousAppState = AppState.currentState;

  beforeEach(() => {
    mockFocusListeners.length = 0;
    mockBlurListeners.length = 0;
    mockFocused = true;
    mockHold.mockClear();
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: 'active',
    });
  });

  afterEach(() => {
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      value: previousAppState,
    });
  });

  it('keeps the hold while another screen still wants it', () => {
    const first = renderHook(() => useDraftingUploadHold());
    const second = renderHook(() => useDraftingUploadHold());
    expect(mockHold).toHaveBeenLastCalledWith(true);

    first.unmount();
    expect(mockHold).toHaveBeenLastCalledWith(true);

    second.unmount();
    expect(mockHold).toHaveBeenLastCalledWith(false);
  });

  it('drops the hold when the app backgrounds, and ignores inactive', () => {
    let onChange: ((state: string) => void) | undefined;
    const remove = jest.fn();
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        onChange = listener as (state: string) => void;
        return { remove };
      });

    const { unmount } = renderHook(() => useDraftingUploadHold());
    expect(mockHold).toHaveBeenLastCalledWith(true);

    onChange?.('background');
    expect(mockHold).toHaveBeenLastCalledWith(false);

    onChange?.('active');
    expect(mockHold).toHaveBeenLastCalledWith(true);

    onChange?.('inactive');
    expect(mockHold).toHaveBeenLastCalledWith(true);

    unmount();
    expect(remove).toHaveBeenCalled();
  });
});
