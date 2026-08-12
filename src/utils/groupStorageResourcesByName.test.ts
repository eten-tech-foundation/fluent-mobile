import { kindLabel } from './prepareOfflineResourceId';
import { groupStorageResourcesByName } from './groupStorageResourcesByName';

describe('groupStorageResourcesByName', () => {
  it('groups resources under their resource name headings', () => {
    const groups = groupStorageResourcesByName([
      {
        id: '1',
        projectId: 2,
        label: 'Source Bible — Text',
        resourceName: 'Source Bible',
        kind: 'text',
        bytes: 7,
      },
      {
        id: '2',
        projectId: 2,
        label: 'Source Bible — Audio',
        resourceName: 'Source Bible',
        kind: 'audio',
        bytes: 125,
      },
    ]);

    expect(groups).toEqual([
      {
        resourceName: 'Source Bible',
        resources: [
          expect.objectContaining({ id: '1', kind: 'text' }),
          expect.objectContaining({ id: '2', kind: 'audio' }),
        ],
      },
    ]);
  });

  it('maps kinds to display labels', () => {
    expect(kindLabel('text')).toBe('Text');
    expect(kindLabel('audio')).toBe('Audio');
    expect(kindLabel('image')).toBe('Image');
  });
});
