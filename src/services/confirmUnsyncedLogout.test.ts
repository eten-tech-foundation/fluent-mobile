import { Alert } from 'react-native';
import { confirmUnsyncedLogout } from './confirmUnsyncedLogout';

const mockLoadPendingUploadCount = jest.fn();

jest.mock('../hooks/usePendingUploads', () => ({
  loadPendingUploadCount: (...args: unknown[]) =>
    mockLoadPendingUploadCount(...args),
}));

describe('confirmUnsyncedLogout', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('continues when there are no pending uploads', async () => {
    mockLoadPendingUploadCount.mockResolvedValue(0);

    await expect(confirmUnsyncedLogout()).resolves.toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('warns when pending uploads remain', async () => {
    mockLoadPendingUploadCount.mockResolvedValue(1);

    const decision = confirmUnsyncedLogout();
    await Promise.resolve();

    expect(Alert.alert).toHaveBeenCalledWith(
      'Unsynced work on device',
      'You have recordings that have not been uploaded. Log out anyway?',
      expect.any(Array),
    );

    const buttons = jest.mocked(Alert.alert).mock.calls[0]?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    buttons.find(button => button.text === 'Cancel')?.onPress?.();
    await expect(decision).resolves.toBe(false);
  });

  it('warns when the pending count cannot be read', async () => {
    mockLoadPendingUploadCount.mockRejectedValue(new Error('db'));

    const decision = confirmUnsyncedLogout();
    await Promise.resolve();

    expect(Alert.alert).toHaveBeenCalledWith(
      'Unsynced work on device',
      'You have recordings that have not been uploaded. Log out anyway?',
      expect.any(Array),
    );

    const buttons = jest.mocked(Alert.alert).mock.calls[0]?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    buttons.find(button => button.text === 'Log out')?.onPress?.();
    await expect(decision).resolves.toBe(true);
  });
});
