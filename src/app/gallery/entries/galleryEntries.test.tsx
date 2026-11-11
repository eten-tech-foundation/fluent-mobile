import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { galleryEntries, gallerySections } from '.';
import { IconsEntry } from './IconsEntry';
import { NoteEntry } from './NoteEntry';
import { TakeFanEntry } from './TakeFanEntry';
import { WaveformEntry } from './WaveformEntry';
import * as icons from '../../../components/ui/icons';
import { UNDO_MS } from '../../../hooks/usePendingDelete';
import { mockPreferenceStore } from '../../../test/mocks/preferenceStore';
import { UiVersionOverride } from '../../../theme/useTheme';

jest.mock('../../../assets/icons/trash-open.svg', () => {
  const MockReact = require('react');
  const { View } = require('react-native');
  return () => MockReact.createElement(View);
});

jest.mock('../../../services/storage', () => ({
  kvStorage: { getItemSync: jest.fn(), setItemSync: jest.fn() },
  MAX_DEVICE_ACCOUNTS: 3,
}));

function renderNext(node: React.ReactElement) {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <UiVersionOverride value="next">{node}</UiVersionOverride>
    </SafeAreaProvider>,
  );
}

describe('galleryEntries', () => {
  beforeEach(() => mockPreferenceStore());

  it('gives every entry its own id and every section an entry', () => {
    const ids = galleryEntries.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of gallerySections) {
      expect(galleryEntries.some(e => e.section === section)).toBe(true);
    }
  });

  it('pins every entry designed only for Hardware', () => {
    const hardwareOnly = galleryEntries.filter(
      e => e.modes.startsWith('Hardware') && !/Canvas|Accent/.test(e.modes),
    );
    expect(hardwareOnly.length).toBeGreaterThan(0);
    for (const e of hardwareOnly) expect(e.pin).toBe('hardware');
  });

  it('shows every Next icon in the Icons entry', () => {
    renderNext(<IconsEntry />);
    for (const name of Object.keys(icons)) {
      expect(screen.getByTestId(`gallery-icon-${name}`)).toBeTruthy();
    }
  });

  it.each(galleryEntries.map(e => [e.name, e] as const))(
    'renders %s under Next',
    (_, entry) => {
      const { unmount } = renderNext(<entry.Component />);
      unmount();
    },
  );
});

describe('TakeFanEntry', () => {
  beforeEach(() => {
    mockPreferenceStore();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('records a take into the fan and brings it to the front', () => {
    renderNext(<TakeFanEntry />);

    fireEvent.press(screen.getByTestId('gallery-take-record'));
    act(() => jest.advanceTimersByTime(1000));
    fireEvent.press(screen.getByTestId('gallery-take-eject'));

    expect(screen.getByText('v. 23 · Take 3')).toBeTruthy();
    expect(screen.getByText('3 of 5 takes on v. 23')).toBeTruthy();
  });

  it('offers Undo on the card after a take is deleted, then lets it go', () => {
    renderNext(<TakeFanEntry />);

    fireEvent(screen.getByLabelText('Take 1'), 'accessibilityAction', {
      nativeEvent: { actionName: 'delete' },
    });
    fireEvent.press(screen.getByLabelText('Undo deleting v. 23 · Take 1'));
    expect(screen.getByText('2 of 5 takes on v. 23')).toBeTruthy();

    fireEvent(screen.getByLabelText('Take 1'), 'accessibilityAction', {
      nativeEvent: { actionName: 'delete' },
    });
    act(() => jest.advanceTimersByTime(UNDO_MS));
    expect(screen.getByText('1 of 5 takes on v. 23')).toBeTruthy();
  });
});

describe('WaveformEntry', () => {
  beforeEach(() => mockPreferenceStore());

  it('steps verses with Previous and Next, off at the ends', () => {
    renderNext(<WaveformEntry />);

    expect(screen.getByLabelText('Previous')).toBeDisabled();
    fireEvent.press(screen.getByLabelText('Next: verse 23'));
    expect(screen.getByLabelText('Previous: verse 22')).toBeTruthy();
    expect(screen.getByLabelText('Next: verse 24')).toBeTruthy();
  });
});

describe('NoteEntry', () => {
  beforeEach(() => mockPreferenceStore());

  it('steps notes with the keys and closes from the header', () => {
    renderNext(<NoteEntry />);

    fireEvent.press(
      screen.getByLabelText('Next note: My blood of the covenant,'),
    );
    expect(screen.getByLabelText('Note 2 of 3')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Close the note'));
    expect(screen.getByText('Open the note again')).toBeTruthy();
  });
});
