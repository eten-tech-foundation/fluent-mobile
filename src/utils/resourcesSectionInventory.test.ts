import {
  RESOURCES_SECTION_INVENTORY_GATES,
  buildUnitResourcesAvailability,
  getInventoriedResourceSections,
  isResourcesSectionInventoried,
} from './resourcesSectionInventory';
import { PrepareOfflineResourceStatus } from '../types/prepareOffline/types';
import { manifestEntryToResourceId } from './prepareOfflineResourceId';

function statusMap(
  entries: Record<string, PrepareOfflineResourceStatus>,
): (resourceId: string) => PrepareOfflineResourceStatus {
  return resourceId => entries[resourceId] ?? 'available';
}

describe('resourcesSectionInventory', () => {
  it('maps TN / TQ / Images to Prepare Offline catalog resource ids', () => {
    expect(RESOURCES_SECTION_INVENTORY_GATES).toEqual([
      {
        sectionId: 'translationNotes',
        groupName: 'Translation Notes',
        kind: 'text',
        resourceId: manifestEntryToResourceId(1, 'Translation Notes', 'text'),
      },
      {
        sectionId: 'translationQuestions',
        groupName: 'Translation Questions',
        kind: 'text',
        resourceId: manifestEntryToResourceId(
          2,
          'Translation Questions',
          'text',
        ),
      },
      {
        sectionId: 'imagesMaps',
        groupName: 'Reference Images',
        kind: 'image',
        resourceId: manifestEntryToResourceId(3, 'Reference Images', 'image'),
      },
    ]);
  });

  it('returns no sections when inventory is empty (fresh device)', () => {
    const getStatus = statusMap({});
    expect(getInventoriedResourceSections(getStatus)).toEqual([]);
    expect(isResourcesSectionInventoried(getStatus, 'translationNotes')).toBe(
      false,
    );
  });

  it('shows Translation Notes only when Tier 1 TN text is completed', () => {
    const tnId = manifestEntryToResourceId(1, 'Translation Notes', 'text');
    const getStatus = statusMap({ [tnId]: 'completed' });
    expect(getInventoriedResourceSections(getStatus)).toEqual([
      'translationNotes',
    ]);
  });

  it('shows TN + TQ when those inventory rows are completed', () => {
    const getStatus = statusMap({
      [manifestEntryToResourceId(1, 'Translation Notes', 'text')]: 'completed',
      [manifestEntryToResourceId(2, 'Translation Questions', 'text')]:
        'completed',
    });
    expect(getInventoriedResourceSections(getStatus)).toEqual([
      'translationNotes',
      'translationQuestions',
    ]);
  });

  it('hides sections that are selected/downloading but not completed', () => {
    const getStatus = statusMap({
      [manifestEntryToResourceId(1, 'Translation Notes', 'text')]: 'completed',
      [manifestEntryToResourceId(2, 'Translation Questions', 'text')]:
        'downloading',
      [manifestEntryToResourceId(3, 'Reference Images', 'image')]: 'selected',
    });
    expect(getInventoriedResourceSections(getStatus)).toEqual([
      'translationNotes',
    ]);
  });

  it('includes sections persisted as completed in download_queue', () => {
    const getStatus = statusMap({});
    expect(getInventoriedResourceSections(getStatus, ['imagesMaps'])).toEqual([
      'imagesMaps',
    ]);
  });

  it('does not duplicate a section present in both inventory sources', () => {
    const getStatus = statusMap({
      [manifestEntryToResourceId(1, 'Translation Notes', 'text')]: 'completed',
    });
    expect(
      getInventoriedResourceSections(getStatus, ['translationNotes']),
    ).toEqual(['translationNotes']);
  });

  it('builds unit availability labels from chapter + verse', () => {
    const getStatus = statusMap({
      [manifestEntryToResourceId(1, 'Translation Notes', 'text')]: 'completed',
    });
    expect(
      buildUnitResourcesAvailability({
        chapterName: 'Mark 14',
        verseNumber: 3,
        getStatus,
      }),
    ).toEqual({
      referenceLabel: 'Mark 14:3',
      passageTitle: 'Downloaded resources for this project',
      sections: ['translationNotes'],
    });
  });

  it('omits passage title when nothing is inventoried', () => {
    expect(
      buildUnitResourcesAvailability({
        chapterName: 'Mark 14',
        verseNumber: 1,
        getStatus: statusMap({}),
      }).passageTitle,
    ).toBeUndefined();
  });
});
