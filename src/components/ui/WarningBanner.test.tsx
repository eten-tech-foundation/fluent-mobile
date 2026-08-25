import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { TriangleAlert } from 'lucide-react-native';
import {
  RECORD_AUDIO_CONFLICT_WARNING,
  RECORD_TAKEN_CHAPTER_WARNING,
} from '../../constants/messages';
import { WarningBanner } from './WarningBanner';

describe('WarningBanner', () => {
  it('renders default info variant with message and no icon', () => {
    render(<WarningBanner message={RECORD_TAKEN_CHAPTER_WARNING} />);

    expect(screen.getByTestId('warning-banner')).toBeTruthy();
    expect(screen.getByText(RECORD_TAKEN_CHAPTER_WARNING)).toBeTruthy();
  });

  it('renders amber variant with icon and message', () => {
    render(
      <WarningBanner
        variant="amber"
        icon={TriangleAlert}
        message={RECORD_AUDIO_CONFLICT_WARNING}
      />,
    );

    expect(screen.getByTestId('warning-banner')).toBeTruthy();
    expect(screen.getByText(RECORD_AUDIO_CONFLICT_WARNING)).toBeTruthy();
  });
});
