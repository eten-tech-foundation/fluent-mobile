import {
  formatDownloadButtonLabel,
  formatDownloadTotalLabel,
  formatResourceSizeLabel,
  hasPendingDownloadWork,
  isManifestItemSizeKnown,
  summarizeDownloadSizes,
} from './prepareOfflineSizeSemantics';
import type { PrepareOfflineResourceItem } from '../types/prepareOffline/types';

function item(
  overrides: Partial<PrepareOfflineResourceItem> & {
    id: string;
    bytes: number;
  },
): PrepareOfflineResourceItem {
  return {
    tier: 3,
    kind: 'image',
    groupName: 'Reference Images',
    label: 'Image',
    status: 'selected',
    required: false,
    removable: true,
    manifestMembers: [],
    sizeKnown: true,
    ...overrides,
  };
}

describe('prepareOfflineSizeSemantics (#756)', () => {
  it('treats remote wire-0 as unknown, Included/true-zero as known', () => {
    expect(
      isManifestItemSizeKnown({
        bytesTotal: 0,
        sourceUrl: 'https://cdn.example/img.jpg',
      }),
    ).toBe(false);
    expect(isManifestItemSizeKnown({ bytesTotal: 0 })).toBe(true);
    expect(
      isManifestItemSizeKnown({
        bytesTotal: 1024,
        sourceUrl: 'https://cdn.example/a.mp3',
      }),
    ).toBe(true);
  });

  it('fail-before: mixed known + unknown never labels unknown as 0 B or exact total', () => {
    // Measured C-0051 shape: ~2.4 MB known text/audio + Reference Images 0 B.
    const knownAudio = item({
      id: 'source-audio',
      kind: 'audio',
      groupName: 'Source Bible',
      label: 'Audio',
      bytes: 1_700_000,
      sizeKnown: true,
    });
    const knownNotes = item({
      id: 'tn-text',
      kind: 'text',
      groupName: 'Translation Notes',
      label: 'Text',
      bytes: 700_000,
      sizeKnown: true,
    });
    const unknownImages = item({
      id: 'ref-images',
      bytes: 0,
      sizeKnown: false,
    });
    const summary = summarizeDownloadSizes([
      knownAudio,
      knownNotes,
      unknownImages,
    ]);

    expect(summary.knownBytes).toBe(2_400_000);
    expect(summary.hasUnknown).toBe(true);
    expect(formatResourceSizeLabel(unknownImages)).toBe('Unknown');
    expect(formatResourceSizeLabel(unknownImages)).not.toBe('0 B');
    expect(formatDownloadTotalLabel(summary)).toBe('At least 2.3 MB');
    expect(formatDownloadTotalLabel(summary)).not.toBe('2.3 MB');
    expect(formatDownloadButtonLabel(summary)).toBe('Download at least 2.3 MB');
    expect(hasPendingDownloadWork([unknownImages])).toBe(true);
  });

  it('pass-after: all-known sizes keep exact total/CTA and recalculate on deselect', () => {
    const a = item({
      id: 'a',
      kind: 'text',
      groupName: 'Notes',
      label: 'Text',
      bytes: 1024,
    });
    const b = item({
      id: 'b',
      kind: 'audio',
      groupName: 'Notes',
      label: 'Audio',
      bytes: 2048,
    });
    const all = summarizeDownloadSizes([a, b]);
    expect(formatDownloadTotalLabel(all)).toBe('3 KB');
    expect(formatDownloadButtonLabel(all)).toBe('Download 3 KB');

    const withoutB = summarizeDownloadSizes([a]);
    expect(formatDownloadTotalLabel(withoutB)).toBe('1 KB');
    expect(formatDownloadButtonLabel(withoutB)).toBe('Download 1 KB');
  });

  it('pass-after: Included and genuine known-zero stay 0 B / Included, not Unknown', () => {
    const included = item({
      id: 'src-text',
      kind: 'text',
      groupName: 'Source Bible',
      label: 'Text',
      bytes: 0,
      sizeKnown: true,
      displayValue: 'Included',
    });
    const trueZero = item({
      id: 'empty-placeholder',
      kind: 'text',
      groupName: 'Empty',
      label: 'Text',
      bytes: 0,
      sizeKnown: true,
    });

    expect(formatResourceSizeLabel(included)).toBe('Included');
    expect(formatResourceSizeLabel(trueZero)).toBe('0 B');
    expect(
      formatDownloadTotalLabel(summarizeDownloadSizes([included, trueZero])),
    ).toBe('0 B');
    expect(hasPendingDownloadWork([included, trueZero])).toBe(false);
  });

  it('unknown-only selection uses incomplete labels and still has pending work', () => {
    const unknown = item({ id: 'img', bytes: 0, sizeKnown: false });
    const summary = summarizeDownloadSizes([unknown]);
    expect(formatDownloadTotalLabel(summary)).toBe('Size incomplete');
    expect(formatDownloadButtonLabel(summary)).toBe(
      'Download (size incomplete)',
    );
    expect(hasPendingDownloadWork([unknown])).toBe(true);
  });
});
