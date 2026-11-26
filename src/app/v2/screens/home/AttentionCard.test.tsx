import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { AttentionCard } from './AttentionCard';

jest.mock('../../../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

describe('AttentionCard', () => {
  it('reads as one sentence and one button', async () => {
    const onPress = jest.fn();
    await render(
      <AttentionCard
        eyebrow="Community notes"
        title="6 notes from 3 reviewers"
        actionLabel="Open review"
        faces={['RK', 'AM', 'JS']}
        onPress={onPress}
        testID="card"
      />,
    );
    expect(
      screen.getByTestId('card-faces', { includeHiddenElements: true }),
    ).toBeTruthy();

    expect(screen.getByText('Community notes')).toBeTruthy();
    expect(screen.getByText('6 notes from 3 reviewers')).toBeTruthy();
    expect(screen.getByText('Open review')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(
      screen.getByText('AM', { includeHiddenElements: true }),
    ).toBeTruthy();

    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Community notes. 6 notes from 3 reviewers. Open review.',
      }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows no faces when nobody is named', async () => {
    await render(
      <AttentionCard
        eyebrow="Changes requested"
        title="Your Matthew 2 has notes to address"
        actionLabel="Make changes"
        onPress={jest.fn()}
        testID="card"
      />,
    );

    expect(
      screen.queryByTestId('card-faces', { includeHiddenElements: true }),
    ).toBeNull();
  });
});
