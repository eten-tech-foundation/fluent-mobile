import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrepareOfflineCatalog } from '../../types/prepareOffline/types';
import { filterPrepareOfflineCatalogByTiers } from '../../utils/prepareOfflineCatalog';
import { theme } from '../../theme';
import { CustomizeDownloadAccordion } from './CustomizeDownloadAccordion';
import { PrepareOfflineResourceSummary } from './PrepareOfflineResourceSummary';

interface PrepareOfflineResourcesSectionProps {
  catalog: PrepareOfflineCatalog;
  isItemSelected: (itemId: string) => boolean;
  onToggleItem: (itemId: string) => void;
}

export function PrepareOfflineResourcesSection({
  catalog,
  isItemSelected,
  onToggleItem,
}: PrepareOfflineResourcesSectionProps) {
  const [customizeExpanded, setCustomizeExpanded] = useState(false);

  const tier1Catalog = useMemo(
    () => filterPrepareOfflineCatalogByTiers(catalog, [1]),
    [catalog],
  );

  const customizeCatalog = useMemo(
    () => filterPrepareOfflineCatalogByTiers(catalog, [2, 3]),
    [catalog],
  );

  if (catalog.items.length === 0) {
    return null;
  }

  return (
    <View style={styles.section} testID="prepare-offline-resources-section">
      <Text style={styles.sectionLabel}>RESOURCES TO DOWNLOAD</Text>

      {tier1Catalog.groups.length > 0 ? (
        <PrepareOfflineResourceSummary catalog={tier1Catalog} />
      ) : null}

      {customizeCatalog.items.length > 0 ? (
        <CustomizeDownloadAccordion
          catalog={customizeCatalog}
          expanded={customizeExpanded}
          onToggleExpanded={() => setCustomizeExpanded(prev => !prev)}
          isItemSelected={isItemSelected}
          onToggleItem={onToggleItem}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  sectionLabel: {
    fontSize: theme.typography.sizes.xs,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.mutedForeground,
    letterSpacing: 0.4,
  },
});
