import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { PassageCover, type PassageCoverProps } from './PassageCover';
import * as generator from './coverArt/generator';
import { resolveTheme } from '../../theme';
import { UiVersionOverride } from '../../theme/useTheme';
import { measureFace } from '../../test/coverBadge';
import { mockPreferenceStore } from '../../test/mocks/preferenceStore';

jest.mock('../../services/storage', () => ({
  kvStorage: {
    getItemSync: jest.fn(),
    setItemSync: jest.fn(),
  },
}));

function cover(overrides: Partial<PassageCoverProps> = {}) {
  return (
    <PassageCover
      eyebrow="Mark 14"
      verses="22–25"
      title="The Last Supper"
      reference="Mark 14:22–25"
      seed="Mark:pericope::2"
      groupSeed="Mark:14"
      recordedVerses={0}
      totalVerses={4}
      testID="cover"
      {...overrides}
    />
  );
}

const hidden = { includeHiddenElements: true };

const measure = () => measureFace('cover-face');

describe('PassageCover', () => {
  beforeEach(() => {
    mockPreferenceStore();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('says the title, reference and status, and opens on tap', () => {
    const onPress = jest.fn();
    render(cover({ recordedVerses: 2, onPress }));

    fireEvent.press(
      screen.getByRole('button', {
        name: 'The Last Supper, Mark 14:22–25, Partly recorded',
      }),
    );
    expect(onPress).toHaveBeenCalled();
    expect(screen.queryByText('Partly recorded')).toBeNull();
  });

  it('shows no title under the cover without a pericope title', () => {
    render(cover({ title: undefined }));
    expect(screen.queryByText('Mark 14:22–25')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Mark 14:22–25, Not recorded yet' }),
    ).toBeTruthy();
  });

  it('draws some art before anything is recorded', () => {
    const spec = jest.spyOn(generator, 'coverArtSpec');
    render(cover());
    expect(spec).toHaveBeenCalledWith(
      expect.objectContaining({ progress: generator.artProgress(0) }),
      expect.anything(),
    );
  });

  it('draws on the lighter surface ground', () => {
    render(<UiVersionOverride value="next">{cover()}</UiVersionOverride>);

    const face = screen.getByTestId('cover-face');
    expect(StyleSheet.flatten(face.props.style).backgroundColor).toBe(
      resolveTheme('next', 'canvas').roles.surfaceDefault,
    );
  });

  it.each([
    ['Not recorded yet', 0],
    ['Partly recorded', 2],
    ['Recorded', 4],
  ])('has no badge while it is %s', (status, recordedVerses) => {
    render(cover({ recordedVerses }));
    measure();
    expect(screen.queryByTestId('cover-badge', hidden)).toBeNull();
    expect(
      screen.getByRole('button', {
        name: `The Last Supper, Mark 14:22–25, ${status}`,
      }),
    ).toBeTruthy();
  });

  it('waits to draw the badge until the cover is measured', () => {
    render(cover({ recordedVerses: 4, submitted: true }));
    expect(screen.queryByTestId('cover-badge', hidden)).toBeNull();
    measure();
    expect(screen.getByTestId('cover-badge', hidden)).toBeTruthy();
  });

  it('shows a static peer check badge, with no progress to fake', () => {
    render(cover({ recordedVerses: 4, submitted: true }));
    measure();
    expect(screen.getByTestId('cover-badge-peer-check', hidden)).toBeTruthy();
    expect(screen.queryByTestId('cover-badge-ring', hidden)).toBeNull();
    expect(screen.queryByTestId('cover-badge-check', hidden)).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'The Last Supper, Mark 14:22–25, In peer check',
      }),
    ).toBeTruthy();
  });

  it('shows a cloud while its send waits to go up', () => {
    render(cover({ recordedVerses: 4, waitingToSend: true }));
    measure();
    expect(screen.getByTestId('cover-badge-waiting', hidden)).toBeTruthy();
    expect(screen.queryByTestId('cover-badge-ring', hidden)).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'The Last Supper, Mark 14:22–25, Waiting to send',
      }),
    ).toBeTruthy();
  });

  it('waits to send before it reads as in peer check', () => {
    render(cover({ recordedVerses: 4, waitingToSend: true, submitted: true }));
    measure();
    expect(
      screen.getByRole('button', {
        name: 'The Last Supper, Mark 14:22–25, Waiting to send',
      }),
    ).toBeTruthy();
  });

  it('shows a check once it passes peer check', () => {
    render(cover({ recordedVerses: 4, submitted: true, peerChecked: true }));
    measure();
    expect(screen.getByTestId('cover-badge-check', hidden)).toBeTruthy();
    expect(screen.queryByTestId('cover-badge-ring', hidden)).toBeNull();
    expect(
      screen.getByRole('button', {
        name: 'The Last Supper, Mark 14:22–25, Peer checked',
      }),
    ).toBeTruthy();
  });
});
