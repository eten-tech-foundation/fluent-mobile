import { shouldPresentPrepareOffline } from './prepareOfflineTrigger';

describe('shouldPresentPrepareOffline', () => {
  it('does not present when the connection type is wifi but internet is unavailable', () => {
    expect(
      shouldPresentPrepareOffline({
        connectivityProfile: 'rarely_connected',
        isAssigned: false,
        isOnline: false,
        isWifi: true,
        isCellular: false,
        uploadOverCellular: false,
      }),
    ).toBe(false);
  });

  it('presents for rarely connected projects on wifi with internet available', () => {
    expect(
      shouldPresentPrepareOffline({
        connectivityProfile: 'rarely_connected',
        isAssigned: true,
        isOnline: true,
        isWifi: true,
        isCellular: false,
        uploadOverCellular: false,
      }),
    ).toBe(true);
  });

  it('presents on cellular only when cellular use is enabled and internet is available', () => {
    expect(
      shouldPresentPrepareOffline({
        connectivityProfile: null,
        isAssigned: false,
        isOnline: true,
        isWifi: false,
        isCellular: true,
        uploadOverCellular: true,
      }),
    ).toBe(true);
  });

  it('does not present on cellular when cellular use is enabled but internet is unavailable', () => {
    expect(
      shouldPresentPrepareOffline({
        connectivityProfile: null,
        isAssigned: false,
        isOnline: false,
        isWifi: false,
        isCellular: true,
        uploadOverCellular: true,
      }),
    ).toBe(false);
  });
  it('presents for sometimes connected projects when the translator is unassigned', () => {
    expect(
      shouldPresentPrepareOffline({
        connectivityProfile: 'sometimes_connected',
        isAssigned: false,
        isOnline: true,
        isWifi: true,
        isCellular: false,
        uploadOverCellular: false,
      }),
    ).toBe(true);
  });

  it('does not present for sometimes connected projects when the translator is assigned', () => {
    expect(
      shouldPresentPrepareOffline({
        connectivityProfile: 'sometimes_connected',
        isAssigned: true,
        isOnline: true,
        isWifi: true,
        isCellular: false,
        uploadOverCellular: false,
      }),
    ).toBe(false);
  });

  it('does not present on cellular when cellular upload is disabled, even with internet available', () => {
    expect(
      shouldPresentPrepareOffline({
        connectivityProfile: 'rarely_connected',
        isAssigned: false,
        isOnline: true,
        isWifi: false,
        isCellular: true,
        uploadOverCellular: false,
      }),
    ).toBe(false);
  });
});
