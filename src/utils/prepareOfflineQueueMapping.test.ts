import {
  prepareOfflineItemToEnqueueInput,
  prepareOfflineItemsToEnqueueInputs,
} from './prepareOfflineQueueMapping';
import { DEV_MOCK_FILE_BYTES } from '../mocks/prepareOffline/mockDownloadSources';
import { PrepareOfflineResourceItem } from '../types/prepareOffline/types';

const baseItem: PrepareOfflineResourceItem = {
  id: 'tier-1-source-bible-text',
  tier: 1,
  kind: 'text',
  groupName: 'Source Bible',
  label: 'Text',
  bytes: 8 * 1024 * 1024,
  status: 'selected',
};

const TEST_USER_ID = 7;

describe('prepareOfflineQueueMapping', () => {
  it('uses stable catalog id as queue primary key', () => {
    const input = prepareOfflineItemToEnqueueInput(baseItem, 42, TEST_USER_ID);

    expect(input.id).toBe('tier-1-source-bible-text');
    expect(input.projectId).toBe(42);
    expect(input.userId).toBe(TEST_USER_ID);
    expect(input.tier).toBe(1);
    expect(input.resourceName).toBe('Source Bible');
    expect(input.label).toBe('Text');
    expect(input.bytesTotal).toBe(DEV_MOCK_FILE_BYTES.text);
  });

  it('maps audio and image kinds to queue fields', () => {
    const audio = prepareOfflineItemToEnqueueInput(
      { ...baseItem, id: 'tier-1-source-bible-audio', kind: 'audio' },
      1,
      TEST_USER_ID,
    );
    const image = prepareOfflineItemToEnqueueInput(
      {
        ...baseItem,
        id: 'tier-3-reference-images-image',
        tier: 3,
        kind: 'image',
        groupName: 'Reference Images',
      },
      1,
      TEST_USER_ID,
    );

    expect(audio.kind).toBe('audio');
    expect(image.kind).toBe('text');
    expect(image.fileExt).toBe('png');
  });

  it('preserves tier order when mapping multiple items', () => {
    const items = prepareOfflineItemsToEnqueueInputs(
      [
        baseItem,
        {
          ...baseItem,
          id: 'tier-2-translation-words-text',
          tier: 2,
          groupName: 'Translation Words',
        },
      ],
      5,
      TEST_USER_ID,
    );

    expect(items.map(item => item.tier)).toEqual([1, 2]);
    expect(items.every(item => item.projectId === 5)).toBe(true);
    expect(items.every(item => item.userId === TEST_USER_ID)).toBe(true);
  });

  it('includes dev mock sourceUrl and fileExt', () => {
    const input = prepareOfflineItemToEnqueueInput(baseItem, 1, TEST_USER_ID);

    expect(input.sourceUrl).toEqual(expect.any(String));
    expect(input.fileExt).toEqual(expect.any(String));
    expect(input.sourceUrl?.length).toBeGreaterThan(0);
  });
});
