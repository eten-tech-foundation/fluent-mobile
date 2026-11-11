import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DraftingHeader } from './DraftingHeader';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 0, left: 0, right: 0 }),
}));

describe('DraftingHeader', () => {
  it('renders the title with back control', () => {
    render(<DraftingHeader title="Genesis 1" onBack={jest.fn()} />);

    expect(screen.getByText('Genesis 1')).toBeTruthy();
    expect(screen.getByLabelText('Go back')).toBeTruthy();
  });

  it('renders sync control when status and handler are provided', () => {
    render(
      <DraftingHeader
        title="Genesis 1"
        onBack={jest.fn()}
        syncStatus="online_synced"
        onSyncPress={jest.fn()}
      />,
    );

    expect(screen.getByText('Genesis 1')).toBeTruthy();
    expect(
      screen.getByLabelText('Online · all synced. Open Sync page.'),
    ).toBeTruthy();
  });

  it('shows a visible subtitle while drafting holds pending uploads', () => {
    const { rerender } = render(
      <DraftingHeader
        title="Genesis 1"
        onBack={jest.fn()}
        syncStatus="online_pending"
        heldForDrafting
        onSyncPress={jest.fn()}
      />,
    );
    expect(
      screen.getByText('Uploads wait until you leave drafting'),
    ).toBeTruthy();

    rerender(
      <DraftingHeader
        title="Genesis 1"
        onBack={jest.fn()}
        syncStatus="online_uploading"
        heldForDrafting
        onSyncPress={jest.fn()}
      />,
    );
    expect(
      screen.queryByText('Uploads wait until you leave drafting'),
    ).toBeNull();
  });
});
