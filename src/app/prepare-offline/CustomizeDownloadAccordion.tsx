import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react-native';
import { PrepareOfflineCatalog } from '../../types/prepareOffline/types';
import { theme, iconSizes, listIconStrokeWidth } from '../../theme';
import { CustomizeDownloadGroupList } from './ResourceTierSection';

interface CustomizeDownloadAccordionProps {
  catalog: PrepareOfflineCatalog;
  expanded: boolean;
  onToggleExpanded: () => void;
  isItemSelected: (itemId: string) => boolean;
  onToggleItem: (itemId: string) => void;
}

export function CustomizeDownloadAccordion({
  catalog,
  expanded,
  onToggleExpanded,
  isItemSelected,
  onToggleItem,
}: CustomizeDownloadAccordionProps) {
  if (catalog.items.length === 0) {
    return null;
  }

  return (
    <View style={styles.card} testID="customize-download-accordion">
      <TouchableOpacity
        style={styles.header}
        onPress={onToggleExpanded}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <SlidersHorizontal
          size={iconSizes.headerTab}
          color={theme.colors.mutedForeground}
          strokeWidth={listIconStrokeWidth}
        />
        <Text style={styles.title}>Customize download</Text>
        {expanded ? (
          <ChevronUp
            size={iconSizes.headerTab}
            color={theme.colors.mutedForeground}
            strokeWidth={listIconStrokeWidth}
          />
        ) : (
          <ChevronDown
            size={iconSizes.headerTab}
            color={theme.colors.mutedForeground}
            strokeWidth={listIconStrokeWidth}
          />
        )}
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.body}>
          <View style={styles.innerCard}>
            <CustomizeDownloadGroupList
              groups={catalog.groups}
              isItemSelected={isItemSelected}
              onToggleItem={onToggleItem}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
  },
  body: {
    paddingBottom: theme.spacing.md,
  },
  innerCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
});
