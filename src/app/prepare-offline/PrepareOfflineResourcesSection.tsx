import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PrepareOfflineCatalog } from '../../types/prepareOffline/types';
import { theme } from '../../theme';
import { configurePrepareOfflineLayoutAnimation } from './configurePrepareOfflineLayoutAnimation';
import { CustomizeDownloadAccordion } from './CustomizeDownloadAccordion';
import { PrepareOfflineResourceSummary } from './PrepareOfflineResourceSummary';

interface PrepareOfflineResourcesSectionProps {
  catalog: PrepareOfflineCatalog;
  summaryCatalog: PrepareOfflineCatalog;
  isItemSelected: (itemId: string) => boolean;
  onToggleItem: (itemId: string) => void;
}

export function PrepareOfflineResourcesSection({
  catalog,
  summaryCatalog,
  isItemSelected,
  onToggleItem,
}: PrepareOfflineResourcesSectionProps) {
  const [customizeExpanded, setCustomizeExpanded] = useState(false);

  const handleToggleCustomize = useCallback(() => {
    configurePrepareOfflineLayoutAnimation();
    setCustomizeExpanded(prev => !prev);
  }, []);

  if (catalog.items.length === 0) {
    return null;
  }

  return (
    <View style={styles.section} testID="prepare-offline-resources-section">
      <Text style={styles.sectionLabel}>RESOURCES TO DOWNLOAD</Text>

      <PrepareOfflineResourceSummary catalog={summaryCatalog} />

      <CustomizeDownloadAccordion
        catalog={catalog}
        expanded={customizeExpanded}
        onToggleExpanded={handleToggleCustomize}
        isItemSelected={isItemSelected}
        onToggleItem={onToggleItem}
      />
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
