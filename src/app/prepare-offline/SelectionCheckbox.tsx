import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { theme, listIconStrokeWidth } from '../../theme';

interface SelectionCheckboxProps {
  selected: boolean;
  /** Show checkmark for partial selection (select-all indeterminate). */
  showCheck?: boolean;
}

export function SelectionCheckbox({
  selected,
  showCheck = selected,
}: SelectionCheckboxProps) {
  return (
    <View style={[styles.box, selected && styles.boxSelected]}>
      {showCheck ? (
        <Check
          size={12}
          color={
            selected ? theme.colors.primaryForeground : theme.colors.primary
          }
          strokeWidth={listIconStrokeWidth}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxSelected: {
    backgroundColor: theme.colors.primary,
  },
});
