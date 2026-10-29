import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ChangesRequested, sampleSentBack } from './ChangesRequested';
import { isDevPreviewChangesRequestedEnabled } from '../../../../config/devPreviewChangesRequested';
import type { MyWorkChapter } from '../../../../types/db/types';

jest.mock('../../../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));

jest.mock('../../../../config/devPreviewChangesRequested', () => ({
  isDevPreviewChangesRequestedEnabled: jest.fn(),
}));

const mockEnabled = isDevPreviewChangesRequestedEnabled as jest.Mock;

function chapter(
  id: number,
  overrides: Partial<MyWorkChapter> = {},
): MyWorkChapter {
  return {
    id,
    displayLabel: `Mark ${id}`,
    workflowStage: 'draft',
    ownershipState: 'mine',
    completedVerses: 0,
    ...overrides,
  } as MyWorkChapter;
}

describe('sampleSentBack', () => {
  it('prefers a draft of mine with something recorded', () => {
    const recorded = chapter(2, { completedVerses: 4 });
    expect(sampleSentBack([chapter(1), recorded])).toBe(recorded);
  });

  it('falls back to my first draft, and to nothing without one', () => {
    const first = chapter(1);
    expect(sampleSentBack([first, chapter(2)])).toBe(first);
    expect(
      sampleSentBack([chapter(3, { ownershipState: 'other' })]),
    ).toBeNull();
  });
});

describe('ChangesRequested', () => {
  it("shows the sample on one of my drafts and opens that chapter's first passage", () => {
    mockEnabled.mockReturnValue(true);
    const onOpen = jest.fn();
    const recorded = chapter(2, { completedVerses: 4 });
    render(
      <ChangesRequested chapters={[chapter(1), recorded]} onOpen={onOpen} />,
    );

    fireEvent.press(
      screen.getByRole('button', {
        name: 'Changes requested. Ravi left 3 notes on your Mark 2. Make changes.',
      }),
    );
    expect(onOpen).toHaveBeenCalledWith(recorded, 1);
  });

  it('renders nothing unless the dev preview is on', () => {
    mockEnabled.mockReturnValue(false);
    render(<ChangesRequested chapters={[chapter(1)]} onOpen={jest.fn()} />);

    expect(screen.queryByTestId('home-changes-requested')).toBeNull();
  });
});
