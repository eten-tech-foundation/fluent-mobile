import React, { useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { theme } from '../../../../../theme';
import { iconSizes, listIconStrokeWidth } from '../../../../../theme/iconSpecs';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

interface SourceTextPanelProps {
  sourceText: string;
}

export function SourceTextPanel({ sourceText }: SourceTextPanelProps) {
  const [expanded, setExpanded] = useState(false);

  function toggleExpanded() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(prev => !prev);
  }

  return (
    <>
      <TouchableOpacity
        onPress={toggleExpanded}
        style={styles.accordionHeader}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Hide source text' : 'Show source text'}
        testID="record-source-toggle"
      >
        <Text style={styles.accordionLabel}>
          {expanded ? 'Hide source text' : 'Show source text'}
        </Text>
        {expanded ? (
          <ChevronUp
            size={iconSizes.chevron}
            color={theme.colors.foreground}
            strokeWidth={listIconStrokeWidth}
          />
        ) : (
          <ChevronDown
            size={iconSizes.chevron}
            color={theme.colors.foreground}
            strokeWidth={listIconStrokeWidth}
          />
        )}
      </TouchableOpacity>
      {expanded && (
        <View style={styles.sourceBody} testID="record-source-body">
          <Text style={styles.sourceText}>{sourceText}</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.radius.md,
  },
  accordionLabel: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.foreground,
  },
  sourceBody: {
    padding: theme.spacing.md,
  },
  sourceText: {
    fontSize: theme.typography.sizes.md,
    lineHeight: theme.typography.lineHeights.normal,
    color: theme.colors.foreground,
  },
});
