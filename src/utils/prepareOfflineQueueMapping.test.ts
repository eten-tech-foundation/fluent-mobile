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
    required: true,
    removable: false,
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

  it.each(['Translation Notes', 'Translation Questions', 'Bible Commentary'])(
    'prefers the parsed label scope for %s over manifest scope and request range',
    groupName => {
      const [input] = prepareOfflineItemToEnqueueInputs(
        item({ groupName, kind: 'text' }, [
          {
            ...BASE_MEMBER,
            label: 'Mark 2:4-7 (#1)',
            startChapter: 1,
            endChapter: 5,
            scope: {
              startChapter: 3,
              endChapter: 3,
              verseStart: 1,
              verseEnd: 2,
            },
          },
        ]),
        42,
        TEST_USER_ID,
      );

      expect(input).toMatchObject({
        bookCode: 'MRK',
        startChapter: 2,
        endChapter: 2,
        verseStart: 4,
        verseEnd: 7,
      });
    },
  );

  it('does not mix a parsed cross-chapter label with manifest verse bounds', () => {
    const [input] = prepareOfflineItemToEnqueueInputs(
      item({ groupName: 'Translation Notes', kind: 'text' }, [
        {
          ...BASE_MEMBER,
          label: 'Mark 2:4–3:7',
          scope: { startChapter: 2, endChapter: 2, verseStart: 4, verseEnd: 5 },
        },
      ]),
      42,
      TEST_USER_ID,
    );

    expect(input).toMatchObject({ startChapter: 2, endChapter: 3 });
    expect(input.verseStart).toBeUndefined();
    expect(input.verseEnd).toBeUndefined();
  });

  it('persists each member actual scope when labels do not encode a verse', () => {
    const inputs = prepareOfflineItemToEnqueueInputs(
      item({ groupName: 'Bible Commentary', kind: 'text' }, [
        {
          ...BASE_MEMBER,
          label: 'Introduction',
          startChapter: 1,
          endChapter: 5,
          scope: {
            bookCode: 'GEN',
            startChapter: 2,
            endChapter: 2,
            verseStart: 1,
            verseEnd: 3,
          },
        },
        {
          ...BASE_MEMBER,
          id: 'commentary-overview',
          label: 'Overview',
          startChapter: 1,
          endChapter: 5,
          scope: { bookCode: 'MRK', startChapter: 3, endChapter: 4 },
        },
      ]),
      42,
      TEST_USER_ID,
    );

    expect(inputs[0]).toMatchObject({
      bookCode: 'GEN',
      startChapter: 2,
      endChapter: 2,
      verseStart: 1,
      verseEnd: 3,
    });
    expect(inputs[1]).toMatchObject({
      bookCode: 'MRK',
      startChapter: 3,
      endChapter: 4,
    });
    expect(inputs[1].verseStart).toBeUndefined();
    expect(inputs[1].verseEnd).toBeUndefined();
  });

  it.each(['Source Bible Audio', 'Reference Images', 'Translation Notes'])(
    'leaves ambiguous legacy request ranges unscoped for %s',
    groupName => {
      const [input] = prepareOfflineItemToEnqueueInputs(
        item({ groupName }, [
          { ...BASE_MEMBER, startChapter: 1, endChapter: 5 },
        ]),
        42,
        TEST_USER_ID,
      );

      expect(input.bookCode).toBe('MRK');
      expect(input.startChapter).toBeUndefined();
      expect(input.endChapter).toBeUndefined();
      expect(input.verseStart).toBeUndefined();
      expect(input.verseEnd).toBeUndefined();
    },
  );

  it('keeps unambiguous legacy chapter scope for each audio member', () => {
    const inputs = prepareOfflineItemToEnqueueInputs(
      item({}, [
        BASE_MEMBER,
        { ...BASE_MEMBER, id: 'audio-2', startChapter: 2, endChapter: 2 },
      ]),
      42,
      TEST_USER_ID,
    );

    expect(inputs.map(input => [input.startChapter, input.endChapter])).toEqual(
      [
        [1, 1],
        [2, 2],
      ],
    );
  });

  it('uses each manifest member sourceUrl / fileExt (#504 / #446)', () => {
    const member: PrepareOfflineResourceManifestItem = {
      ...BASE_MEMBER,
      sourceUrl: 'https://cdn.example/audio_v2.mp3',
      fileExt: 'mp3',
    };
    const [input] = prepareOfflineItemToEnqueueInputs(
      item({}, [member]),
      1,
      TEST_USER_ID,
    );

    expect(input.sourceUrl).toBe('https://cdn.example/audio_v2.mp3');
    expect(input.fileExt).toBe('mp3');
  });
});
