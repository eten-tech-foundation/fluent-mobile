import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  __setPermission,
  resetAudioMock,
} from '../test/mocks/expo-audio';
import { getMicPermission, requestMicPermission } from './micPermission';

describe('micPermission', () => {
  beforeEach(() => {
    resetAudioMock();
  });

  it('maps granted', async () => {
    __setPermission({ granted: true, status: 'granted' });
    await expect(getMicPermission()).resolves.toBe('granted');
    await expect(getRecordingPermissionsAsync()).resolves.toMatchObject({
      granted: true,
    });
  });

  it('maps undetermined', async () => {
    __setPermission({ granted: false, status: 'undetermined' });
    await expect(getMicPermission()).resolves.toBe('undetermined');
  });

  it('maps denied without throwing or alerting', async () => {
    __setPermission({ granted: false, status: 'denied' });
    await expect(requestMicPermission()).resolves.toBe('denied');
    await expect(requestRecordingPermissionsAsync()).resolves.toMatchObject({
      granted: false,
    });
  });
});
