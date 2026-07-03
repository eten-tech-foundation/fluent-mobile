import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useRecordTabGuards } from './useRecordTabGuards';

const mockNavigation = {
  addListener: jest.fn(() => jest.fn()),
  dispatch: jest.fn(),
};

describe('useRecordTabGuards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('withPausedGuard shows an alert instead of running the action while paused', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const action = jest.fn();

    const { result } = renderHook(() =>
      useRecordTabGuards({
        status: 'paused',
        permission: 'granted',
        requestPermission: jest.fn(),
        discardPaused: jest.fn().mockResolvedValue(undefined),
        navigation: mockNavigation as never,
      }),
    );

    result.current.withPausedGuard(action);

    expect(alertSpy).toHaveBeenCalledWith(
      'Recording in progress',
      expect.stringContaining('switching verses'),
      expect.any(Array),
    );
    expect(action).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('withPausedGuard runs the action immediately when not paused', () => {
    const action = jest.fn();

    const { result } = renderHook(() =>
      useRecordTabGuards({
        status: 'idle',
        permission: 'granted',
        requestPermission: jest.fn(),
        discardPaused: jest.fn().mockResolvedValue(undefined),
        navigation: mockNavigation as never,
      }),
    );

    result.current.withPausedGuard(action);

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('withPausedGuard discards the paused take before running the action', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const discardPaused = jest.fn().mockResolvedValue(undefined);
    const action = jest.fn();

    const { result } = renderHook(() =>
      useRecordTabGuards({
        status: 'paused',
        permission: 'granted',
        requestPermission: jest.fn(),
        discardPaused,
        navigation: mockNavigation as never,
      }),
    );

    result.current.withPausedGuard(action);

    const buttons = alertSpy.mock.calls[0]![2] as Array<{
      text: string;
      onPress?: () => Promise<void>;
    }>;
    const discardButton = buttons.find(button => button.text === 'Discard');
    await act(async () => {
      await discardButton?.onPress?.();
    });

    expect(discardPaused).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledTimes(1);

    alertSpy.mockRestore();
  });

  it('withPausedGuard does not run the action when discard fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const discardPaused = jest
      .fn()
      .mockRejectedValue(new Error('discard failed'));
    const action = jest.fn();

    const { result } = renderHook(() =>
      useRecordTabGuards({
        status: 'paused',
        permission: 'granted',
        requestPermission: jest.fn(),
        discardPaused,
        navigation: mockNavigation as never,
      }),
    );

    result.current.withPausedGuard(action);

    const buttons = alertSpy.mock.calls[0]![2] as Array<{
      text: string;
      onPress?: () => void | Promise<void>;
    }>;
    const discardButton = buttons.find(button => button.text === 'Discard');
    await act(async () => {
      await discardButton?.onPress?.();
    });

    expect(discardPaused).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Could not discard recording',
      expect.stringContaining('paused take'),
    );

    alertSpy.mockRestore();
  });

  it('beforeRemove does not dispatch navigation when discard fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const discardPaused = jest
      .fn()
      .mockRejectedValue(new Error('discard failed'));
    const dispatch = jest.fn();
    const navigationAction = { type: 'GO_BACK' };
    let beforeRemoveHandler:
      | ((event: {
          preventDefault: () => void;
          data: { action: unknown };
        }) => void)
      | undefined;

    const navigation = {
      addListener: jest.fn((event, handler) => {
        if (event === 'beforeRemove') beforeRemoveHandler = handler;
        return jest.fn();
      }),
      dispatch,
    };

    renderHook(() =>
      useRecordTabGuards({
        status: 'paused',
        permission: 'granted',
        requestPermission: jest.fn(),
        discardPaused,
        navigation: navigation as never,
      }),
    );

    beforeRemoveHandler?.({
      preventDefault: jest.fn(),
      data: { action: navigationAction },
    });

    const buttons = alertSpy.mock.calls[0]![2] as Array<{
      text: string;
      onPress?: () => void | Promise<void>;
    }>;
    const discardButton = buttons.find(button => button.text === 'Discard');
    await act(async () => {
      await discardButton?.onPress?.();
    });

    expect(discardPaused).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Could not discard recording',
      expect.stringContaining('paused take'),
    );

    alertSpy.mockRestore();
  });

  it('registers a beforeRemove listener while paused', () => {
    renderHook(() =>
      useRecordTabGuards({
        status: 'paused',
        permission: 'granted',
        requestPermission: jest.fn(),
        discardPaused: jest.fn().mockResolvedValue(undefined),
        navigation: mockNavigation as never,
      }),
    );

    expect(mockNavigation.addListener).toHaveBeenCalledWith(
      'beforeRemove',
      expect.any(Function),
    );
  });

  it('ensureMicPermission returns true when permission is granted', async () => {
    const { result } = renderHook(() =>
      useRecordTabGuards({
        status: 'idle',
        permission: 'granted',
        requestPermission: jest.fn(),
        discardPaused: jest.fn().mockResolvedValue(undefined),
        navigation: mockNavigation as never,
      }),
    );

    await expect(result.current.ensureMicPermission()).resolves.toBe(true);
  });

  it('ensureMicPermission shows Settings alert when permission is blocked', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const requestPermission = jest.fn();

    const { result } = renderHook(() =>
      useRecordTabGuards({
        status: 'idle',
        permission: 'blocked',
        requestPermission,
        discardPaused: jest.fn().mockResolvedValue(undefined),
        navigation: mockNavigation as never,
      }),
    );

    await expect(result.current.ensureMicPermission()).resolves.toBe(false);
    expect(alertSpy).toHaveBeenCalledWith(
      'Microphone access required',
      expect.stringContaining('Settings'),
      expect.any(Array),
    );
    expect(requestPermission).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });
});
