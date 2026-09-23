import {
  prepareOfflineItemToEnqueueInputs,
  prepareOfflineItemsToEnqueueInputs,
} from './prepareOfflineQueueMapping';
import { PrepareOfflineResourceItem } from '../types/prepareOffline/types';
import type { PrepareOfflineResourceManifestItem } from '../types/prepareOffline/types';

const BASE_MEMBER: PrepareOfflineResourceManifestItem = {
  id: 'source-bible-audio-MRK-1',
  tier: 1,
  kind: 'audio',
  resourceName: 'Source Bible',
  label: 'Audio',
  required: true,
  removable: false,
  bytesTotal: 8 * 1024 * 1024,
  sourceUrl: 'https://example.com/audio.mp3',
  fileExt: 'mp3',
  languageCode: 'eng',
  bookCode: 'MRK',
  startChapter: 1,
  endChapter: 1,
};

function item(
  overrides: Partial<PrepareOfflineResourceItem> = {},
  members: PrepareOfflineResourceManifestItem[] = [BASE_MEMBER],
): PrepareOfflineResourceItem {
  return {
    id: 'Source Bible:audio',
    tier: 1,
    kind: 'audio',
    groupName: 'Source Bible',
    label: 'Audio',
    bytes: 8 * 1024 * 1024,
    status: 'selected',
    manifestMembers: members,
    ...overrides,
  };
}

const TEST_USER_ID = 7;

describe('prepareOfflineQueueMapping', () => {
  it('expands one catalog row into one enqueue input per manifest member', () => {
    const memberB = { ...BASE_MEMBER, id: 'source-bible-audio-MRK-2' };
    const inputs = prepareOfflineItemToEnqueueInputs(
      item({ bytes: 16 * 1024 * 1024 }, [BASE_MEMBER, memberB]),
      42,
      TEST_USER_ID,
    );

    expect(inputs).toHaveLength(2);
    expect(inputs.map(input => input.id)).toEqual([
      'source-bible-audio-MRK-1',
      'source-bible-audio-MRK-2',
    ]);
    expect(inputs.every(input => input.projectId === 42)).toBe(true);
    expect(inputs.every(input => input.userId === TEST_USER_ID)).toBe(true);
  });

  it('carries each member real sourceUrl/fileExt/bytesTotal from the manifest', () => {
    const jsonMember: PrepareOfflineResourceManifestItem = {
      ...BASE_MEMBER,
      id: 'bible-commentary-text-1',
      kind: 'text',
      fileExt: 'json',
      bytesTotal: 1024,
      sourceUrl: 'https://example.com/commentary.json',
    };
    const pdfMember: PrepareOfflineResourceManifestItem = {
      ...BASE_MEMBER,
      id: 'bible-commentary-text-2',
      kind: 'text',
      fileExt: 'pdf',
      bytesTotal: 9_266,
      sourceUrl: 'https://example.com/commentary.pdf',
    };
    const inputs = prepareOfflineItemToEnqueueInputs(
      item({ kind: 'text', groupName: 'Bible Commentary' }, [
        jsonMember,
        pdfMember,
      ]),
      1,
      TEST_USER_ID,
    );

    expect(inputs.map(input => input.kind)).toEqual(['text', 'text']);
    expect(inputs.map(input => input.fileExt)).toEqual(['json', 'pdf']);
    expect(inputs.map(input => input.bytesTotal)).toEqual([1024, 9_266]);
    expect(inputs[0].sourceUrl).toBe('https://example.com/commentary.json');
  });

  it('maps row kind straight to queue kind (image no longer coerced to text)', () => {
    const imageMember: PrepareOfflineResourceManifestItem = {
      ...BASE_MEMBER,
      id: 'reference-images-image-1',
      kind: 'image',
      fileExt: 'png',
    };
    const [input] = prepareOfflineItemToEnqueueInputs(
      item({ kind: 'image', groupName: 'Reference Images' }, [imageMember]),
      1,
      TEST_USER_ID,
    );

    expect(input.kind).toBe('image');
  });

  it('preserves tier order when mapping multiple rows', () => {
    const tier2Member: PrepareOfflineResourceManifestItem = {
      ...BASE_MEMBER,
      id: 'translation-words-text-1',
      tier: 2,
    };
    const inputs = prepareOfflineItemsToEnqueueInputs(
      [
        item(),
        item(
          {
            id: 'Translation Words:text',
            tier: 2,
            groupName: 'Translation Words',
          },
          [tier2Member],
        ),
      ],
      5,
      TEST_USER_ID,
    );

    expect(inputs.map(input => input.tier)).toEqual([1, 2]);
    expect(inputs.every(input => input.projectId === 5)).toBe(true);
    expect(inputs.every(input => input.userId === TEST_USER_ID)).toBe(true);
  });

  it('uses member label and row groupName on each enqueue input', () => {
    const member: PrepareOfflineResourceManifestItem = {
      ...BASE_MEMBER,
      label: 'Mark 1',
    };
    const [input] = prepareOfflineItemToEnqueueInputs(
      item({}, [member]),
      1,
      TEST_USER_ID,
    );

    expect(input.resourceName).toBe('Source Bible');
    expect(input.label).toBe('Mark 1');
  });

  it('returns an empty array for a row with no manifest members', () => {
    const inputs = prepareOfflineItemToEnqueueInputs(
      item({}, []),
      1,
      TEST_USER_ID,
    );

    expect(inputs).toEqual([]);
  });
});
