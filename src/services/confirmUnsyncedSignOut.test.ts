import { Alert } from 'react-native';
import { confirmUnsyncedSignOut } from './confirmUnsyncedSignOut';

const mockGetUnsyncedRecordingCount = jest.fn();

jest.mock('../db/queries', () => ({
  getUnsyncedRecordingCount: (...args: unknown[]) =>
    mockGetUnsyncedRecordingCount(...args),
}));

describe('confirmUnsyncedSignOut', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('continues when every take is already on the server', async () => {
    mockGetUnsyncedRecordingCount.mockResolvedValue(0);

    await expect(confirmUnsyncedSignOut()).resolves.toBe(true);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('warns and waits when a pericope or verse take is still on the device', async () => {
    mockGetUnsyncedRecordingCount.mockResolvedValue(1);

    const decision = confirmUnsyncedSignOut();
    await Promise.resolve();

    expect(Alert.alert).toHaveBeenCalledWith(
      'Unsynced work on device',
      'You have recordings that have not been uploaded. Log out anyway?',
      expect.any(Array),
    );

    const buttons = (
      jest.mocked(Alert.alert).mock.calls[0]?.[2] as Array<{
        text: string;
        onPress?: () => void;
      }>
    );
    buttons.find(button => button.text === 'Cancel')?.onPress?.();
    await expect(decision).resolves.toBe(false);
  });

  it('continues when the person confirms the warning', async () => {
    mockGetUnsyncedRecordingCount.mockResolvedValue(2);

    const decision = confirmUnsyncedSignOut();
    await Promise.resolve();

    const buttons = (
      jest.mocked(Alert.alert).mock.calls[0]?.[2] as Array<{
        text: string;
        onPress?: () => void;
      }>
    );
    buttons.find(button => button.text === 'Log out')?.onPress?.();
    await expect(decision).resolves.toBe(true);
  });
});
