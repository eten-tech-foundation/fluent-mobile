import {
  buildMockInventoryForScenario,
  getDefaultDeselectedItemIdsForScenario,
  MOCK_PREPARE_OFFLINE_MIXED_INVENTORY,
  normalizeCumulativeTierInventory,
  PREPARE_OFFLINE_MOCK_INVENTORY_SCENARIOS,
} from './offlineDownloadInventoryScenarios';
import {
  manifestEntryToResourceId,
  MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST,
} from './offlineDownloadCatalog';

describe('prepareOffline mock inventory scenarios', () => {
  it('defines cumulative tier scenarios only (no invalid edge cases)', () => {
    expect(PREPARE_OFFLINE_MOCK_INVENTORY_SCENARIOS).toEqual([
      'fresh',
      'tier1',
      'tier1-tier2',
      'tier1-tier2-tier3-pending',
      'all',
      'mixed',
    ]);
  });

  it('marks every resource selected in fresh scenario', () => {
    const inventory = buildMockInventoryForScenario('fresh');

    expect(
      Object.values(inventory).every(status => status === 'selected'),
    ).toBe(true);
    expect(Object.keys(inventory).length).toBeGreaterThan(0);
  });

  it('marks only tier 1 completed in tier1 scenario', () => {
    const inventory = buildMockInventoryForScenario('tier1');
    const tier1Text = manifestEntryToResourceId(1, 'Source Bible', 'text');
    const tier2Text = manifestEntryToResourceId(2, 'Translation Words', 'text');
    const tier3Text = manifestEntryToResourceId(3, 'Bible Commentary', 'text');

    expect(inventory[tier1Text]).toBe('completed');
    expect(inventory[tier2Text]).toBe('selected');
    expect(inventory[tier3Text]).toBe('selected');
  });

  it('marks tier 1 and 2 completed in tier1-tier2 scenario', () => {
    const inventory = buildMockInventoryForScenario('tier1-tier2');
    const tier1Text = manifestEntryToResourceId(1, 'Source Bible', 'text');
    const tier2Audio = manifestEntryToResourceId(
      2,
      'Translation Words',
      'audio',
    );
    const tier3Text = manifestEntryToResourceId(3, 'Bible Commentary', 'text');

    expect(inventory[tier1Text]).toBe('completed');
    expect(inventory[tier2Audio]).toBe('completed');
    expect(inventory[tier3Text]).toBe('selected');
  });

  it('marks every resource completed in all scenario', () => {
    const inventory = buildMockInventoryForScenario('all');

    expect(
      Object.values(inventory).every(status => status === 'completed'),
    ).toBe(true);
  });

  it('keeps mixed scenario cumulative (tier 1 complete before tier 2 download)', () => {
    const inventory = buildMockInventoryForScenario('mixed');
    const tier1Text = manifestEntryToResourceId(1, 'Source Bible', 'text');
    const tier2WordsAudio = manifestEntryToResourceId(
      2,
      'Translation Words',
      'audio',
    );
    const tier3Text = manifestEntryToResourceId(3, 'Bible Commentary', 'text');

    expect(inventory[tier1Text]).toBe('completed');
    expect(inventory[tier2WordsAudio]).toBe('downloading');
    expect(inventory[tier3Text]).toBe('selected');
  });

  it('covers every manifest resource in the mixed inventory preset', () => {
    expect(Object.keys(MOCK_PREPARE_OFFLINE_MIXED_INVENTORY).length).toBe(
      MOCK_PREPARE_OFFLINE_RESOURCE_MANIFEST.length,
    );
  });

  it('downgrades higher-tier on-device status when lower tiers are incomplete', () => {
    const tier1Text = manifestEntryToResourceId(1, 'Source Bible', 'text');
    const tier2Text = manifestEntryToResourceId(2, 'Translation Words', 'text');
    const tier3Text = manifestEntryToResourceId(3, 'Bible Commentary', 'text');

    const invalid = normalizeCumulativeTierInventory({
      [tier1Text]: 'selected',
      [tier2Text]: 'completed',
      [tier3Text]: 'completed',
    });

    expect(invalid[tier1Text]).toBe('selected');
    expect(invalid[tier2Text]).toBe('selected');
    expect(invalid[tier3Text]).toBe('selected');
  });

  it('allows tier 2 downloading only when tier 1 is fully completed', () => {
    const tier1Text = manifestEntryToResourceId(1, 'Source Bible', 'text');
    const tier1Audio = manifestEntryToResourceId(1, 'Source Bible', 'audio');
    const tier1NotesText = manifestEntryToResourceId(
      1,
      'Translation Notes',
      'text',
    );
    const tier1NotesAudio = manifestEntryToResourceId(
      1,
      'Translation Notes',
      'audio',
    );
    const tier2Text = manifestEntryToResourceId(2, 'Translation Words', 'text');

    const valid = normalizeCumulativeTierInventory({
      [tier1Text]: 'completed',
      [tier1Audio]: 'completed',
      [tier1NotesText]: 'completed',
      [tier1NotesAudio]: 'completed',
      [tier2Text]: 'downloading',
    });

    expect(valid[tier2Text]).toBe('downloading');
  });

  it('deselects tier 2 and 3 from the package in tier1 scenario', () => {
    const deselected = getDefaultDeselectedItemIdsForScenario('tier1');
    const tier2Text = manifestEntryToResourceId(2, 'Translation Words', 'text');
    const tier3Text = manifestEntryToResourceId(3, 'Bible Commentary', 'text');
    const tier1Text = manifestEntryToResourceId(1, 'Source Bible', 'text');

    expect(deselected.has(tier2Text)).toBe(true);
    expect(deselected.has(tier3Text)).toBe(true);
    expect(deselected.has(tier1Text)).toBe(false);
  });

  it('marks tier 1 and 2 completed in tier1-tier2-tier3-pending scenario', () => {
    const inventory = buildMockInventoryForScenario(
      'tier1-tier2-tier3-pending',
    );
    const tier2Audio = manifestEntryToResourceId(
      2,
      'Translation Words',
      'audio',
    );
    const tier3Text = manifestEntryToResourceId(3, 'Bible Commentary', 'text');

    expect(inventory[tier2Audio]).toBe('completed');
    expect(inventory[tier3Text]).toBe('selected');
  });

  it('includes tier 3 in the package for tier1-tier2-tier3-pending scenario', () => {
    expect(
      getDefaultDeselectedItemIdsForScenario('tier1-tier2-tier3-pending').size,
    ).toBe(0);
  });

  it('deselects tier 3 from the package in tier1-tier2 scenario', () => {
    const deselected = getDefaultDeselectedItemIdsForScenario('tier1-tier2');
    const tier3Text = manifestEntryToResourceId(3, 'Bible Commentary', 'text');
    const tier2Text = manifestEntryToResourceId(2, 'Translation Words', 'text');

    expect(deselected.has(tier3Text)).toBe(true);
    expect(deselected.has(tier2Text)).toBe(false);
  });

  it('includes all tiers in the package for fresh scenario', () => {
    expect(getDefaultDeselectedItemIdsForScenario('fresh').size).toBe(0);
  });
});
