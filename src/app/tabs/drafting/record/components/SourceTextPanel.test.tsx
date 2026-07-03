import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SourceTextPanel } from './SourceTextPanel';

describe('SourceTextPanel', () => {
  it('is collapsed by default and toggles open', () => {
    render(<SourceTextPanel sourceText="In the beginning" />);

    expect(screen.queryByTestId('record-source-body')).toBeNull();
    fireEvent.press(screen.getByTestId('record-source-toggle'));
    expect(screen.getByTestId('record-source-body')).toHaveTextContent(
      'In the beginning',
    );
  });
});
