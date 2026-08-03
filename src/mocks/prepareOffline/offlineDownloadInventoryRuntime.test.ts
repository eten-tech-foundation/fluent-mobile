import {
  getMockPrepareOfflineResourceStatus,
  resetMockPrepareOfflineInventory,
  setPrepareOfflineMockInventoryScenario,
  simulateMockPrepareOfflineDownload,
} from './offlineDownloadInventoryRuntime';
import { manifestEntryToResourceId } from './offlineDownloadCatalog';

describe('prepareOffline mock inventory', () => {
  beforeEach(() => {
    resetMockPrepareOfflineInventory();
  });

  it('defaults to fresh scenario with nothing on device', () => {
    expect(
      getMockPrepareOfflineResourceStatus(
        1,
        manifestEntryToResourceId(1, 'Source Bible', 'text'),
      ),
    ).toBe('selected');
    expect(
      getMockPrepareOfflineResourceStatus(
        1,
        manifestEntryToResourceId(2, 'Translation Words', 'audio'),
      ),
    ).toBe('selected');
  });

  it('returns mixed mockup-like statuses when scenario is mixed', () => {
    setPrepareOfflineMockInventoryScenario('mixed');

    expect(
      getMockPrepareOfflineResourceStatus(
        1,
        manifestEntryToResourceId(1, 'Source Bible', 'text'),
      ),
    ).toBe('completed');
    expect(
      getMockPrepareOfflineResourceStatus(
        1,
        manifestEntryToResourceId(2, 'Translation Words', 'audio'),
      ),
    ).toBe('downloading');
    expect(
      getMockPrepareOfflineResourceStatus(
        1,
        manifestEntryToResourceId(2, 'Translation Notes', 'text'),
      ),
    ).toBe('selected');
  });

  it('starts tier-ordered download simulation in dev', () => {
    setPrepareOfflineMockInventoryScenario('fresh');
    jest.useFakeTimers();

    const ids = [
      manifestEntryToResourceId(1, 'Source Bible', 'text'),
      manifestEntryToResourceId(1, 'Source Bible', 'audio'),
      manifestEntryToResourceId(2, 'Translation Words', 'audio'),
      manifestEntryToResourceId(2, 'Translation Notes', 'text'),
    ];

    simulateMockPrepareOfflineDownload(5, ids);

    expect(
      getMockPrepareOfflineResourceStatus(
        5,
        manifestEntryToResourceId(1, 'Source Bible', 'text'),
      ),
    ).toBe('downloading');

    jest.advanceTimersByTime(2500);

    expect(
      getMockPrepareOfflineResourceStatus(
        5,
        manifestEntryToResourceId(1, 'Source Bible', 'text'),
      ),
    ).toBe('completed');
    expect(
      getMockPrepareOfflineResourceStatus(
        5,
        manifestEntryToResourceId(1, 'Source Bible', 'audio'),
      ),
    ).toBe('downloading');

    jest.useRealTimers();
  });
});
