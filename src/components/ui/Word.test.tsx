import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Word } from './Word';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

describe('Word', () => {
  beforeEach(() => {
    mockPreferenceStore();
  });

  it('opens its note from a Phrase chip, named for TalkBack', () => {
    const onPress = jest.fn();
    render(
      <Text>
        <Word
          word="blood"
          variant="phrase"
          onPress={onPress}
          accessibilityLabel="Translation note: my blood"
        />
      </Text>,
    );

    fireEvent.press(screen.getByLabelText('Translation note: my blood'));
    expect(onPress).toHaveBeenCalled();
  });

  it('reads a phrase once: later words are hidden from TalkBack', () => {
    render(
      <Text>
        <Word word="my" variant="phrase" onPress={jest.fn()} testID="w1" />
        <Word
          word="blood"
          variant="phrase"
          onPress={jest.fn()}
          hiddenFromAccessibility
          testID="w2"
        />
      </Text>,
    );

    expect(screen.getByTestId('w1').props.importantForAccessibility).toBe(
      'auto',
    );
    expect(
      screen.getByTestId('w2', { includeHiddenElements: true }).props
        .importantForAccessibility,
    ).toBe('no-hide-descendants');
  });

  it('stays one width whether a joined phrase is focused or at rest', () => {
    const box = (variant: 'note' | 'phrase') => {
      render(<Word word="my" variant={variant} joinEnd testID={variant} />);
      const style = StyleSheet.flatten(screen.getByTestId(variant).props.style);
      const edge = (border?: number, padding?: unknown) =>
        (border ?? style.borderWidth ?? 0) +
        Number(padding ?? style.paddingHorizontal ?? 0);
      return {
        start: edge(style.borderLeftWidth, style.paddingLeft),
        end: edge(style.borderRightWidth, style.paddingRight),
      };
    };

    expect(box('phrase')).toEqual(box('note'));
  });

  it('is plain text without a press', () => {
    render(<Word word="which" variant="plain" testID="w" />);

    expect(screen.getByText('which')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
