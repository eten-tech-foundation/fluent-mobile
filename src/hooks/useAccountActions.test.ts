import { Alert } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useAccountActions } from './useAccountActions';
import { hrefs } from '../navigation/hrefs';
import {
  RECORDING_IN_PROGRESS_TITLE,
  resetRecordCaptureGateForTests,
  setRecordCaptureGate,
} from '../navigation/recordCaptureGate';
import { resetNavigationAfterAccountSwitch } from '../navigation/resetNavigationAfterAccountSwitch';
import {
  signOutCurrentDeviceAccount,
  switchToDeviceAccount,
} from '../services/accountSession';
import { confirmUnsyncedSignOut } from '../services/confirmUnsyncedSignOut';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../navigation/resetNavigationAfterAccountSwitch', () => ({
  resetNavigationAfterAccountSwitch: jest.fn(),
}));

jest.mock('../services/accountSession', () => ({
  switchToDeviceAccount: jest.fn(),
  signOutCurrentDeviceAccount: jest.fn(),
}));

jest.mock('../services/confirmUnsyncedSignOut', () => ({
  confirmUnsyncedSignOut: jest.fn(),
}));

jest.mock('../services/storage', () => ({
  getActiveUserId: () => '1',
}));

jest.mock('../utils/logger', () => ({
  logger: { create: () => ({ info: jest.fn(), error: jest.fn() }) },
}));

const mockSwitch = switchToDeviceAccount as jest.Mock;
const mockSignOut = signOutCurrentDeviceAccount as jest.Mock;
const mockConfirm = confirmUnsyncedSignOut as jest.Mock;
const mockReset = resetNavigationAfterAccountSwitch as jest.Mock;

function setup() {
  const close = jest.fn();
  const onUserSwitched = jest.fn();
  const onSignOut = jest.fn();
  const { result } = renderHook(() =>
    useAccountActions({ close, onUserSwitched, onSignOut }),
  );
  return { result, close, onUserSwitched, onSignOut };
}

describe('useAccountActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetRecordCaptureGateForTests();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('switches account, then resets navigation for the new one', async () => {
    mockSwitch.mockResolvedValue(undefined);
    const { result, close, onUserSwitched } = setup();

    await act(() => result.current.switchTo('2'));

    expect(mockSwitch).toHaveBeenCalledWith('2');
    expect(onUserSwitched).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
    expect(mockReset).toHaveBeenCalled();
  });

  it('just closes when the account is already active', async () => {
    const { result, close } = setup();

    await act(() => result.current.switchTo('1'));

    expect(mockSwitch).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it('closes and explains instead of leaving a recording', async () => {
    setRecordCaptureGate(true);
    const { result, close } = setup();

    await act(() => result.current.switchTo('2'));
    act(() => result.current.addAccount());

    expect(mockSwitch).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(2);
    expect(Alert.alert).toHaveBeenCalledWith(
      RECORDING_IN_PROGRESS_TITLE,
      expect.any(String),
      expect.any(Array),
    );
  });

  it('opens Add user', () => {
    const { result, close } = setup();

    act(() => result.current.addAccount());

    expect(close).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith(hrefs.addUser);
  });

  it('signs out, or moves to the next account on this device', async () => {
    mockConfirm.mockResolvedValue(true);
    mockSignOut.mockResolvedValueOnce({ kind: 'signed_out' });
    const { result, onSignOut, onUserSwitched } = setup();

    await act(() => result.current.signOut());
    expect(onSignOut).toHaveBeenCalled();

    mockSignOut.mockResolvedValueOnce({ kind: 'switched' });
    await act(() => result.current.signOut());
    expect(onUserSwitched).toHaveBeenCalled();
    expect(mockReset).toHaveBeenCalled();
  });

  it('stays signed in when unsynced work is kept', async () => {
    mockConfirm.mockResolvedValue(false);
    const { result, close } = setup();

    await act(() => result.current.signOut());

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});
